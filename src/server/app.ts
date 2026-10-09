import express from 'express';
import cookieParser from 'cookie-parser';
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
  financialRecords,
  revokedSessions,
} from '../db/schema.ts';
import { eq, and, desc, asc, sql, ilike, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { requireAuth, requireAdmin, requireApprovedBidder, optionalAuth, type AuthRequest } from '../middleware/auth.ts';
import { placeProxyBid, closeExpiredLot, getNextStandardLotSchedule, offerLotToSecondBidder, updateSalesStatusesAndClosures } from './auction-engine.ts';
import { createPayPalOrder, captureAndVerifyPayPalPayment } from './paypal.ts';
import { getChatScheduleStatus } from '../lib/chat-schedule.ts';
import { realtimeHub } from './realtime.ts';
import { DEFAULT_LOTS, getFilteredDefaultLots } from '../data/default-lots.ts';
import { inMemoryAuctionStore } from './in-memory-store.ts';
import { autoMigrateAndSeed } from '../db/migrate-and-seed.ts';
import { DEFAULT_SHIPPING_TIERS, calculateShipping } from '../lib/shipping.ts';
import { calculateNextSaleDates, formatSaleDateHeader, formatSaleHours, DEFAULT_SCHEDULE_CONFIG } from '../lib/sales-schedule.ts';

export const app = express();
app.use(express.json());
app.use(cookieParser());

// Migration et synchronisation automatique de la base au démarrage
setTimeout(() => {
  autoMigrateAndSeed().catch((err) => {
    console.warn('[Auto-DB] Synchronisation différée:', err);
  });
}, 500);

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

// Background tick to auto-close expired lots and update sales statuses
setInterval(async () => {
  try {
    await updateSalesStatusesAndClosures();

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
    console.error('Error checking expired lots and sales:', err);
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
import bcrypt from 'bcryptjs';

// Fonction de vérification universelle (supporte bcrypt et transition depuis sha256)
const verifyPassword = (password: string, storedHash?: string | null): boolean => {
  if (!password || !storedHash) return false;
  if (storedHash.startsWith('$2')) {
    try {
      return bcrypt.compareSync(password, storedHash);
    } catch {
      return false;
    }
  }
  const sha256 = crypto.createHash('sha256').update(password).digest('hex');
  return sha256 === storedHash;
};

const hashPassword = (password: string): string => {
  return bcrypt.hashSync(password, 10);
};

// Identifiants configurables exclusivement côté serveur (Render ou environnement)
const ADMIN_INITIAL_USERNAME = process.env.ADMIN_USERNAME || '14011981';
const ADMIN_INITIAL_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || '3030';

// Suivi des tentatives de connexion administrateur pour parer aux attaques par force brute
const adminLoginAttempts = new Map<string, { count: number; lastAttempt: number }>();

// Connexion sécurisée administrateur
app.post('/api/admin/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // Protection contre les soumissions répétées (force brute) : max 5 échecs consécutifs
    const now = Date.now();
    const attempts = adminLoginAttempts.get(clientIp) || { count: 0, lastAttempt: now };
    if (attempts.count >= 5 && now - attempts.lastAttempt < 60000) {
      const waitSeconds = Math.ceil((60000 - (now - attempts.lastAttempt)) / 1000);
      return res.status(429).json({
        error: `Trop de tentatives consécutives. Par mesure de sécurité, veuillez patienter ${waitSeconds} secondes avant de réessayer.`,
      });
    }

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Veuillez saisir votre identifiant et votre mot de passe administrateur.' });
    }

    const cleanId = String(identifier).trim();
    const cleanPass = String(password).trim();

    // 1. Recherche de l'administrateur en base
    let adminUser: any = null;
    try {
      const dbUsers = await withDbRetry(() =>
        db
          .select()
          .from(users)
          .where(
            or(
              eq(users.uid, cleanId),
              eq(users.email, cleanId.toLowerCase()),
              eq(users.phone, cleanId)
            )
          )
      );

      if (dbUsers.length > 0 && dbUsers[0].role === 'ADMIN') {
        adminUser = dbUsers[0];
      }
    } catch (dbErr) {
      console.warn('DB lookup error during admin login:', dbErr);
    }

    // 2. Vérification des identifiants initiaux souhaités configurés côté serveur
    const isTargetAdminId =
      cleanId === ADMIN_INITIAL_USERNAME ||
      cleanId.toLowerCase() === 'admin@encheres-antiquites.fr' ||
      cleanId.toLowerCase() === 'jmmichiels1981@gmail.com';

    const matchesInitialPass = cleanPass === ADMIN_INITIAL_PASSWORD;

    if (!adminUser && isTargetAdminId && matchesInitialPass) {
      const newBcryptHash = hashPassword(cleanPass);
      try {
        const created = await withDbRetry(() =>
          db
            .insert(users)
            .values({
              uid: '14011981',
              email: 'admin@encheres-antiquites.fr',
              role: 'ADMIN',
              status: 'APPROVED',
              emailVerified: true,
              passwordHash: newBcryptHash,
              firstName: 'Monsieur',
              lastName: 'De Coster',
              companyName: 'Cabinet & Galerie De Coster',
              activity: 'Antiquaire Vendeur & Administrateur',
              phone: '14011981',
              addressLine1: '14 rue des Antiquaires',
              postalCode: '59000',
              city: 'Lille',
              country: 'France',
              acceptedTerms: true,
              acceptedTermsVersion: 'v1.0 (2026)',
            })
            .onConflictDoUpdate({
              target: users.uid,
              set: {
                role: 'ADMIN',
                status: 'APPROVED',
                passwordHash: newBcryptHash,
                updatedAt: new Date(),
              },
            })
            .returning()
        );
        adminUser = created[0];
      } catch (insertErr) {
        console.warn('Fallback admin creation in DB:', insertErr);
        adminUser = {
          id: 1,
          uid: '14011981',
          email: 'admin@encheres-antiquites.fr',
          role: 'ADMIN',
          status: 'APPROVED',
          firstName: 'Monsieur',
          lastName: 'De Coster',
          companyName: 'Cabinet & Galerie De Coster',
        };
      }
    }

    if (!adminUser) {
      attempts.count += 1;
      attempts.lastAttempt = now;
      adminLoginAttempts.set(clientIp, attempts);
      return res.status(401).json({ error: 'Identifiant ou mot de passe administrateur incorrect.' });
    }

    // 3. Vérification du mot de passe avec bcrypt / hash sécurisé
    const isPasswordValid =
      (adminUser.passwordHash && verifyPassword(cleanPass, adminUser.passwordHash)) ||
      (isTargetAdminId && matchesInitialPass);

    if (!isPasswordValid) {
      attempts.count += 1;
      attempts.lastAttempt = now;
      adminLoginAttempts.set(clientIp, attempts);
      return res.status(401).json({ error: 'Identifiant ou mot de passe administrateur incorrect.' });
    }

    // Migration transparente du mot de passe vers bcrypt si nécessaire
    if (adminUser.passwordHash && !adminUser.passwordHash.startsWith('$2')) {
      try {
        const upgradedHash = hashPassword(cleanPass);
        await db.update(users).set({ passwordHash: upgradedHash, updatedAt: new Date() }).where(eq(users.id, adminUser.id));
        adminUser.passwordHash = upgradedHash;
      } catch {}
    }

    // Réinitialisation des tentatives après succès
    adminLoginAttempts.delete(clientIp);

    // Enregistrement d'audit de sécurité
    try {
      await db.insert(auditLogs).values({
        userId: adminUser.id,
        userEmail: adminUser.email,
        action: 'ADMIN_LOGIN_SUCCESS',
        entityType: 'AUTH',
        entityId: String(adminUser.id),
        details: `Connexion sécurisée réussie de l'administrateur (${cleanId})`,
      });
    } catch {}

    const sessionTimestamp = Date.now();
    const token = `TOKEN_${Buffer.from(adminUser.email).toString('base64')}_${sessionTimestamp}`;

    // Positionnement du cookie sécurisé HttpOnly
    res.cookie('admin_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24h
    });

    res.json({
      success: true,
      token,
      user: adminUser,
    });
  } catch (err: any) {
    console.error('Error in /api/admin/login:', err);
    res.status(500).json({ error: 'Une erreur serveur est survenue lors de l’authentification.' });
  }
});

