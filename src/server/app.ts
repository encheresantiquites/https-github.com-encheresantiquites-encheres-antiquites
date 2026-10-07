import express from 'express';
import { db, withDbRetry } from '../db/index.ts';
import {
  users,
  sales,
  lots,
  bids,
  bidHistory,
  orders,
  payments,
  transactionDocuments,
  auditLogs,
  systemSettings,
  chatMessages,
} from '../db/schema.ts';
import { eq, and, desc, asc, sql, ilike, or } from 'drizzle-orm';
import { requireAuth, requireAdmin, requireApprovedBidder, optionalAuth, type AuthRequest } from '../middleware/auth.ts';
import { placeProxyBid, closeExpiredLot, getNextStandardLotSchedule } from './auction-engine.ts';
import { createPayPalOrder, captureAndVerifyPayPalPayment } from './paypal.ts';
import { getChatScheduleStatus } from '../lib/chat-schedule.ts';
import { realtimeHub } from './realtime.ts';
import { DEFAULT_LOTS, getFilteredDefaultLots } from '../data/default-lots.ts';

export const app = express();
app.use(express.json());

// Proxy d'images sécurisé avec cache pour garantir la visibilité de toutes les photos en production
app.get('/api/image-proxy', async (req, res) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl || (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://'))) {
    return res.status(400).send('Invalid url');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const upstream = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(upstream.status).send('Upstream image error');
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    res.status(502).send('Image proxy error');
  }
});

// Auto-initialisation si la base est connectée mais vide (nouveau déploiement Render / Neon)
setTimeout(async () => {
  try {
    const existing = await withDbRetry(() => db.select({ count: sql`count(*)` }).from(lots));
    const count = Number(existing[0]?.count || 0);
    if (count === 0) {
      console.log('Initialisation du catalogue de lots dans la base...');
      for (const item of DEFAULT_LOTS) {
        await withDbRetry(() =>
          db.insert(lots).values({
            ...item,
            endsAt: new Date(item.endsAt),
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
            updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
          } as any)
        );
      }
      console.log('Catalogue initialisé avec succès dans la base de données.');
    }
  } catch (err: any) {
    // Si la base n'est pas encore créée ou configurée, le serveur fonctionne avec le catalogue en mémoire
  }
}, 1500);

// Background tick to auto-close expired lots
setInterval(async () => {
  try {
    const expiredActiveLots = await withDbRetry(() =>
      db
        .select({ id: lots.id })
        .from(lots)
        .where(and(eq(lots.status, 'ACTIVE'), sql`${lots.endsAt} <= NOW()`))
    );

    for (const item of expiredActiveLots) {
      await closeExpiredLot(item.id);
    }
  } catch (err) {
    console.error('Error checking expired lots:', err);
  }
}, 10000); // Toutes les 10 secondes

/* ==========================================================================
   PUBLIC & AUTH ENDPOINTS
   ========================================================================== */

