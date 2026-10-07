import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { db, withDbRetry } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: typeof users.$inferSelect;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifié. Token manquant.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    // Mode email / mot de passe ou simulation
    if (token.startsWith('TOKEN_') || token.startsWith('SIMULATED_')) {
      const email = Buffer.from(token.replace(/^(TOKEN_|SIMULATED_)/, ''), 'base64').toString('utf-8');
      try {
        const matchingUsers = await withDbRetry(() => db.select().from(users).where(eq(users.email, email)));
        if (matchingUsers.length > 0) {
          req.dbUser = matchingUsers[0];
          req.user = { uid: matchingUsers[0].uid, email: matchingUsers[0].email } as any;
          return next();
        }
      } catch (err) {
        console.warn('DB error matching token user:', err);
      }

      // Secours immédiat pour le compte de test professionnel
      if (email === 'client.test@enchere-antiquites.fr') {
        const fallbackTestUser: any = {
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
        req.dbUser = fallbackTestUser;
        req.user = { uid: fallbackTestUser.uid, email: fallbackTestUser.email } as any;
        return next();
      }
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;

    // Retrieve or match user in DB
    const matchingUsers = await withDbRetry(() =>
      db.select().from(users).where(eq(users.uid, decodedToken.uid))
    );

    if (matchingUsers.length > 0) {
      req.dbUser = matchingUsers[0];
    } else {
      // Check if user already seeded by email (e.g. jmmichiels1981@gmail.com)
      if (decodedToken.email) {
        const userEmail = decodedToken.email;
        const emailUsers = await withDbRetry(() =>
          db.select().from(users).where(eq(users.email, userEmail))
        );

        if (emailUsers.length > 0) {
          // Link UID
          const updated = await db
            .update(users)
            .set({ uid: decodedToken.uid, emailVerified: true, updatedAt: new Date() })
            .where(eq(users.id, emailUsers[0].id))
            .returning();
          req.dbUser = updated[0];
        } else {
          // Auto create initial pending profile
          const isOwner =
            decodedToken.email === 'jmmichiels1981@gmail.com' ||
            decodedToken.email === 'contact@encheres-antiquites.com';
          const inserted = await db
            .insert(users)
            .values({
              uid: decodedToken.uid,
              email: decodedToken.email,
              role: isOwner ? 'ADMIN' : 'CUSTOMER',
              status: isOwner ? 'APPROVED' : 'PENDING',
              emailVerified: !!decodedToken.email_verified,
              firstName: isOwner ? 'Monsieur' : (decodedToken.name?.split(' ')[0] || ''),
              lastName: isOwner ? 'De Coster' : (decodedToken.name?.split(' ').slice(1).join(' ') || ''),
              companyName: isOwner ? 'Monsieur De Coster' : undefined,
            })
            .returning();
          req.dbUser = inserted[0];
        }
      }
    }

    next();
  } catch (error) {
    console.error('Erreur vérification token Firebase:', error);
    return res.status(401).json({ error: 'Session invalide ou expirée.' });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    if (token.startsWith('TOKEN_') || token.startsWith('SIMULATED_')) {
      const email = Buffer.from(token.replace(/^(TOKEN_|SIMULATED_)/, ''), 'base64').toString('utf-8');
      const matchingUsers = await db.select().from(users).where(eq(users.email, email));
      if (matchingUsers.length > 0) {
        req.dbUser = matchingUsers[0];
        req.user = { uid: matchingUsers[0].uid, email: matchingUsers[0].email } as any;
      }
      return next();
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    const matchingUsers = await db.select().from(users).where(eq(users.uid, decodedToken.uid));
    if (matchingUsers.length > 0) {
      req.dbUser = matchingUsers[0];
    }
    next();
  } catch {
    next();
  }
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.dbUser || req.dbUser.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs.' });
  }
  next();
};

export const requireApprovedBidder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.dbUser) {
    return res.status(401).json({ error: 'Veuillez vous connecter pour enchérir.' });
  }

  if (req.dbUser.status !== 'APPROVED') {
    return res.status(403).json({
      error: 'Votre compte professionnel est en cours de validation ou restreint.',
      status: req.dbUser.status,
    });
  }

  if (!req.dbUser.acceptedTerms) {
    return res.status(403).json({
      error: 'Veuillez accepter les conditions de participation avant d’enchérir.',
      needsTerms: true,
    });
  }

  next();
};