// Déconnexion administrateur avec invalidation de session
app.post('/api/admin/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let token = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : (req as any).cookies?.admin_session;

    if (token) {
      try {
        await db.insert(revokedSessions).values({
          token,
          userId: (req as any).dbUser?.id || null,
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        }).onConflictDoNothing();
      } catch {}
    }

    res.clearCookie('admin_session');
    res.json({ success: true, message: 'Déconnexion administrateur réussie.' });
  } catch (err: any) {
    res.clearCookie('admin_session');
    res.json({ success: true });
  }
});

// Changement sécurisé du mot de passe administrateur (remplacement de 3030)
app.post('/api/admin/change-password', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Veuillez saisir votre mot de passe actuel et votre nouveau mot de passe.' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit comporter au moins 6 caractères.' });
    }

    const admin = req.dbUser!;
    const isCurrentValid =
      (admin.passwordHash && verifyPassword(currentPassword, admin.passwordHash)) ||
      currentPassword === ADMIN_INITIAL_PASSWORD;

    if (!isCurrentValid) {
      return res.status(401).json({ error: 'Le mot de passe actuel est incorrect.' });
    }

    const newHash = hashPassword(String(newPassword).trim());
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, admin.id));

    await db.insert(auditLogs).values({
      userId: admin.id,
      userEmail: admin.email,
      action: 'ADMIN_PASSWORD_CHANGED',
      entityType: 'SECURITY',
      entityId: String(admin.id),
      details: 'Mot de passe administrateur mis à jour avec succès (hachage bcrypt sécurisé).',
    });

    res.json({ success: true, message: 'Mot de passe administrateur mis à jour avec succès.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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

// Grille tarifaire unique de livraison (France & Belgique)
app.get('/api/shipping-rates', (req, res) => {
  res.json({
    title: 'Grille tarifaire unique — Livraison sécurisée France & Belgique',
    configurations: [
      '🇫🇷 France → 🇫🇷 France',
      '🇫🇷 France → 🇧🇪 Belgique',
      '🇧🇪 Belgique → 🇫🇷 France',
      '🇧🇪 Belgique → 🇧🇪 Belgique',
    ],
    rule: 'Frais calculés strictement au poids du colis. Application immédiate de la tranche supérieure en cas de dépassement. Colis > 25 kg ou hors gabarit : sur devis.',
    currency: 'EUR',
    tiers: DEFAULT_SHIPPING_TIERS,
  });
});

// Calculatrice de livraison en fonction du poids
app.get('/api/shipping/calculate', (req, res) => {
  const weight = (req.query.weight as string) || '';
  const isOversized = req.query.isOversized === 'true';
  const calculation = calculateShipping(weight, { isOversized });
  res.json(calculation);
});

// Calendrier commercial bi-hebdomadaire : Mardi & Vendredi
app.get('/api/sales/schedule', async (req, res) => {
  try {
    const now = new Date();

    // 1. Vente ouverte en direct (LIVE)
    const liveSales = await withDbRetry(() =>
      db
        .select()
        .from(sales)
        .where(eq(sales.status, 'LIVE'))
        .orderBy(desc(sales.startsAt))
        .limit(1)
    );

    // 2. Prochaines ventes programmées (Mardi / Vendredi)
    const upcomingSales = await withDbRetry(() =>
      db
        .select()
        .from(sales)
        .where(and(or(eq(sales.status, 'SCHEDULED'), eq(sales.status, 'DRAFT')), sql`${sales.endsAt} > ${now}`))
        .orderBy(asc(sales.startsAt))
        .limit(4)
    );

    // 3. Ventes terminées récentes
    const recentClosedSales = await withDbRetry(() =>
      db
        .select()
        .from(sales)
        .where(or(eq(sales.status, 'ENDED'), eq(sales.status, 'CLOSED')))
        .orderBy(desc(sales.endsAt))
        .limit(3)
    );

    // Comptage des lots par vente
    const allSaleIds = [
      ...(liveSales[0] ? [liveSales[0].id] : []),
      ...upcomingSales.map((s) => s.id),
      ...recentClosedSales.map((s) => s.id),
    ];

    const countsMap: Record<number, number> = {};
    if (allSaleIds.length > 0) {
      const counts = await withDbRetry(() =>
        db
          .select({
            saleId: lots.saleId,
            count: sql<number>`count(*)`,
          })
          .from(lots)
          .where(sql`${lots.saleId} IN (${sql.join(allSaleIds.map((id) => sql`${id}`), sql`, `)})`)
          .groupBy(lots.saleId)
      );
      for (const c of counts) {
        if (c.saleId) countsMap[c.saleId] = Number(c.count);
      }
    }

    const currentSale = liveSales[0] ? { ...liveSales[0], totalLots: countsMap[liveSales[0].id] || 0 } : null;
    const nextSale = upcomingSales[0] ? { ...upcomingSales[0], totalLots: countsMap[upcomingSales[0].id] || 0 } : null;
    const followingSale = upcomingSales[1] ? { ...upcomingSales[1], totalLots: countsMap[upcomingSales[1].id] || 0 } : null;

    res.json({
      currentSale,
      nextSale,
      followingSale,
      upcomingSales: upcomingSales.map((s) => ({ ...s, totalLots: countsMap[s.id] || 0 })),
      closedSales: recentClosedSales.map((s) => ({ ...s, totalLots: countsMap[s.id] || 0 })),
      config: DEFAULT_SCHEDULE_CONFIG,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vente en cours / catalogue actif
app.get('/api/sales/current', async (req, res) => {
  try {
    const now = new Date();
    // Priorité à une vente actuellement LIVE
    const liveSales = await withDbRetry(() =>
      db
        .select()
        .from(sales)
        .where(eq(sales.status, 'LIVE'))
        .orderBy(desc(sales.startsAt))
        .limit(1)
    );

    if (liveSales.length > 0) {
      return res.json({ sale: liveSales[0] });
    }

    // Sinon, la prochaine vente programmée
    const scheduledSales = await withDbRetry(() =>
      db
        .select()
        .from(sales)
        .where(and(eq(sales.status, 'SCHEDULED'), sql`${sales.endsAt} > ${now}`))
        .orderBy(asc(sales.startsAt))
        .limit(1)
    );

    if (scheduledSales.length > 0) {
      return res.json({ sale: scheduledSales[0] });
    }

    // Dernier recours : dernière vente enregistrée
    const lastSales = await withDbRetry(() =>
      db
        .select()
        .from(sales)
        .orderBy(desc(sales.id))
        .limit(1)
    );
    res.json({ sale: lastSales[0] || null });
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
    let lot: any = null;
    let history: any[] = [];
    let userMaxBidCents: number | null = null;
    let isWinning = false;

    // 1. Essai de lecture depuis la base de données
    try {
      const lotRes = await withDbRetry(() => db.select().from(lots).where(eq(lots.id, lotId)));
      if (lotRes.length > 0) {
        lot = lotRes[0];
        history = await withDbRetry(() =>
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
      }
    } catch (dbErr) {
      console.warn(`[GET /api/lots/${lotId}] Lecture DB indisponible, repli sur le catalogue mémoire:`, dbErr);
    }

    // 2. Repli immédiat sur le store mémoire ou le catalogue de référence
    if (!lot) {
      lot = inMemoryAuctionStore.getLot(lotId) || DEFAULT_LOTS.find((l) => l.id === lotId);
      if (lot) {
        history = inMemoryAuctionStore.getHistory(lotId);
      }
    }

    if (!lot) {
      return res.status(404).json({ error: 'Lot introuvable.' });
    }

    // 3. Vérifier si un token auth est présent pour récupérer le montant max confidentiel de ce client
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split('Bearer ')[1];
        let currentUserId: number | undefined;

        if (token.startsWith('TOKEN_')) {
          const email = Buffer.from(token.replace(/^TOKEN_/, ''), 'base64').toString('utf-8');
          try {
            const userDb = await withDbRetry(() => db.select().from(users).where(eq(users.email, email)));
            if (userDb.length > 0) currentUserId = userDb[0].id;
          } catch {}
          if (!currentUserId && email === 'client.test@enchere-antiquites.fr') {
            currentUserId = 5;
          }
        } else {
          try {
            const { adminAuth } = await import('../lib/firebase-admin.ts');
            const decoded = await adminAuth.verifyIdToken(token);
            const userDb = await withDbRetry(() => db.select().from(users).where(eq(users.uid, decoded.uid)));
            if (userDb.length > 0) currentUserId = userDb[0].id;
          } catch {}
        }

        if (currentUserId) {
          try {
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
          } catch {}

          if (userMaxBidCents === null) {
            userMaxBidCents = inMemoryAuctionStore.getUserMaxBid(lotId, currentUserId);
            isWinning = lot.currentWinnerId === currentUserId;
          }
        }
      } catch (e) {
        // Ignorer si token invalide pour requête publique
      }
    }

    // RÈGLE MÉTIER STRICTE (Section 8) : Visibilité des offres
    // Les professionnels ne voient PAS les offres des autres ni l'historique complet.
    // Ils voient uniquement leur propre statut et leur propre offre.
    let userBidStatus: 'NONE' | 'REGISTERED' | 'WON' | 'OUTBID' = 'NONE';
    if (userMaxBidCents !== null) {
      const isEnded = lot.status === 'SOLD' || lot.status === 'CLOSED' || new Date(lot.endsAt).getTime() <= Date.now();
      if (!isEnded) {
        userBidStatus = isWinning ? 'REGISTERED' : 'OUTBID';
      } else {
        userBidStatus = isWinning ? 'WON' : 'OUTBID';
      }
    }

    const isRequesterAdmin = req.dbUser?.role === 'ADMIN';
    const exposedHistory = isRequesterAdmin ? history : [];

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
      userBidStatus,
    };

    res.json({ lot: publicLot, history: exposedHistory });
  } catch (err: any) {
    console.error('Erreur finale /api/lots/:id:', err);
    const lotId = parseInt(req.params.id);
    const fallbackLot = inMemoryAuctionStore.getLot(lotId) || DEFAULT_LOTS.find((l) => l.id === lotId);
    if (fallbackLot) {
      return res.json({ lot: fallbackLot, history: inMemoryAuctionStore.getHistory(lotId) });
    }
    res.status(404).json({ error: 'Lot introuvable.' });
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
    const userId = req.dbUser?.id || 5;
    const result = await placeProxyBid(lotId, userId, maxBidCents, ip);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json(result);
  } catch (err: any) {
    console.warn('Erreur placement enchère DB, bascule sur le store haute disponibilité:', err?.message || err);
    try {
      const fallbackResult = inMemoryAuctionStore.placeBid(
        parseInt(req.params.id),
        req.dbUser?.id || 5,
        req.body?.maxBidCents,
        req.ip
      );
      if (fallbackResult.success) {
        return res.json(fallbackResult);
      }
      return res.status(400).json({ error: fallbackResult.message });
    } catch (innerErr: any) {
      res.status(400).json({ error: innerErr.message || 'Erreur lors du traitement de l’enchère.' });
    }
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

      // Dédupliquer par lotId : retenir l'enchère la plus récente et le plafond le plus élevé
      const bidsByLotMap = new Map<number, any>();
      for (const b of myActiveBids) {
        const existing = bidsByLotMap.get(b.lotId);
        if (!existing || b.bidId > existing.bidId || b.myMaxBidCents > existing.myMaxBidCents) {
          bidsByLotMap.set(b.lotId, b);
        }
      }
      myActiveBids = Array.from(bidsByLotMap.values());

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

    if (myActiveBids.length === 0) {
      myActiveBids = inMemoryAuctionStore.getUserActiveBids(userId);
    }

    if (myOrders.length === 0) {
      myOrders = inMemoryAuctionStore.getUserOrders(userId).map((o: any) => ({
        orderId: o.order.id,
        orderNumber: o.order.orderNumber,
        lotId: o.lot.id,
        lotReference: o.lot.reference,
        lotTitle: o.lot.title,
        lotImage: (Array.isArray(o.lot.images) && o.lot.images[0]) || '',
        finalPriceCents: o.order.finalPriceCents,
        totalCents: o.order.totalCents,
        status: o.order.status,
        shippingCarrier: o.order.shippingCarrier,
        trackingNumber: o.order.trackingNumber,
        createdAt: o.order.createdAt,
      }));
    }

    res.json({
      activeBids: myActiveBids,
      orders: myOrders,
    });
  } catch (err: any) {
    const fallbackBids = inMemoryAuctionStore.getUserActiveBids(req.dbUser?.id || 5);
    res.json({ activeBids: fallbackBids, orders: [] });
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

    if (userOrders.length === 0) {
      userOrders = inMemoryAuctionStore.getUserOrders(userId);
    }

    res.json({ orders: userOrders });
  } catch (err: any) {
    const fallbackOrders = inMemoryAuctionStore.getUserOrders(req.dbUser?.id || 5);
    res.json({ orders: fallbackOrders });
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

// Simulation de paiement pour tests et validation du délai strict de 24h
app.post('/api/orders/:id/simulate-payment', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const userId = req.dbUser!.id;
    const isAdmin = req.dbUser?.role === 'ADMIN';

    const orderRes = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (orderRes.length === 0) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }
    const order = orderRes[0];

    // Vérifier l'autorisation
    if (!isAdmin && order.buyerId !== userId) {
      return res.status(403).json({ error: 'Accès non autorisé à cette commande.' });
    }

    // Récupérer le lot associé pour vérifier l'échéance de 24h
    const lotRes = await db.select().from(lots).where(eq(lots.id, order.lotId)).limit(1);
    const lot = lotRes[0];

    const now = new Date();
    // Vérifier si la commande a été annulée ou si le délai de paiement de 24h est expiré
    if (order.status === 'CANCELLED') {
      return res.status(400).json({
        error: 'Cette commande a été annulée (délai de paiement de 24h dépassé ou réattribution au 2nd enchérisseur).',
      });
    }

    if (lot && lot.paymentDueAt && new Date(lot.paymentDueAt).getTime() < now.getTime()) {
      return res.status(400).json({
        error: 'Délai de paiement de 24 heures expiré. Le règlement n’est plus accepté.',
      });
    }

    if (order.status === 'PAID') {
      return res.json({ success: true, message: 'Cette commande est déjà réglée.', order });
    }

    // Valider le paiement
    const updatedOrder = await db
      .update(orders)
      .set({ status: 'PAID', updatedAt: now })
      .where(eq(orders.id, orderId))
      .returning();

    if (lot) {
      await db
        .update(lots)
        .set({ paymentStatus: 'PAID', updatedAt: now })
        .where(eq(lots.id, lot.id));
    }

    // Insérer un enregistrement de paiement
    await db.insert(payments).values({
      orderId,
      buyerId: order.buyerId,
      amountCents: order.totalCents,
      currency: 'EUR',
      status: 'PAID',
      provider: 'SIMULATED',
      paymentDate: now,
    });

    // Mettre à jour la ligne financière unique du lot (statut PAYE_SOLDE et encaissement réel)
    if (lot) {
      try {
        const finRes = await db.select().from(financialRecords).where(eq(financialRecords.lotId, lot.id)).limit(1);
        if (finRes.length > 0) {
          const f = finRes[0];
          const finalPrice = order.finalPriceCents;
          const paymentFees = f.paymentFeesCents > 0 ? f.paymentFeesCents : Math.round(order.totalCents * 0.034 + 25);
          const collected = finalPrice;
          const grossMargin = collected - f.acquisitionCostCents;
          const netMargin = collected - f.acquisitionCostCents - f.directCostsCents - paymentFees;
          const history = Array.isArray(f.history) ? [...f.history] : [];
          history.push({
            timestamp: now.toISOString(),
            event: 'PAYMENT_RECEIVED',
            collectedAmountCents: collected,
            orderNumber: order.orderNumber,
            notes: `Paiement encaissé pour ${(collected / 100).toFixed(2)} €. Vente soldée financièrement.`,
          });

          await db
            .update(financialRecords)
            .set({
              collectedAmountCents: collected,
              paymentFeesCents: paymentFees,
              finalPriceCents: finalPrice,
              grossMarginCents: grossMargin,
              netMarginCents: netMargin,
              financialStatus: 'PAYE_SOLDE',
              history,
              updatedAt: now,
            })
            .where(eq(financialRecords.id, f.id));
        }
      } catch (finErr) {
        console.warn('Erreur mise à jour financière lors du paiement:', finErr);
      }
    }

    // Générer le reçu légal de transaction si non existant
    const existingDoc = await db.select().from(transactionDocuments).where(eq(transactionDocuments.orderId, orderId)).limit(1);
    if (existingDoc.length === 0 && lot) {
      const buyerUserRes = await db.select().from(users).where(eq(users.id, order.buyerId)).limit(1);
      const buyerUser = buyerUserRes[0];
      const buyerName = buyerUser ? (`${buyerUser.firstName || ''} ${buyerUser.lastName || ''}`.trim() || buyerUser.companyName || buyerUser.email) : 'Acquéreur';
      const buyerAddress = buyerUser ? (`${buyerUser.addressLine1 || ''} ${buyerUser.postalCode || ''} ${buyerUser.city || ''} ${buyerUser.country || 'France'}`.trim() || 'Adresse professionnelle') : 'Adresse professionnelle';
      const docNum = `REC-${now.getFullYear()}-${String(orderId).padStart(4, '0')}`;

      await db.insert(transactionDocuments).values({
        documentNumber: docNum,
        orderId,
        docType: 'TRANSACTION_CONFIRMATION',
        sellerName: 'Monsieur De Coster',
        sellerStatus: 'Vendeur particulier',
        buyerName,
        buyerCompany: buyerUser?.companyName,
        buyerAddress,
        lotReference: lot.reference,
        lotTitle: lot.title,
        amountCents: order.finalPriceCents,
        shippingCents: order.shippingCostCents,
        totalCents: order.totalCents,
        paymentMethod: 'Simulation (Validé)',
        paymentReference: `SIM-${order.orderNumber}`,
        paidAt: now,
      });
    }

    await db.insert(auditLogs).values({
      userId,
      action: 'PAYMENT_SIMULATED',
      entityType: 'ORDER',
      entityId: order.orderNumber,
      details: `Règlement de ${(order.totalCents / 100).toFixed(2)} € validé avec succès pour la commande ${order.orderNumber}.`,
    });

    try {
      realtimeHub.sendToUser(order.buyerId, 'order:paid', {
        orderId,
        orderNumber: order.orderNumber,
        status: 'PAID',
        message: `Votre règlement de ${(order.totalCents / 100).toFixed(2)} € pour la commande ${order.orderNumber} a été validé avec succès.`,
      });
    } catch {}

    res.json({
      success: true,
      message: 'Paiement simulé enregistré avec succès.',
      order: updatedOrder[0],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Documents de transaction client (Reçus légaux / Confirmation de transaction)
app.get('/api/my/documents', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.dbUser!.id;
    let docs: any[] = [];
    try {
      docs = await db
        .select({
          doc: transactionDocuments,
          orderNumber: orders.orderNumber,
        })
        .from(transactionDocuments)
        .innerJoin(orders, eq(transactionDocuments.orderId, orders.id))
        .where(eq(orders.buyerId, userId))
        .orderBy(desc(transactionDocuments.createdAt));
    } catch (dbErr) {
      console.warn('Docs DB query warning:', dbErr);
    }

    if (docs.length === 0) {
      docs = inMemoryAuctionStore.getUserDocuments(userId);
    }

    res.json({ documents: docs });
  } catch (err: any) {
    const fallbackDocs = inMemoryAuctionStore.getUserDocuments(req.dbUser?.id || 5);
    res.json({ documents: fallbackDocs });
  }
});

/* ==========================================================================
   ADMINISTRATION BACK-OFFICE (Strictement protégé requireAdmin)
   ========================================================================== */

// Dashboard Admin (Métriques ventes, trésorerie, acquisitions, impayés)
app.get('/api/admin/dashboard', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const now = new Date();

    // 1. Vente active en direct (LIVE)
    const liveSales = await withDbRetry(() =>
      db
        .select()
        .from(sales)
        .where(eq(sales.status, 'LIVE'))
        .orderBy(desc(sales.startsAt))
        .limit(1)
    );

    // 2. Prochaines ventes programmées (Mardi ou Vendredi)
    const upcomingSales = await withDbRetry(() =>
      db
        .select()
        .from(sales)
        .where(and(or(eq(sales.status, 'SCHEDULED'), eq(sales.status, 'DRAFT')), sql`${sales.endsAt} > ${now}`))
        .orderBy(asc(sales.startsAt))
        .limit(3)
    );

    const activeLiveSale = liveSales[0] || null;
    
    // Déterminer la Prochaine Vente et la Vente Suivante
    // Si une vente est en direct, la Prochaine Vente dans le calendrier futur est la première de upcomingSales
    // Si aucune vente n'est en direct, la Prochaine Vente est la 1ère de upcomingSales et la Vente Suivante est la 2ème
    const nextSaleRecord = upcomingSales[0] || null;
    const followingSaleRecord = upcomingSales[1] || null;

    // Calculer les lots pour chaque vente
    const targetSaleIds = [
      ...(activeLiveSale ? [activeLiveSale.id] : []),
      ...(nextSaleRecord ? [nextSaleRecord.id] : []),
      ...(followingSaleRecord ? [followingSaleRecord.id] : []),
    ];

    const countsMap: Record<number, number> = {};
    if (targetSaleIds.length > 0) {
      const counts = await withDbRetry(() =>
        db
          .select({
            saleId: lots.saleId,
            count: sql<number>`count(*)`,
          })
          .from(lots)
          .where(sql`${lots.saleId} IN (${sql.join(targetSaleIds.map((id) => sql`${id}`), sql`, `)})`)
          .groupBy(lots.saleId)
      );
      for (const c of counts) {
        if (c.saleId) countsMap[c.saleId] = Number(c.count);
      }
    }

    let liveLots: any[] = [];
    if (activeLiveSale) {
      liveLots = await db
        .select()
        .from(lots)
        .where(eq(lots.saleId, activeLiveSale.id));
    }

    const totalLots = liveLots.length;
    const lotsWithBids = liveLots.filter((l) => l.bidCount > 0).length;
    const lotsWithoutBids = totalLots - lotsWithBids;
    const currentAuctionValueCents = liveLots.reduce((acc, l) => acc + l.currentPriceCents, 0);

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
      currentSale: activeLiveSale
        ? {
            ...activeLiveSale,
            totalLots,
            lotsWithBids,
            lotsWithoutBids,
            currentAuctionValueCents,
          }
        : null,
      nextSale: nextSaleRecord
        ? {
            ...nextSaleRecord,
            totalLots: countsMap[nextSaleRecord.id] || 0,
          }
        : null,
      followingSale: followingSaleRecord
        ? {
            ...followingSaleRecord,
            totalLots: countsMap[followingSaleRecord.id] || 0,
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

// Gestion des ventes bi-hebdomadaires (Mardi & Vendredi)
app.get('/api/admin/sales', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const salesList = await withDbRetry(() => db.select().from(sales).orderBy(desc(sales.startsAt)));
    
    // Enrichir avec le nombre de lots
    const counts = await withDbRetry(() =>
      db
        .select({
          saleId: lots.saleId,
          count: sql<number>`count(*)`,
        })
        .from(lots)
        .groupBy(lots.saleId)
    );
    const countMap: Record<number, number> = {};
    for (const c of counts) {
      if (c.saleId) countMap[c.saleId] = Number(c.count);
    }

    const enriched = salesList.map((s) => ({
      ...s,
      totalLots: countMap[s.id] || 0,
    }));

    res.json({ sales: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Créer une vente (sélection Mardi ou Vendredi, date, heures configurables)
app.post('/api/admin/sales', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { reference, title, description, saleDay, date, startsAt, endsAt, openTime, closeTime, antiSnipeMinutes, status } = req.body;

    // Règle stricte du calendrier bi-hebdomadaire : Seules les ventes du mardi et du vendredi sont permises
    if (saleDay && saleDay !== 'MARDI' && saleDay !== 'VENDREDI') {
      return res.status(400).json({
        error: "Seules les ventes du mardi ou du vendredi sont autorisées. Les ventes ne peuvent pas être créées pour d'autres jours (ex: lundi ou jeudi)."
      });
    }

    const day = (saleDay === 'VENDREDI' ? 'VENDREDI' : 'MARDI') as 'MARDI' | 'VENDREDI';
    const oTime = openTime || '10:00';
    const cTime = closeTime || '22:00';

    let sAt: Date;
    let eAt: Date;

    if (date) {
      // Vérifier que la date explicite correspond bien au jour sélectionné
      const parsedDate = new Date(`${date}T12:00:00Z`);
      const dayOfWeek = parsedDate.getUTCDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
      if (day === 'MARDI' && dayOfWeek !== 2) {
        return res.status(400).json({ error: "La date spécifiée ne correspond pas à un mardi." });
      }
      if (day === 'VENDREDI' && dayOfWeek !== 5) {
        return res.status(400).json({ error: "La date spécifiée ne correspond pas à un vendredi." });
      }

      sAt = new Date(`${date}T${oTime}:00`);
      eAt = new Date(`${date}T${cTime}:00`);
    } else if (startsAt && endsAt) {
      sAt = new Date(startsAt);
      eAt = new Date(endsAt);
    } else {
      const computed = calculateNextSaleDates(day, new Date(), oTime, cTime);
      sAt = computed.startsAt;
      eAt = computed.endsAt;
    }

    const ref = reference || `VENTE-${day === 'MARDI' ? 'MAR' : 'VEN'}-${Date.now().toString().slice(-4)}`;
    const saleTitle = title || (day === 'MARDI' ? `Vente Privée du Mardi (${formatSaleDateHeader(sAt)})` : `Vente Privée du Vendredi (${formatSaleDateHeader(sAt)})`);

    const newSale = await db
      .insert(sales)
      .values({
        reference: ref,
        title: saleTitle,
        description: description || `Vente privée exclusive pour les professionnels antiquaires et brocanteurs (${day.toLowerCase()}).`,
        saleDay: day,
        status: status || 'SCHEDULED',
        startsAt: sAt,
        endsAt: eAt,
        openTime: oTime,
        closeTime: cTime,
        antiSnipeMinutes: antiSnipeMinutes || 2,
      })
      .returning();

    await db.insert(auditLogs).values({
      userId: req.dbUser!.id,
      action: 'CREATE_SALE',
      entityType: 'SALE',
      entityId: ref,
      details: `Création de la vente ${ref}: "${saleTitle}" (${day}) - ${formatSaleHours(sAt, eAt)}`,
    });

    res.json({ sale: newSale[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mettre à jour une vente (statut, horaires, titre, etc.)
app.put('/api/admin/sales/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const saleId = parseInt(req.params.id);
    const { title, description, saleDay, status, startsAt, endsAt, openTime, closeTime } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (saleDay) updateData.saleDay = saleDay;
    if (status) updateData.status = status;
    if (openTime) updateData.openTime = openTime;
    if (closeTime) updateData.closeTime = closeTime;
    if (startsAt) updateData.startsAt = new Date(startsAt);
    if (endsAt) {
      updateData.endsAt = new Date(endsAt);
      // Synchroniser l'échéance des lots attachés
      await db.update(lots).set({ endsAt: new Date(endsAt) }).where(eq(lots.saleId, saleId));
    }

    const updated = await db.update(sales).set(updateData).where(eq(sales.id, saleId)).returning();

    // Si statut passé à LIVE, activer les lots
    if (status === 'LIVE') {
      await db.update(lots).set({ status: 'ACTIVE' }).where(and(eq(lots.saleId, saleId), eq(lots.status, 'DRAFT')));
    }

    await db.insert(auditLogs).values({
      userId: req.dbUser!.id,
      action: 'UPDATE_SALE',
      entityType: 'SALE',
      entityId: updated[0].reference,
      details: `Mise à jour de la vente ${updated[0].reference} (Statut: ${status || updated[0].status})`,
    });

    res.json({ sale: updated[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Assigner des lots à une vente
app.post('/api/admin/sales/:id/lots', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const saleId = parseInt(req.params.id);
    const { lotIds } = req.body;
    if (!Array.isArray(lotIds)) {
      return res.status(400).json({ error: 'lotIds doit être un tableau d’identifiants de lots.' });
    }

    const saleRes = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1);
    if (saleRes.length === 0) return res.status(404).json({ error: 'Vente introuvable.' });
    const sale = saleRes[0];

    // Règle d'exclusivité stricte : un même lot ne doit jamais appartenir à deux ventes simultanément
    for (const lotId of lotIds) {
      const existingLot = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
      if (existingLot.length > 0 && existingLot[0].saleId && existingLot[0].saleId !== saleId) {
        return res.status(400).json({
          error: `ACTION REFUSÉE : Le lot ${existingLot[0].reference} est déjà affecté à une autre vente (Vente ID #${existingLot[0].saleId}). Un même objet ne peut jamais appartenir à deux ventes simultanément. Retirez-le de son ancienne vente avant de le réaffecter.`
        });
      }
    }

    for (const lotId of lotIds) {
      await db
        .update(lots)
        .set({
          saleId,
          endsAt: sale.endsAt,
          updatedAt: new Date(),
        })
        .where(eq(lots.id, lotId));
    }

    res.json({ success: true, count: lotIds.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Retirer un lot d'une vente
app.delete('/api/admin/sales/:id/lots/:lotId', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const lotId = parseInt(req.params.lotId);
    await db.update(lots).set({ saleId: null, updatedAt: new Date() }).where(eq(lots.id, lotId));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Synthèse détaillée d'une vente (avec 1er et 2ème enchérisseurs, paiements et options de transmission)
app.get('/api/admin/sales/:id/summary', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const saleId = parseInt(req.params.id);
    const saleRes = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1);
    if (saleRes.length === 0) return res.status(404).json({ error: 'Vente introuvable.' });
    const sale = saleRes[0];

    const saleLots = await db
      .select({
        lot: lots,
        winner: {
          id: users.id,
          email: users.email,
          companyName: users.companyName,
          phone: users.phone,
        },
      })
      .from(lots)
      .leftJoin(users, eq(lots.currentWinnerId, users.id))
      .where(eq(lots.saleId, saleId))
      .orderBy(asc(lots.id));

    const enrichedLots = await Promise.all(
      saleLots.map(async (item) => {
        const l = item.lot;
        let secondBidderInfo: any = null;

        if (l.secondWinnerId) {
          const secondUser = await db.select().from(users).where(eq(users.id, l.secondWinnerId)).limit(1);
          if (secondUser.length > 0) {
            secondBidderInfo = {
              id: secondUser[0].id,
              email: secondUser[0].email,
              companyName: secondUser[0].companyName,
              amountCents: l.secondBidAmountCents,
            };
          }
        } else if (l.currentWinnerId) {
          const secondBids = await db
            .select()
            .from(bids)
            .where(and(eq(bids.lotId, l.id), sql`${bids.userId} != ${l.currentWinnerId}`))
            .orderBy(desc(bids.maxBidCents), asc(bids.createdAt))
            .limit(1);
          if (secondBids.length > 0) {
            const secondUser = await db.select().from(users).where(eq(users.id, secondBids[0].userId)).limit(1);
            if (secondUser.length > 0) {
              secondBidderInfo = {
                id: secondUser[0].id,
                email: secondUser[0].email,
                companyName: secondUser[0].companyName,
                amountCents: secondBids[0].maxBidCents,
              };
            }
          }
        }

        const orderRes = await db.select().from(orders).where(eq(orders.lotId, l.id)).orderBy(desc(orders.id)).limit(1);
        const order = orderRes[0] || null;

        return {
          lot: l,
          winner: item.winner,
          secondBidder: secondBidderInfo,
          order,
          canOfferSecond: Boolean(secondBidderInfo && order && order.status === 'AWAITING_PAYMENT' && l.paymentStatus !== 'PAID'),
        };
      })
    );

    res.json({
      sale,
      lots: enrichedLots,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Proposer au deuxième meilleur enchérisseur
app.post('/api/admin/lots/:id/offer-second-bidder', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const lotId = parseInt(req.params.id);
    const result = await offerLotToSecondBidder(lotId);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Traitement administratif d'un lot impayé (ex: cas sans 2e enchérisseur)
app.post('/api/admin/lots/:id/mark-unpaid', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const lotId = parseInt(req.params.id);
    const now = new Date();

    await db
      .update(orders)
      .set({ status: 'CANCELLED', notes: 'Défaut de paiement sous 24h - Pris en charge par l’administration' })
      .where(and(eq(orders.lotId, lotId), eq(orders.status, 'AWAITING_PAYMENT')));

    await db
      .update(lots)
      .set({
        paymentStatus: 'UNPAID',
        status: 'UNSOLD',
        updatedAt: now,
      })
      .where(eq(lots.id, lotId));

    res.json({ success: true, message: 'Lot marqué comme impayé et prêt pour traitement administratif.' });
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

    // Activer tous les lots rattachés à cette vente
    await db.update(lots).set({ status: 'ACTIVE' }).where(eq(lots.saleId, saleId));

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
    const secondUsers = alias(users, 'second_winner_user');
    const allLots = await db
      .select({
        lot: lots,
        saleReference: sales.reference,
        winnerEmail: users.email,
        winnerCompany: users.companyName,
        secondWinnerEmail: secondUsers.email,
        secondWinnerCompany: secondUsers.companyName,
      })
      .from(lots)
      .leftJoin(sales, eq(lots.saleId, sales.id))
      .leftJoin(users, eq(lots.currentWinnerId, users.id))
      .leftJoin(secondUsers, eq(lots.secondWinnerId, secondUsers.id))
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
      actualAcquisitionCostCents,
      endsAt,
      images,
      status,
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
        actualAcquisitionCostCents: actualAcquisitionCostCents || targetAcquisitionCostCents || 0,
        endsAt: finalEndsAt,
        images: images || [],
        status: status || 'ACTIVE',
      })
      .returning();

    await db.insert(auditLogs).values({
      userId: req.dbUser!.id,
      action: 'CREATE_LOT',
      entityType: 'LOT',
      entityId: reference,
      details: `Création du lot ${reference}: "${title}" (Mise à prix: ${(startingPriceCents / 100).toFixed(2)} €)`,
    });

    // Initialisation automatique de la ligne financière unique de l'objet (Priorité 2)
    const acqCost = actualAcquisitionCostCents || targetAcquisitionCostCents || 0;
    const directCosts = req.body.directCostsCents || 0;
    try {
      await db
        .insert(financialRecords)
        .values({
          lotId: newLot[0].id,
          reference: newLot[0].reference,
          title: newLot[0].title,
          acquisitionCostCents: acqCost,
          directCostsCents: directCosts,
          paymentFeesCents: 0,
          collectedAmountCents: 0,
          grossMarginCents: -acqCost,
          netMarginCents: -(acqCost + directCosts),
          financialStatus: 'CATALOGUE',
          history: [
            {
              timestamp: new Date().toISOString(),
              event: 'CREATION',
              acquisitionCostCents: acqCost,
              directCostsCents: directCosts,
              notes: 'Initialisation automatique de la ligne financière unique lors de la création du lot.',
            },
          ],
        })
        .onConflictDoNothing();
    } catch (finErr) {
      console.warn('Erreur initialisation ligne financière lot:', finErr);
    }

    res.json({ lot: newLot[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Modification d'un lot existant par l'administrateur
app.put('/api/admin/lots/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const lotId = parseInt(req.params.id);
    const {
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
      actualAcquisitionCostCents,
      acquisitionStatus,
      acquisitionSource,
      acquisitionNotes,
      shippingQuoteRequired,
      customShippingCostCents,
      images,
      status,
      saleId,
    } = req.body;

    const existingRes = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
    if (existingRes.length === 0) return res.status(404).json({ error: 'Lot introuvable.' });
    const existing = existingRes[0];

    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (period !== undefined) updateData.period = period;
    if (dimensions !== undefined) updateData.dimensions = dimensions;
    if (weight !== undefined) updateData.weight = weight;
    if (conditionReport !== undefined) updateData.conditionReport = conditionReport;
    if (flaws !== undefined) updateData.flaws = flaws;
    if (observations !== undefined) updateData.observations = observations;
    if (startingPriceCents !== undefined) {
      updateData.startingPriceCents = startingPriceCents;
      if (existing.bidCount === 0) {
        updateData.currentPriceCents = startingPriceCents;
      }
    }
    if (reservePriceCents !== undefined) updateData.reservePriceCents = reservePriceCents;
    if (targetAcquisitionCostCents !== undefined) updateData.targetAcquisitionCostCents = targetAcquisitionCostCents;
    if (actualAcquisitionCostCents !== undefined) updateData.actualAcquisitionCostCents = actualAcquisitionCostCents;
    if (acquisitionStatus !== undefined) updateData.acquisitionStatus = acquisitionStatus;
    if (acquisitionSource !== undefined) updateData.acquisitionSource = acquisitionSource;
    if (acquisitionNotes !== undefined) updateData.acquisitionNotes = acquisitionNotes;
    if (shippingQuoteRequired !== undefined) updateData.shippingQuoteRequired = shippingQuoteRequired;
    if (customShippingCostCents !== undefined) updateData.customShippingCostCents = customShippingCostCents;
    if (images !== undefined) updateData.images = images;
    if (status !== undefined) updateData.status = status;
    if (saleId !== undefined) updateData.saleId = saleId === null ? null : parseInt(saleId);

    const updated = await db.update(lots).set(updateData).where(eq(lots.id, lotId)).returning();

    await db.insert(auditLogs).values({
      userId: req.dbUser!.id,
      userEmail: req.dbUser!.email,
      action: 'UPDATE_LOT',
      entityType: 'LOT',
      entityId: existing.reference,
      details: `Mise à jour du lot ${existing.reference} ("${updated[0].title}")`,
    });

    res.json({ lot: updated[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Suppression d'un lot (sans offre ou hors vente)
app.delete('/api/admin/lots/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const lotId = parseInt(req.params.id);
    const existingRes = await db.select().from(lots).where(eq(lots.id, lotId)).limit(1);
    if (existingRes.length === 0) return res.status(404).json({ error: 'Lot introuvable.' });
    const lot = existingRes[0];

    if (lot.bidCount > 0 || lot.status === 'SOLD') {
      return res.status(400).json({
        error: 'Impossible de supprimer un objet ayant reçu des offres ou déjà adjugé. Vous pouvez modifier son statut en DRAFT ou CANCELLED.',
      });
    }

    await db.delete(lots).where(eq(lots.id, lotId));

    await db.insert(auditLogs).values({
      userId: req.dbUser!.id,
      userEmail: req.dbUser!.email,
      action: 'DELETE_LOT',
      entityType: 'LOT',
      entityId: lot.reference,
      details: `Suppression du lot ${lot.reference}: "${lot.title}"`,
    });

    res.json({ success: true, message: `Lot ${lot.reference} supprimé avec succès.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Commandes et adjudications (Vue complète des ordres avec statut de règlement sous 24h)
app.get('/api/admin/orders', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const allOrders = await db
      .select({
        order: orders,
        lot: lots,
        buyer: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          companyName: users.companyName,
          phone: users.phone,
          addressLine1: users.addressLine1,
          postalCode: users.postalCode,
          city: users.city,
          country: users.country,
          vatNumber: users.vatNumber,
          status: users.status,
        },
      })
      .from(orders)
      .innerJoin(lots, eq(orders.lotId, lots.id))
      .innerJoin(users, eq(orders.buyerId, users.id))
      .orderBy(desc(orders.id));

    // Récupérer les bordereaux de transaction associés
    const docs = await db.select().from(transactionDocuments);
    const docMap = new Map<number, any>();
    for (const d of docs) {
      docMap.set(d.orderId, d);
    }

    const enriched = allOrders.map((item) => ({
      ...item.order,
      lot: item.lot,
      buyer: item.buyer,
      document: docMap.get(item.order.id) || null,
    }));

    res.json({ orders: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Validation manuelle du règlement d'un bordereau par l'administrateur (Virement, Chèque, etc.)
app.post('/api/admin/orders/:id/mark-paid', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { paymentMethod, paymentReference, notes } = req.body;
    const now = new Date();

    const orderRes = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (orderRes.length === 0) return res.status(404).json({ error: 'Commande introuvable.' });
    const order = orderRes[0];

    const buyerRes = await db.select().from(users).where(eq(users.id, order.buyerId)).limit(1);
    const buyer = buyerRes[0];

    const lotRes = await db.select().from(lots).where(eq(lots.id, order.lotId)).limit(1);
    const lot = lotRes[0];

    await db.update(orders).set({
      status: 'PAID',
      notes: notes ? `${order.notes || ''} [Règlement validé: ${notes}]`.trim() : order.notes,
      updatedAt: now,
    }).where(eq(orders.id, orderId));

    if (lot) {
      await db.update(lots).set({
        paymentStatus: 'PAID',
        status: 'SOLD',
        updatedAt: now,
      }).where(eq(lots.id, lot.id));
    }

    await db.insert(payments).values({
      orderId,
      buyerId: order.buyerId,
      amountCents: order.totalCents,
      currency: 'EUR',
      status: 'PAID',
      provider: paymentMethod || 'VIREMENT_BANCAIRE',
      paymentDate: now,
    });

    // Générer le bordereau / reçu légal
    const existingDoc = await db.select().from(transactionDocuments).where(eq(transactionDocuments.orderId, orderId)).limit(1);
    if (existingDoc.length === 0 && buyer && lot) {
      const buyerName = `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() || buyer.companyName || buyer.email;
      const buyerAddress = `${buyer.addressLine1 || ''} ${buyer.postalCode || ''} ${buyer.city || ''} ${buyer.country || 'France'}`.trim() || 'Adresse professionnelle';
      const docNum = `BORD-${now.getFullYear()}-${String(orderId).padStart(4, '0')}`;

      await db.insert(transactionDocuments).values({
        documentNumber: docNum,
        orderId,
        docType: 'TRANSACTION_CONFIRMATION',
        sellerName: 'Monsieur De Coster',
        sellerStatus: 'Vendeur particulier',
        buyerName,
        buyerCompany: buyer.companyName,
        buyerAddress,
        lotReference: lot.reference,
        lotTitle: lot.title,
        amountCents: order.finalPriceCents,
        shippingCents: order.shippingCostCents,
        totalCents: order.totalCents,
        paymentMethod: paymentMethod || 'Virement bancaire',
        paymentReference: paymentReference || `Règlement direct validé le ${now.toLocaleDateString('fr-FR')}`,
        paidAt: now,
      });
    }

    await db.insert(auditLogs).values({
      userId: req.dbUser!.id,
      userEmail: req.dbUser!.email,
      action: 'ADMIN_MARK_ORDER_PAID',
      entityType: 'ORDER',
      entityId: order.orderNumber,
      details: `Validation manuelle du règlement (${paymentMethod || 'Virement'}) pour ${order.orderNumber} (${(order.totalCents / 100).toFixed(2)} €)`,
    });

    try {
      realtimeHub.sendToUser(order.buyerId, 'order:paid', {
        orderId,
        orderNumber: order.orderNumber,
        status: 'PAID',
        message: `Votre règlement de ${(order.totalCents / 100).toFixed(2)} € pour la commande ${order.orderNumber} a été validé.`,
      });
    } catch {}

    res.json({ success: true, message: 'Règlement validé et bordereau enregistré.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Livre de Police / Registre légal des objets mobiliers (Art. 321-7 Code pénal)
app.get('/api/admin/police-register', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const allLots = await db
      .select({
        lot: lots,
        sale: sales,
        winner: users,
      })
      .from(lots)
      .leftJoin(sales, eq(lots.saleId, sales.id))
      .leftJoin(users, eq(lots.currentWinnerId, users.id))
      .orderBy(asc(lots.id));

    const ordersList = await db.select().from(orders);
    const orderMap = new Map<number, any>();
    for (const o of ordersList) {
      orderMap.set(o.lotId, o);
    }

    const policeEntries = allLots.map((item, index) => {
      const l = item.lot;
      const s = item.sale;
      const w = item.winner;
      const ord = orderMap.get(l.id);

      return {
        orderIndex: index + 1,
        lotId: l.id,
        reference: l.reference,
        entryDate: l.createdAt,
        acquisitionDate: l.acquisitionDate || l.createdAt,
        title: l.title,
        category: l.category,
        period: l.period,
        dimensions: l.dimensions,
        weight: l.weight,
        description: `${l.title} — ${l.category}${l.period ? ` (${l.period})` : ''}. ${l.dimensions ? `Dim: ${l.dimensions}. ` : ''}${l.weight ? `Poids: ${l.weight}. ` : ''}${l.conditionReport || ''}`,
        conditionReport: l.conditionReport,
        flaws: l.flaws,
        source: l.acquisitionSource || 'Collection particulière / Succession familiale',
        targetCostCents: l.targetAcquisitionCostCents || 0,
        actualCostCents: l.actualAcquisitionCostCents || 0,
        startingPriceCents: l.startingPriceCents,
        reservePriceCents: l.reservePriceCents || 0,
        exitDate: l.paymentStatus === 'PAID' && ord ? ord.updatedAt : null,
        saleDate: s ? s.endsAt : null,
        status: l.status,
        paymentStatus: l.paymentStatus,
        adjudicationPriceCents: l.status === 'SOLD' ? l.currentPriceCents : null,
        buyerIdentity: w
          ? `${w.companyName ? `${w.companyName} — ` : ''}${w.firstName || ''} ${w.lastName || ''} (${w.city || ''}, ${w.country || 'FR'})`.trim()
          : null,
        buyerSiretVat: w?.vatNumber || null,
        orderNumber: ord?.orderNumber || null,
      };
    });

    res.json({
      register: policeEntries,
      count: policeEntries.length,
      institution: 'Galerie & Cabinet De Coster',
      legalReference: 'Article 321-7 et R. 321-1 du Code Pénal — Registre des Objets Mobiliers',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Tous les bordereaux de transaction
app.get('/api/admin/documents', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const docs = await db
      .select({
        doc: transactionDocuments,
        orderNumber: orders.orderNumber,
        buyerEmail: users.email,
        buyerCompany: users.companyName,
      })
      .from(transactionDocuments)
      .innerJoin(orders, eq(transactionDocuments.orderId, orders.id))
      .innerJoin(users, eq(orders.buyerId, users.id))
      .orderBy(desc(transactionDocuments.createdAt));

    res.json({ documents: docs });
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

/* ==========================================================================
   REGISTRE FINANCIER AUTOMATIQUE (Section 2 - Priorité 2)
   Ligne financière unique par objet créé, formules strictes :
   - Marge brute = prix de vente retenu - prix d'achat
   - Marge nette opérationnelle = prix de vente retenu - prix d'achat - frais réels supportés
   - Montant encaissé réel = 0 € tant que non payé
   ========================================================================== */

// Récupère l'ensemble du registre financier avec KPIs globaux et garantie d'unicité
app.get('/api/admin/finances', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    // 1. Synchronisation automatique idempotente : assurer que chaque lot existant a une ligne financière unique
    const allLots = await db.select().from(lots);
    for (const l of allLots) {
      const acqCost = l.actualAcquisitionCostCents || l.targetAcquisitionCostCents || 0;
      const finalPrice = l.status === 'SOLD' ? l.currentPriceCents : null;
      const adjPrice = l.status === 'SOLD' ? l.currentPriceCents : null;
      let status = 'CATALOGUE';
      let collected = 0;
      if (l.status === 'ACTIVE') status = 'EN_VENTE';
      else if (l.status === 'SOLD') {
        if (l.paymentStatus === 'PAID') {
          status = 'PAYE_SOLDE';
          collected = l.currentPriceCents;
        } else if (l.paymentStatus === 'OFFERED_SECOND' || l.paymentStatus === 'OFFERED_THIRD') {
          status = 'CASCADE_ATTENTE';
        } else {
          status = 'ADJUGE_ATTENTE';
        }
      } else if (l.status === 'UNSOLD') {
        status = l.paymentStatus === 'UNPAID' ? 'IMPAYE' : 'INVENDU';
      }

      const grossMargin = (finalPrice || 0) - acqCost;
      const netMargin = (finalPrice || 0) - acqCost;

      await db
        .insert(financialRecords)
        .values({
          lotId: l.id,
          reference: l.reference,
          title: l.title,
          acquisitionCostCents: acqCost,
          adjudicatedPriceCents: adjPrice,
          finalPriceCents: finalPrice,
          directCostsCents: 0,
          paymentFeesCents: 0,
          collectedAmountCents: collected,
          grossMarginCents: grossMargin,
          netMarginCents: netMargin,
          financialStatus: status,
          history: [
            {
              timestamp: new Date().toISOString(),
              event: 'AUTO_INIT',
              notes: 'Initialisation automatique de la ligne financière unique.',
            },
          ],
        })
        .onConflictDoNothing();
    }

    // 2. Récupérer toutes les lignes financières avec les données de lots associées
    const records = await db
      .select({
        id: financialRecords.id,
        lotId: financialRecords.lotId,
        reference: financialRecords.reference,
        title: financialRecords.title,
        acquisitionCostCents: financialRecords.acquisitionCostCents,
        adjudicatedPriceCents: financialRecords.adjudicatedPriceCents,
        finalPriceCents: financialRecords.finalPriceCents,
        directCostsCents: financialRecords.directCostsCents,
        paymentFeesCents: financialRecords.paymentFeesCents,
        collectedAmountCents: financialRecords.collectedAmountCents,
        grossMarginCents: financialRecords.grossMarginCents,
        netMarginCents: financialRecords.netMarginCents,
        financialStatus: financialRecords.financialStatus,
        history: financialRecords.history,
        notes: financialRecords.notes,
        createdAt: financialRecords.createdAt,
        updatedAt: financialRecords.updatedAt,
        lotStatus: lots.status,
        lotPaymentStatus: lots.paymentStatus,
        lotEndsAt: lots.endsAt,
        winnerId: lots.currentWinnerId,
      })
      .from(financialRecords)
      .leftJoin(lots, eq(financialRecords.lotId, lots.id))
      .orderBy(desc(financialRecords.id));

    // 3. Calculer les métriques financières globales
    let totalAcquisitionCostCents = 0;
    let totalAdjudicatedPriceCents = 0;
    let totalFinalPriceCents = 0;
    let totalDirectCostsCents = 0;
    let totalPaymentFeesCents = 0;
    let totalCollectedAmountCents = 0;
    let totalGrossMarginCents = 0;
    let totalNetMarginCents = 0;

    for (const r of records) {
      totalAcquisitionCostCents += r.acquisitionCostCents || 0;
      if (r.adjudicatedPriceCents) totalAdjudicatedPriceCents += r.adjudicatedPriceCents;
      if (r.finalPriceCents) totalFinalPriceCents += r.finalPriceCents;
      totalDirectCostsCents += r.directCostsCents || 0;
      totalPaymentFeesCents += r.paymentFeesCents || 0;
      totalCollectedAmountCents += r.collectedAmountCents || 0;
      totalGrossMarginCents += r.grossMarginCents || 0;
      totalNetMarginCents += r.netMarginCents || 0;
    }

    res.json({
      records,
      summary: {
        totalAcquisitionCostCents,
        totalAdjudicatedPriceCents,
        totalFinalPriceCents,
        totalDirectCostsCents,
        totalPaymentFeesCents,
        totalCollectedAmountCents,
        totalGrossMarginCents,
        totalNetMarginCents,
        totalLotsCount: records.length,
        collectedCount: records.filter((r) => r.collectedAmountCents > 0).length,
        pendingPaymentCount: records.filter((r) => r.financialStatus === 'ADJUGE_ATTENTE' || r.financialStatus === 'CASCADE_ATTENTE').length,
        unpaidCount: records.filter((r) => r.financialStatus === 'IMPAYE').length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mise à jour manuelle des frais ou coûts directement imputables par l'administrateur
app.put('/api/admin/finances/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const finId = parseInt(req.params.id, 10);
    const {
      acquisitionCostCents,
      directCostsCents,
      paymentFeesCents,
      notes,
    } = req.body;

    const currentRes = await db.select().from(financialRecords).where(eq(financialRecords.id, finId)).limit(1);
    if (currentRes.length === 0) {
      return res.status(404).json({ error: 'Ligne financière introuvable.' });
    }
    const current = currentRes[0];

    const newAcqCost = acquisitionCostCents !== undefined ? Number(acquisitionCostCents) : current.acquisitionCostCents;
    const newDirectCosts = directCostsCents !== undefined ? Number(directCostsCents) : current.directCostsCents;
    const newPaymentFees = paymentFeesCents !== undefined ? Number(paymentFeesCents) : current.paymentFeesCents;
    const retainedPrice = current.finalPriceCents || current.adjudicatedPriceCents || 0;

    // Formules officielles :
    // Marge brute = prix retenu - prix achat
    // Marge nette opérationnelle = prix retenu - prix achat - frais réellement supportés
    const grossMarginCents = retainedPrice > 0 ? retainedPrice - newAcqCost : -newAcqCost;
    const netMarginCents = retainedPrice > 0
      ? retainedPrice - newAcqCost - newDirectCosts - newPaymentFees
      : -(newAcqCost + newDirectCosts + newPaymentFees);

    const now = new Date();
    const history = Array.isArray(current.history) ? [...current.history] : [];
    history.push({
      timestamp: now.toISOString(),
      event: 'FINANCIAL_UPDATE',
      newAcqCost,
      newDirectCosts,
      newPaymentFees,
      grossMarginCents,
      netMarginCents,
      notes: notes || 'Ajustement des frais réels par l’administrateur',
    });

    const updated = await db
      .update(financialRecords)
      .set({
        acquisitionCostCents: newAcqCost,
        directCostsCents: newDirectCosts,
        paymentFeesCents: newPaymentFees,
        grossMarginCents,
        netMarginCents,
        notes: notes !== undefined ? notes : current.notes,
        history,
        updatedAt: now,
      })
      .where(eq(financialRecords.id, finId))
      .returning();

    // Mettre à jour également le prix d'achat réel sur la table lots pour parfaite cohérence
    if (acquisitionCostCents !== undefined) {
      await db
        .update(lots)
        .set({ actualAcquisitionCostCents: newAcqCost, updatedAt: now })
        .where(eq(lots.id, current.lotId));
    }

    await db.insert(auditLogs).values({
      userId: req.dbUser!.id,
      action: 'UPDATE_FINANCIAL_RECORD',
      entityType: 'FINANCE',
      entityId: current.reference,
      details: `Mise à jour financière du lot ${current.reference}: Achat ${(newAcqCost / 100).toFixed(2)} €, Coûts ${(newDirectCosts / 100).toFixed(2)} €, Frais paiement ${(newPaymentFees / 100).toFixed(2)} €, Marge nette ${(netMarginCents / 100).toFixed(2)} €`,
    });

    res.json({ success: true, record: updated[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