// Récupère l'utilisateur connecté et son profil complet
app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    res.json({
      user: req.dbUser,
      firebaseUser: {
        uid: req.user?.uid,
        email: req.user?.email,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mise à jour du profil professionnel
app.put('/api/me/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const {
      firstName,
      lastName,
      phone,
      companyName,
      activity,
      country,
      vatNumber,
      website,
      addressLine1,
      addressLine2,
      postalCode,
      city,
    } = req.body;

    const updated = await db
      .update(users)
      .set({
        firstName,
        lastName,
        phone,
        companyName,
        activity,
        country,
        vatNumber,
        website,
        addressLine1,
        addressLine2,
        postalCode,
        city,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    await db.insert(auditLogs).values({
      userId,
      userEmail: req.dbUser!.email,
      action: 'UPDATE_PROFILE',
      entityType: 'USER',
      entityId: String(userId),
      details: 'Mise à jour des coordonnées professionnelles',
    });

    res.json({ user: updated[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Acceptation des conditions de participation
app.post('/api/me/accept-terms', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const updated = await db
      .update(users)
      .set({
        acceptedTerms: true,
        acceptedTermsAt: new Date(),
        acceptedTermsVersion: 'v1.0 (2026)',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    await db.insert(auditLogs).values({
      userId,
      userEmail: req.dbUser!.email,
      action: 'ACCEPT_TERMS',
      entityType: 'USER',
      entityId: String(userId),
      details: 'Acceptation formelle des conditions de vente v1.0',
    });

    res.json({ success: true, user: updated[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

import crypto from 'crypto';

const hashPassword = (password: string) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

// Connexion login / mot de passe pour les professionnels
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Veuillez saisir votre adresse email et mot de passe.' });
    }

    const cleanEmail = String(email).toLowerCase().trim();

    // 1. Accès garanti pour le compte de test professionnel
    if (cleanEmail === 'client.test@enchere-antiquites.fr' && password === 'client123') {
      let testUser: any = null;
      try {
        const userRes = await withDbRetry(() => db.select().from(users).where(eq(users.email, cleanEmail)));
        if (userRes.length > 0) testUser = userRes[0];
      } catch (dbErr) {
        console.warn('DB warning during test user fetch, using memory fallback:', dbErr);
      }

      if (!testUser) {
        testUser = {
          id: 5,
          uid: 'client_test_demo_uid',
          email: 'client.test@enchere-antiquites.fr',
          role: 'CUSTOMER',
          status: 'APPROVED',
          emailVerified: true,
          firstName: 'Pierre',
          lastName: 'Beaumont',
          phone: '+33 6 12 34 56 78',
          companyName: 'Antiquités Beaumont & Fils',
          activity: "Antiquaire & Expert d'art",
          country: 'France',
          vatNumber: 'FR32987654321',
          website: null,
          addressLine1: '14 rue des Beaux-Arts',
          addressLine2: null,
          postalCode: '75006',
          city: 'Paris',
          acceptedTerms: true,
          acceptedTermsVersion: 'v1.0 (2026)',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      const token = `TOKEN_${Buffer.from(cleanEmail).toString('base64')}`;
      return res.json({
        success: true,
        user: testUser,
        token,
      });
    }

    // 2. Connexion standard via PostgreSQL avec reprise automatique
    let userRes: any[] = [];
    try {
      userRes = await withDbRetry(() => db.select().from(users).where(eq(users.email, cleanEmail)));
    } catch (dbErr: any) {
      console.error('Database error in /api/login:', dbErr);
      return res.status(500).json({
        error: 'Connexion temporairement indisponible suite à une mise en veille de la base. Veuillez réessayer dans quelques secondes.',
      });
    }

    if (userRes.length === 0) {
      return res.status(401).json({
        error: 'Identifiants incorrects. Pas encore client ? Cliquez sur Inscription pour créer votre compte.',
      });
    }

    const user = userRes[0];
    const hashed = hashPassword(password);

    // Si mot de passe déjà configuré, vérifier
    if (user.passwordHash && user.passwordHash !== hashed) {
      return res.status(401).json({ error: 'Mot de passe incorrect.' });
    }

    // Si premier accès sur compte déjà présent, enregistrer le mot de passe
    if (!user.passwordHash) {
      try {
        await withDbRetry(() => db.update(users).set({ passwordHash: hashed }).where(eq(users.id, user.id)));
      } catch {}
    }

    const token = `TOKEN_${Buffer.from(cleanEmail).toString('base64')}`;

    res.json({
      success: true,
      user,
      token,
    });
  } catch (err: any) {
    console.error('Error in /api/login:', err);
    res.status(500).json({ error: 'Une erreur est survenue lors de la connexion. Veuillez réessayer.' });
  }
});

// Inscription directe d'un professionnel avec mot de passe et captcha
app.post('/api/register', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phone,
      companyName,
      activity,
      country,
      vatNumber,
      website,
      addressLine1,
      addressLine2,
      postalCode,
      city,
      acceptedTerms,
      captchaAnswer,
      captchaExpected,
    } = req.body;

    if (!email || !password || !firstName || !lastName || !companyName) {
      return res.status(400).json({ error: 'Veuillez remplir tous les champs obligatoires (*).' });
    }

    if (String(password).length < 4) {
      return res.status(400).json({ error: 'Le mot de passe doit comporter au moins 4 caractères.' });
    }

    if (String(captchaAnswer || '').trim().toUpperCase() !== String(captchaExpected || '').trim().toUpperCase()) {
      return res.status(400).json({ error: 'Code de sécurité anti-robot (captcha) incorrect.' });
    }

    if (!acceptedTerms) {
      return res.status(400).json({ error: 'Veuillez accepter les conditions de participation.' });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const existing = await db.select().from(users).where(eq(users.email, cleanEmail));
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Un compte professionnel existe déjà avec cette adresse email.' });
    }

    const newUid = `pro_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const passwordHash = hashPassword(password);

    const inserted = await db
      .insert(users)
      .values({
        uid: newUid,
        email: cleanEmail,
        passwordHash,
        role: 'CUSTOMER',
        status: 'PENDING',
        emailVerified: true,
        firstName,
        lastName,
        phone,
        companyName,
        activity,
        country: country || 'France',
        vatNumber,
        website,
        addressLine1,
        addressLine2,
        postalCode,
        city,
        acceptedTerms: true,
        acceptedTermsAt: new Date(),
        acceptedTermsVersion: 'v1.0 (2026)',
      })
      .returning();

    await db.insert(auditLogs).values({
      userId: inserted[0].id,
      userEmail: cleanEmail,
      action: 'REGISTER_PRO_DIRECT',
      entityType: 'USER',
      entityId: String(inserted[0].id),
      details: `Nouvelle demande d'inscription professionnelle: ${companyName} (${activity || 'Antiquaire'})`,
    });

    const token = `TOKEN_${Buffer.from(cleanEmail).toString('base64')}`;

    res.json({
      success: true,
      user: inserted[0],
      token,
      message: 'Votre demande d’inscription a été enregistrée avec succès. Elle est transmise au vendeur pour validation.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Tous les lots avec filtrage : current, ended, upcoming
app.get('/api/lots', async (req, res) => {
  try {
    const filter = (req.query.filter as string) || 'current';

    // RÈGLE D'OR : vérifier et traiter immédiatement tout lot dont le temps est imparti
    try {
      const expiredActiveLots = await withDbRetry(() =>
        db
          .select({ id: lots.id })
          .from(lots)
          .where(and(eq(lots.status, 'ACTIVE'), sql`${lots.endsAt} <= NOW()`))
      );
      for (const item of expiredActiveLots) {
        await closeExpiredLot(item.id);
      }
    } catch (e) {
      console.warn('Check expired lots on GET /api/lots warning:', e);
    }

    let query;

    if (filter === 'ended') {
      // Enchères terminées (uniquement les objets vendus ou clos ayant eu des enchères)
      query = db
        .select({
          id: lots.id,
          saleId: lots.saleId,
          reference: lots.reference,
          title: lots.title,
          description: lots.description,
          category: lots.category,
          period: lots.period,
          dimensions: lots.dimensions,
          weight: lots.weight,
          conditionReport: lots.conditionReport,
          flaws: lots.flaws,
          observations: lots.observations,
          startingPriceCents: lots.startingPriceCents,
          currentPriceCents: lots.currentPriceCents,
          bidCount: lots.bidCount,
          currentWinnerId: lots.currentWinnerId,
          status: lots.status,
          endsAt: lots.endsAt,
          images: lots.images,
        })
        .from(lots)
        .where(
          or(
            eq(lots.status, 'SOLD'),
            eq(lots.status, 'CLOSED')
          )
        )
        .orderBy(desc(lots.endsAt));
    } else if (filter === 'upcoming') {
      // Prochaines enchères (inclut les objets invendus automatiquement replacés)
      query = db
        .select({
          id: lots.id,
          saleId: lots.saleId,
          reference: lots.reference,
          title: lots.title,
          description: lots.description,
          category: lots.category,
          period: lots.period,
          dimensions: lots.dimensions,
          weight: lots.weight,
          conditionReport: lots.conditionReport,
          flaws: lots.flaws,
          observations: lots.observations,
          startingPriceCents: lots.startingPriceCents,
          currentPriceCents: lots.currentPriceCents,
          bidCount: lots.bidCount,
          currentWinnerId: lots.currentWinnerId,
          status: lots.status,
          endsAt: lots.endsAt,
          images: lots.images,
        })
        .from(lots)
        .where(
          or(
            eq(lots.status, 'DRAFT'),
            eq(lots.status, 'SCHEDULED'),
            eq(lots.status, 'UPCOMING')
          )
        )
        .orderBy(asc(lots.endsAt));
    } else {
      // current (en cours d'enchère active)
      query = db
        .select({
          id: lots.id,
          saleId: lots.saleId,
          reference: lots.reference,
          title: lots.title,
          description: lots.description,
          category: lots.category,
          period: lots.period,
          dimensions: lots.dimensions,
          weight: lots.weight,
          conditionReport: lots.conditionReport,
          flaws: lots.flaws,
          observations: lots.observations,
          startingPriceCents: lots.startingPriceCents,
          currentPriceCents: lots.currentPriceCents,
          bidCount: lots.bidCount,
          currentWinnerId: lots.currentWinnerId,
          status: lots.status,
          endsAt: lots.endsAt,
          images: lots.images,
        })
        .from(lots)
        .where(eq(lots.status, 'ACTIVE'))
        .orderBy(asc(lots.endsAt));
    }

    const results = await withDbRetry(() => query);
    let enrichedLots = results.map((l: any) => ({
      ...l,
      userMaxBidCents: null,
      isWinning: false,
    }));

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split('Bearer ')[1];
        let currentUserId: number | undefined;

        if (token.startsWith('TOKEN_')) {
          const email = Buffer.from(token.replace(/^TOKEN_/, ''), 'base64').toString('utf-8');
          const userDb = await withDbRetry(() => db.select().from(users).where(eq(users.email, email)));
          if (userDb.length > 0) currentUserId = userDb[0].id;
        } else {
          const { adminAuth } = await import('../lib/firebase-admin.ts');
          const decoded = await adminAuth.verifyIdToken(token);
          const userDb = await withDbRetry(() => db.select().from(users).where(eq(users.uid, decoded.uid)));
          if (userDb.length > 0) currentUserId = userDb[0].id;
        }

        if (currentUserId) {
          const userBids = await withDbRetry(() =>
            db.select().from(bids).where(eq(bids.userId, currentUserId))
          );

          const userBidsByLot: Record<number, number> = {};
          userBids.forEach((b) => {
            if (!userBidsByLot[b.lotId] || b.maxBidCents > userBidsByLot[b.lotId]) {
              userBidsByLot[b.lotId] = b.maxBidCents;
            }
          });

          enrichedLots = results.map((l: any) => {
            const maxBid = userBidsByLot[l.id] || null;
            const isWinner = maxBid !== null && l.currentWinnerId === currentUserId;
            return {
              ...l,
              userMaxBidCents: maxBid,
              isWinning: isWinner,
            };
          });
        }
      } catch (e) {
        // Ignorer si token invalide
      }
    }

    if (!enrichedLots || enrichedLots.length === 0) {
      enrichedLots = getFilteredDefaultLots(filter as any);
    }

    res.json({ lots: enrichedLots });
  } catch (err: any) {
    console.warn('[GET /api/lots] Repli sur le catalogue authentique:', err?.message || err);
    const filter = (req.query.filter as string) || 'current';
    res.json({ lots: getFilteredDefaultLots(filter as any) });
  }
});

// Paramètres publics du vendeur particulier
app.get('/api/seller-info', async (req, res) => {
  try {
    const settings = await db.select().from(systemSettings);
    const settingsMap: Record<string, string> = {};
    settings.forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    res.json({
      sellerType: settingsMap['seller_type'] || 'PRIVATE_INDIVIDUAL',
      sellerName: settingsMap['seller_name'] || 'Monsieur De Coster',
      sellerStatus: settingsMap['seller_status'] || 'Vendeur particulier',
      sellerDescription:
        settingsMap['seller_description'] ||
        'Collections familiales de grands-parents et parents collectionneurs',
      sellerLocation: settingsMap['seller_location'] || 'Lille / Bruxelles',
      sellerEmail: settingsMap['seller_email'] || 'contact@encheres-antiquites.com',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vente en cours / catalogue actif
app.get('/api/sales/current', async (req, res) => {
  try {
    const currentSales = await db
      .select()
      .from(sales)
      .where(or(eq(sales.status, 'LIVE'), eq(sales.status, 'SCHEDULED')))
      .orderBy(desc(sales.startsAt))
      .limit(1);

    if (currentSales.length === 0) {
      // Retourner la dernière vente même fermée
      const lastSales = await db
        .select()
        .from(sales)
        .orderBy(desc(sales.id))
        .limit(1);
      return res.json({ sale: lastSales[0] || null });
    }

    res.json({ sale: currentSales[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Lots d'une vente (avec masquage strict des données confidentielles)
app.get('/api/sales/:id/lots', async (req, res) => {
  try {
    const saleId = parseInt(req.params.id);
    const saleLots = await db
      .select({
        id: lots.id,
        saleId: lots.saleId,
        reference: lots.reference,
        title: lots.title,
        description: lots.description,
        category: lots.category,
        period: lots.period,
        dimensions: lots.dimensions,
        weight: lots.weight,
        conditionReport: lots.conditionReport,
        flaws: lots.flaws,
        observations: lots.observations,
        startingPriceCents: lots.startingPriceCents,
        currentPriceCents: lots.currentPriceCents,
        bidCount: lots.bidCount,
        status: lots.status,
        endsAt: lots.endsAt,
        images: lots.images,
      })
      .from(lots)
      .where(eq(lots.saleId, saleId))
      .orderBy(asc(lots.id));

    res.json({ lots: saleLots });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Détail d'un lot avec historique public anonymisé et maximum privé de l'utilisateur connecté
app.get('/api/lots/:id', async (req: AuthRequest, res) => {
  try {
    const lotId = parseInt(req.params.id);
    const lotRes = await withDbRetry(() => db.select().from(lots).where(eq(lots.id, lotId)));

    if (lotRes.length === 0) {
      return res.status(404).json({ error: 'Lot introuvable.' });
    }

    const lot = lotRes[0];

    // Historique public (anonymisé)
    const history = await withDbRetry(() =>
      db
        .select({
          id: bidHistory.id,
          publicBidderId: bidHistory.publicBidderId,
          amountCents: bidHistory.amountCents,
          createdAt: bidHistory.createdAt,
        })
        .from(bidHistory)
        .where(eq(bidHistory.lotId, lotId))
        .orderBy(desc(bidHistory.createdAt))
    );

    // Vérifier si un token auth est présent pour récupérer le montant max confidentiel de ce client
    let userMaxBidCents: number | null = null;
    let isWinning = false;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split('Bearer ')[1];
        let currentUserId: number | undefined;

        if (token.startsWith('TOKEN_')) {
          const email = Buffer.from(token.replace(/^TOKEN_/, ''), 'base64').toString('utf-8');
          const userDb = await withDbRetry(() => db.select().from(users).where(eq(users.email, email)));
          if (userDb.length > 0) currentUserId = userDb[0].id;
        } else {
          const { adminAuth } = await import('../lib/firebase-admin.ts');
          const decoded = await adminAuth.verifyIdToken(token);
          const userDb = await withDbRetry(() => db.select().from(users).where(eq(users.uid, decoded.uid)));
          if (userDb.length > 0) currentUserId = userDb[0].id;
        }

        if (currentUserId) {
          const userBid = await withDbRetry(() =>
            db
              .select()
              .from(bids)
              .where(and(eq(bids.lotId, lotId), eq(bids.userId, currentUserId)))
              .orderBy(desc(bids.maxBidCents))
              .limit(1)
          );

          if (userBid.length > 0) {
            userMaxBidCents = userBid[0].maxBidCents;
            isWinning = lot.currentWinnerId === currentUserId;
          }
        }
      } catch (e) {
        // Ignorer si token invalide pour requête publique
      }
    }

    // Objet public sécurisé (SANS coût d'achat, SANS prix de réserve, SANS données concurrentes)
    const publicLot = {
      id: lot.id,
      saleId: lot.saleId,
      reference: lot.reference,
      title: lot.title,
      description: lot.description,
      category: lot.category,
      period: lot.period,
      dimensions: lot.dimensions,
      weight: lot.weight,
      conditionReport: lot.conditionReport,
      flaws: lot.flaws,
      observations: lot.observations,
      startingPriceCents: lot.startingPriceCents,
      currentPriceCents: lot.currentPriceCents,
      bidCount: lot.bidCount,
      status: lot.status,
      endsAt: lot.endsAt,
      images: lot.images,
      userMaxBidCents, // STRICTEMENT le max de l'utilisateur connecté
      isWinning,
    };

    res.json({ lot: publicLot, history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   BIDDING ENGINE ENDPOINT
   ========================================================================== */

app.post('/api/lots/:id/bid', requireAuth, requireApprovedBidder, async (req: AuthRequest, res) => {
  try {
    const lotId = parseInt(req.params.id);
    const { maxBidCents } = req.body;

    if (!maxBidCents || typeof maxBidCents !== 'number' || maxBidCents <= 0) {
      return res.status(400).json({ error: 'Montant d’enchère maximum invalide.' });
    }

    const ip = req.ip || req.headers['x-forwarded-for']?.toString();
    const result = await placeProxyBid(lotId, req.dbUser!.id, maxBidCents, ip);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json(result);
  } catch (err: any) {
    console.error('Erreur placement enchère:', err);
    res.status(500).json({ error: err.message || 'Erreur lors du traitement de l’enchère.' });
  }
});

/* ==========================================================================
   REALTIME MULTI-USER SSE STREAM (ENCHÈRES EN DIRECT INSTANTANÉES)
   ========================================================================== */

app.get('/api/realtime/stream', async (req, res) => {
  // SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const sessionId = (req.query.sessionId as string) || clientId;
  let userId: number | undefined;

  // Détection éventuelle de l'utilisateur connecté via token (Firebase ou credentials TOKEN_)
  const token = (req.query.token as string) || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split('Bearer ')[1] : undefined);
  if (token) {
    try {
      if (token.startsWith('TOKEN_')) {
        const email = Buffer.from(token.replace(/^TOKEN_/, ''), 'base64').toString('utf-8');
        const userDb = await withDbRetry(() => db.select().from(users).where(eq(users.email, email)));
        if (userDb.length > 0) userId = userDb[0].id;
      } else {
        const { adminAuth } = await import('../lib/firebase-admin.ts');
        const decoded = await adminAuth.verifyIdToken(token);
        const userDb = await withDbRetry(() => db.select().from(users).where(eq(users.uid, decoded.uid)));
        if (userDb.length > 0) {
          userId = userDb[0].id;
        }
      }
    } catch {
      // Ignorer si token invalide
    }
  }

  const initialLotId = req.query.lotId ? parseInt(req.query.lotId as string) : undefined;
  realtimeHub.addClient(clientId, res, userId, initialLotId, sessionId);

  req.on('close', () => {
    realtimeHub.removeClient(clientId);
  });
});

app.post('/api/realtime/viewing', (req, res) => {
  const { clientId, lotId } = req.body;
  if (clientId) {
    realtimeHub.updateViewing(clientId, lotId ? parseInt(lotId) : null);
  }
  const count = lotId ? realtimeHub.getLotViewersCount(parseInt(lotId)) : 0;
  res.json({ ok: true, viewersCount: count });
});

/* ==========================================================================
   CUSTOMER SPACE (ESPACE PROFESSIONNEL)
   ========================================================================== */

// Dashboard Client
app.get('/api/my/dashboard', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;

    let myActiveBids: any[] = [];
    let myOrders: any[] = [];

    try {
      // Enchères en cours
      myActiveBids = await withDbRetry(() =>
        db
          .select({
            bidId: bids.id,
            lotId: lots.id,
            lotReference: lots.reference,
            lotTitle: lots.title,
            lotImage: sql`(${lots.images}->>0)`,
            currentPriceCents: lots.currentPriceCents,
            myMaxBidCents: bids.maxBidCents,
            isWinning: bids.isWinning,
            endsAt: lots.endsAt,
            lotStatus: lots.status,
          })
          .from(bids)
          .innerJoin(lots, eq(bids.lotId, lots.id))
          .where(and(eq(bids.userId, userId), eq(lots.status, 'ACTIVE')))
          .orderBy(asc(lots.endsAt))
      );

      // Enchères gagnées / commandes
      myOrders = await withDbRetry(() =>
        db
          .select({
            orderId: orders.id,
            orderNumber: orders.orderNumber,
            lotId: lots.id,
            lotReference: lots.reference,
            lotTitle: lots.title,
            lotImage: sql`(${lots.images}->>0)`,
            finalPriceCents: orders.finalPriceCents,
            totalCents: orders.totalCents,
            status: orders.status,
            shippingCarrier: orders.shippingCarrier,
            trackingNumber: orders.trackingNumber,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .innerJoin(lots, eq(orders.lotId, lots.id))
          .where(eq(orders.buyerId, userId))
          .orderBy(desc(orders.createdAt))
      );
    } catch (dbErr) {
      console.warn('Dashboard DB query warning, returning empty lists:', dbErr);
    }

    res.json({
      activeBids: myActiveBids,
      orders: myOrders,
    });
  } catch (err: any) {
    res.json({ activeBids: [], orders: [] });
  }
});

// Commandes client
app.get('/api/my/orders', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    let userOrders: any[] = [];

    try {
      userOrders = await withDbRetry(() =>
        db
          .select({
            order: orders,
            lot: {
              id: lots.id,
              reference: lots.reference,
              title: lots.title,
              category: lots.category,
              images: lots.images,
            },
          })
          .from(orders)
          .innerJoin(lots, eq(orders.lotId, lots.id))
          .where(eq(orders.buyerId, userId))
          .orderBy(desc(orders.createdAt))
      );
    } catch (e) {
      console.warn('Orders DB query warning:', e);
    }

    res.json({ orders: userOrders });
  } catch (err: any) {
    res.json({ orders: [] });
  }
});

// Création paiement PayPal
app.post('/api/orders/:id/paypal/create', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId = req.dbUser!.id;
    const payPalOrder = await createPayPalOrder(orderId, userId);
    res.json(payPalOrder);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Capture et confirmation paiement PayPal
app.post('/api/orders/:id/paypal/capture', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId = req.dbUser!.id;
    const { paypalOrderId } = req.body;

    if (!paypalOrderId) {
      return res.status(400).json({ error: 'Identifiant PayPal manquant.' });
    }

    const result = await captureAndVerifyPayPalPayment(orderId, userId, paypalOrderId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Documents de transaction client (Reçus légaux / Confirmation de transaction)
app.get('/api/my/documents', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    const docs = await db
      .select({
        doc: transactionDocuments,
        orderNumber: orders.orderNumber,
      })
      .from(transactionDocuments)
      .innerJoin(orders, eq(transactionDocuments.orderId, orders.id))
      .where(eq(orders.buyerId, userId))
      .orderBy(desc(transactionDocuments.createdAt));

    res.json({ documents: docs });
  } catch (err: any) {
    res.json({ documents: [] });
  }
});

/* ==========================================================================
   ADMINISTRATION BACK-OFFICE (Strictement protégé requireAdmin)
   ========================================================================== */

// Dashboard Admin (Métriques ventes, trésorerie, acquisitions, impayés)
app.get('/api/admin/dashboard', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    // Vente actuelle
    const currentSales = await db
      .select()
      .from(sales)
      .where(eq(sales.status, 'LIVE'))
      .limit(1);

    const currentSale = currentSales[0] || null;
    let saleLots: any[] = [];
    if (currentSale) {
      saleLots = await db
        .select()
        .from(lots)
        .where(eq(lots.saleId, currentSale.id));
    }

    const totalLots = saleLots.length;
    const lotsWithBids = saleLots.filter((l) => l.bidCount > 0).length;
    const lotsWithoutBids = totalLots - lotsWithBids;
    const currentAuctionValueCents = saleLots.reduce((acc, l) => acc + l.currentPriceCents, 0);

    // Commandes & Paiements
    const allOrders = await db.select().from(orders);
    const awaitingPaymentOrders = allOrders.filter((o) => o.status === 'AWAITING_PAYMENT');
    const paidOrders = allOrders.filter((o) => o.status === 'PAID');
    const shippedOrders = allOrders.filter((o) => o.status === 'SHIPPED');

    const totalPaidCents = paidOrders.reduce((acc, o) => acc + o.totalCents, 0);
    const totalAwaitingCents = awaitingPaymentOrders.reduce((acc, o) => acc + o.totalCents, 0);

    // Objets à acquérir
    const pendingAcquisitions = await db
      .select()
      .from(lots)
      .where(and(eq(lots.status, 'SOLD'), eq(lots.acquisitionStatus, 'PENDING')));

    const purchasedLots = await db
      .select()
      .from(lots)
      .where(eq(lots.acquisitionStatus, 'PURCHASED'));

    // Clients en attente
    const pendingClients = await db
      .select()
      .from(users)
      .where(and(eq(users.role, 'CUSTOMER'), eq(users.status, 'PENDING')));

    res.json({
      currentSale: currentSale
        ? {
            ...currentSale,
            totalLots,
            lotsWithBids,
            lotsWithoutBids,
            currentAuctionValueCents,
          }
        : null,
      ordersMetrics: {
        totalOrders: allOrders.length,
        awaitingPaymentCount: awaitingPaymentOrders.length,
        paidCount: paidOrders.length,
        shippedCount: shippedOrders.length,
        totalPaidCents,
        totalAwaitingCents,
      },
      acquisitionsMetrics: {
        toAcquireCount: pendingAcquisitions.length,
        purchasedCount: purchasedLots.length,
      },
      pendingClientsCount: pendingClients.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Gestion des clients (Consultation, validation, suspension)
app.get('/api/admin/clients', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const clientsList = await db
      .select()
      .from(users)
      .where(eq(users.role, 'CUSTOMER'))
      .orderBy(desc(users.createdAt));

    res.json({ clients: clientsList });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/clients/:id/status', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const targetUserId = parseInt(req.params.id);
    const { status, notes } = req.body;

    if (!['APPROVED', 'REJECTED', 'SUSPENDED', 'BLOCKED', 'PENDING'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }

    const updated = await db
      .update(users)
      .set({
        status,
        notes: notes !== undefined ? notes : undefined,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetUserId))
      .returning();

    await db.insert(auditLogs).values({
      userId: req.dbUser!.id,
      userEmail: req.dbUser!.email,
      action: `CLIENT_STATUS_${status}`,
      entityType: 'USER',
      entityId: String(targetUserId),
      details: `Changement de statut du professionnel ${updated[0].companyName || updated[0].email} vers ${status}. Notes: ${notes || 'Aucune'}`,
    });

    res.json({ client: updated[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Gestion des ventes
app.get('/api/admin/sales', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const salesList = await db.select().from(sales).orderBy(desc(sales.startsAt));
    res.json({ sales: salesList });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/sales', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { reference, title, description, startsAt, endsAt, antiSnipeMinutes } = req.body;

    const newSale = await db
      .insert(sales)
      .values({
        reference,
        title,
        description,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        antiSnipeMinutes: antiSnipeMinutes || 2,
        status: 'DRAFT',
      })
      .returning();

    await db.insert(auditLogs).values({
      userId: req.dbUser!.id,
      action: 'CREATE_SALE',
      entityType: 'SALE',
      entityId: reference,
      details: `Création de la vente ${reference}: "${title}"`,
    });

    res.json({ sale: newSale[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/sales/:id/publish', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const saleId = parseInt(req.params.id);
    const updated = await db
      .update(sales)
      .set({ status: 'LIVE', updatedAt: new Date() })
      .where(eq(sales.id, saleId))
      .returning();

    await db.insert(auditLogs).values({
      userId: req.dbUser!.id,
      action: 'PUBLISH_SALE',
      entityType: 'SALE',
      entityId: updated[0].reference,
      details: `Publication de la vente hebdomadaire ${updated[0].reference}`,
    });

    res.json({ sale: updated[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Gestion des lots (Vue complète avec prix de réserve et coûts internes)
app.get('/api/admin/lots', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const allLots = await db
      .select({
        lot: lots,
        saleReference: sales.reference,
        winnerEmail: users.email,
        winnerCompany: users.companyName,
      })
      .from(lots)
      .leftJoin(sales, eq(lots.saleId, sales.id))
      .leftJoin(users, eq(lots.currentWinnerId, users.id))
      .orderBy(desc(lots.id));

    res.json({ lots: allLots });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/lots', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      saleId,
      reference,
      title,
      description,
      category,
      period,
      dimensions,
      weight,
      conditionReport,
      flaws,
      observations,
      startingPriceCents,
      reservePriceCents,
      targetAcquisitionCostCents,
      endsAt,
      images,
    } = req.body;

    const standardSchedule = getNextStandardLotSchedule();
    const finalEndsAt = endsAt ? new Date(endsAt) : standardSchedule.endsAt;

    const newLot = await db
      .insert(lots)
      .values({
        saleId,
        reference,
        title,
        description,
        category: category || 'Objet d\'art & curiosité',
        period,
        dimensions,
        weight,
        conditionReport,
        flaws,
        observations,
        startingPriceCents,
        reservePriceCents: reservePriceCents || 0,
        currentPriceCents: startingPriceCents,
        targetAcquisitionCostCents: targetAcquisitionCostCents || 0,
        endsAt: finalEndsAt,
        images: images || [],
        status: 'ACTIVE',
      })
      .returning();

    await db.insert(auditLogs).values({
      userId: req.dbUser!.id,
      action: 'CREATE_LOT',
      entityType: 'LOT',
      entityId: reference,
      details: `Création du lot ${reference}: "${title}" (Mise à prix: ${(startingPriceCents / 100).toFixed(2)} €)`,
    });

    res.json({ lot: newLot[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Page Trésorerie & "OBJETS À ACQUÉRIR" (Section 34, 76, 82 du Master Prompt)
app.get('/api/admin/acquisitions', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const acquisitionItems = await db
      .select({
        lotId: lots.id,
        lotReference: lots.reference,
        lotTitle: lots.title,
        lotImage: sql`(${lots.images}->>0)`,
        salePriceCents: lots.currentPriceCents,
        targetCostCents: lots.targetAcquisitionCostCents,
        actualCostCents: lots.actualAcquisitionCostCents,
        acquisitionStatus: lots.acquisitionStatus,
        acquisitionSource: lots.acquisitionSource,
        acquisitionDate: lots.acquisitionDate,
        acquisitionNotes: lots.acquisitionNotes,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        orderStatus: orders.status,
        buyerName: sql`concat(${users.firstName}, ' ', ${users.lastName})`,
        buyerCompany: users.companyName,
      })
      .from(lots)
      .innerJoin(orders, eq(orders.lotId, lots.id))
      .innerJoin(users, eq(orders.buyerId, users.id))
      .orderBy(desc(orders.id));

    // Calculs de marge prévisionnelle et réelle
    const formatted = acquisitionItems.map((item) => {
      const salePrice = item.salePriceCents || 0;
      const targetCost = item.targetCostCents || 0;
      const actualCost = item.actualCostCents || 0;
      const expectedMarginCents = salePrice - targetCost;
      const actualMarginCents = actualCost > 0 ? salePrice - actualCost : expectedMarginCents;

      return {
        ...item,
        expectedMarginCents,
        actualMarginCents,
      };
    });

    res.json({ acquisitions: formatted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mise à jour de l'acquisition d'un objet (Acheté, reçu, coût réel)
app.put('/api/admin/acquisitions/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const lotId = parseInt(req.params.id);
    const { acquisitionStatus, actualAcquisitionCostCents, acquisitionSource, acquisitionNotes } = req.body;

    const updated = await db
      .update(lots)
      .set({
        acquisitionStatus,
        actualAcquisitionCostCents,
        acquisitionSource,
        acquisitionNotes,
        acquisitionDate: acquisitionStatus === 'PURCHASED' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(lots.id, lotId))
      .returning();

    // Mettre à jour la commande associée
    if (acquisitionStatus === 'PURCHASED') {
      await db
        .update(orders)
        .set({ status: 'PURCHASED', updatedAt: new Date() })
        .where(eq(orders.lotId, lotId));
    } else if (acquisitionStatus === 'RECEIVED') {
      await db
        .update(orders)
        .set({ status: 'READY_TO_SHIP', updatedAt: new Date() })
        .where(eq(orders.lotId, lotId));
    }

    await db.insert(auditLogs).values({
      userId: req.dbUser!.id,
      action: 'UPDATE_ACQUISITION',
      entityType: 'LOT',
      entityId: updated[0].reference,
      details: `Mise à jour acquisition lot ${updated[0].reference}: Statut ${acquisitionStatus}, Coût réel ${(actualAcquisitionCostCents / 100).toFixed(2)} €`,
    });

    res.json({ lot: updated[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Expéditions (Page "À EXPÉDIER", Section 38, 78)
app.get('/api/admin/shipments', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const shipmentsList = await db
      .select({
        order: orders,
        lot: {
          id: lots.id,
          reference: lots.reference,
          title: lots.title,
          category: lots.category,
        },
        buyer: {
          id: users.id,
          name: sql`concat(${users.firstName}, ' ', ${users.lastName})`,
          companyName: users.companyName,
          phone: users.phone,
          email: users.email,
          addressLine1: users.addressLine1,
          addressLine2: users.addressLine2,
          postalCode: users.postalCode,
          city: users.city,
          country: users.country,
        },
      })
      .from(orders)
      .innerJoin(lots, eq(orders.lotId, lots.id))
      .innerJoin(users, eq(orders.buyerId, users.id))
      .where(or(
        eq(orders.status, 'PAID'),
        eq(orders.status, 'PURCHASED'),
        eq(orders.status, 'READY_TO_SHIP'),
        eq(orders.status, 'SHIPPED'),
        eq(orders.status, 'DELIVERED')
      ))
      .orderBy(desc(orders.id));

    res.json({ shipments: shipmentsList });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mise à jour expédition (transporteur, tracking, statut)
app.put('/api/admin/orders/:id/shipment', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { status, shippingCarrier, trackingNumber } = req.body;

    const updated = await db
      .update(orders)
      .set({
        status,
        shippingCarrier,
        trackingNumber,
        shippedAt: status === 'SHIPPED' ? new Date() : undefined,
        deliveredAt: status === 'DELIVERED' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();

    await db.insert(auditLogs).values({
      userId: req.dbUser!.id,
      action: 'UPDATE_SHIPMENT',
      entityType: 'ORDER',
      entityId: updated[0].orderNumber,
      details: `Expédition commande ${updated[0].orderNumber}: Statut ${status}, Transporteur ${shippingCarrier || 'N/A'}, Suivi ${trackingNumber || 'N/A'}`,
    });

    res.json({ order: updated[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Journal d'audit complet (Section 51)
app.get('/api/admin/audit-logs', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);

    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Configuration du vendeur et paramètres système (Section 89)
app.get('/api/admin/settings', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const settings = await db.select().from(systemSettings);
    res.json({ settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/settings', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { settings } = req.body; // array of { key, value }
    for (const item of settings) {
      await db
        .insert(systemSettings)
        .values({ key: item.key, value: item.value })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: item.value },
        });
    }

    await db.insert(auditLogs).values({
      userId: req.dbUser!.id,
      action: 'UPDATE_SETTINGS',
      entityType: 'SYSTEM',
      entityId: 'SETTINGS',
      details: 'Mise à jour des paramètres système et vendeur',
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   CHAT D'ASSISTANCE & DEMANDES DIRECTES (9H - 17H LUN-VEN)
   ========================================================================== */

// Statut d'ouverture du chat (9h à 17h du lundi au vendredi)
app.get('/api/chat/status', (req, res) => {
  const status = getChatScheduleStatus();
  res.json(status);
});

// Récupération des messages
app.get('/api/chat/messages', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const { userId, email } = req.query;

    if (req.dbUser?.role === 'ADMIN') {
      // L'administrateur peut voir toutes les conversations ou filtrer par utilisateur
      let query = db.select().from(chatMessages);
      if (userId) {
        const uId = parseInt(String(userId), 10);
        const msgs = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.userId, uId))
          .orderBy(asc(chatMessages.createdAt));
        return res.json({ messages: msgs });
      } else if (email) {
        const msgs = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.senderEmail, String(email)))
          .orderBy(asc(chatMessages.createdAt));
        return res.json({ messages: msgs });
      }

      // Par défaut pour l'admin : tous les messages récents classés par date
      const allMsgs = await db
        .select()
        .from(chatMessages)
        .orderBy(desc(chatMessages.createdAt))
        .limit(200);

      return res.json({ messages: allMsgs.reverse() });
    }

    if (req.dbUser) {
      // Client connecté : voit ses messages
      const msgs = await db
        .select()
        .from(chatMessages)
        .where(
          or(
            eq(chatMessages.userId, req.dbUser.id),
            eq(chatMessages.senderEmail, req.dbUser.email)
          )
        )
        .orderBy(asc(chatMessages.createdAt));
      return res.json({ messages: msgs });
    }

    // Visiteur non connecté : recherche par email si fourni
    if (email) {
      const msgs = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.senderEmail, String(email)))
        .orderBy(asc(chatMessages.createdAt));
      return res.json({ messages: msgs });
    }

    res.json({ messages: [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Envoi d'un nouveau message
app.post('/api/chat/messages', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const {
      message,
      senderName,
      senderEmail,
      senderPhone,
      lotId,
      lotReference,
      lotTitle,
      targetUserId,
    } = req.body;

    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Le message ne peut pas être vide.' });
    }

    const trimmedMsg = String(message).trim();
    const schedule = getChatScheduleStatus();

    let finalSenderType = 'BUYER';
    let finalSenderName = 'Visiteur professionnel';
    let finalSenderEmail = senderEmail ? String(senderEmail).trim().toLowerCase() : null;
    let finalSenderPhone = senderPhone ? String(senderPhone).trim() : null;
    let finalUserId: number | null = null;

    if (req.dbUser?.role === 'ADMIN') {
      finalSenderType = 'ADMIN';
      finalSenderName = 'Monsieur De Coster';
      finalSenderEmail = req.dbUser.email || 'contact@encheres-antiquites.com';
      finalUserId = targetUserId ? parseInt(String(targetUserId), 10) : null;
    } else if (req.dbUser) {
      finalSenderType = 'BUYER';
      finalUserId = req.dbUser.id;
      finalSenderName =
        req.dbUser.companyName
          ? `${req.dbUser.companyName} (${req.dbUser.firstName} ${req.dbUser.lastName})`
          : `${req.dbUser.firstName} ${req.dbUser.lastName}`.trim() || 'Acheteur professionnel';
      finalSenderEmail = req.dbUser.email;
      finalSenderPhone = req.dbUser.phone || null;
    } else {
      finalSenderType = 'BUYER';
      if (senderName && String(senderName).trim()) {
        finalSenderName = String(senderName).trim();
      }
    }

    const inserted = await db
      .insert(chatMessages)
      .values({
        userId: finalUserId,
        senderType: finalSenderType,
        senderName: finalSenderName,
        senderEmail: finalSenderEmail,
        senderPhone: finalSenderPhone,
        lotId: lotId ? parseInt(String(lotId), 10) : null,
        lotReference: lotReference ? String(lotReference) : null,
        lotTitle: lotTitle ? String(lotTitle) : null,
        message: trimmedMsg,
        isRead: false,
      })
      .returning();

    // Audit log
    await db.insert(auditLogs).values({
      userId: req.dbUser?.id || null,
      userEmail: finalSenderEmail || 'visiteur',
      action: finalSenderType === 'ADMIN' ? 'REPLY_CHAT_MESSAGE' : 'SEND_CHAT_MESSAGE',
      entityType: 'CHAT',
      entityId: String(inserted[0].id),
      details: `Message: "${trimmedMsg.substring(0, 60)}..."`,
    });

    res.json({
      message: inserted[0],
      scheduleStatus: schedule,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Marquer un message comme lu
app.patch('/api/chat/messages/:id/read', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updated = await db
      .update(chatMessages)
      .set({ isRead: true })
      .where(eq(chatMessages.id, id))
      .returning();

    res.json({ message: updated[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

