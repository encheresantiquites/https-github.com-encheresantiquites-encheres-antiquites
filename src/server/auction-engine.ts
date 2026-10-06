import { db } from '../db/index.ts';
import { lots, bids, bidHistory, users, auditLogs, orders, transactionDocuments, sales } from '../db/schema.ts';
import { eq, and, desc, sql } from 'drizzle-orm';
import { realtimeHub } from './realtime.ts';

/**
 * Règle d'horaire officielle de la plateforme :
 * Chaque lot commence le lundi à 10h et se termine le dimanche à 22h (Heure de Paris).
 */
export function getNextStandardLotSchedule(refDate: Date = new Date()): { startsAt: Date; endsAt: Date } {
  const d = new Date(refDate);
  const day = d.getDay(); // 0: Dimanche, 1: Lundi, ..., 6: Samedi
  
  let mondayOffset = 1 - day;
  if (day === 0) {
    if (d.getHours() >= 22) {
      mondayOffset = 1; // Prochain lundi
    } else {
      mondayOffset = -6; // Lundi de la semaine en cours
    }
  }

  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  monday.setHours(10, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(22, 0, 0, 0);

  return { startsAt: monday, endsAt: sunday };
}

/**
 * Calcule le palier d'incrément minimal en centimes d'euro selon le prix actuel
 */
export function getMinimumIncrementCents(currentPriceCents: number): number {
  if (currentPriceCents < 5000) return 200; // 0 - 49 € -> 2 €
  if (currentPriceCents < 10000) return 500; // 50 - 99 € -> 5 €
  if (currentPriceCents < 20000) return 1000; // 100 - 199 € -> 10 €
  if (currentPriceCents < 50000) return 2000; // 200 - 499 € -> 20 €
  return 2500; // 500 € et plus -> 25 €
}

export interface PlaceBidResult {
  success: boolean;
  message: string;
  currentPriceCents?: number;
  isWinning?: boolean;
  nextMinCents?: number;
  userBidCents?: number;
  endsAt?: Date;
  extended?: boolean;
}

/**
 * Traite une enchère proxy avec montant maximum de manière atomique
 */
export async function placeProxyBid(
  lotId: number,
  userId: number,
  maxBidCents: number,
  ipAddress?: string
): Promise<PlaceBidResult> {
  // Exécuter dans une transaction stricte pour éviter toute concurrence
  return await db.transaction(async (tx) => {
    // 1. Verrouiller la ligne du lot
    const lotRes = await tx
      .select()
      .from(lots)
      .where(eq(lots.id, lotId))
      .for('update');

    if (lotRes.length === 0) {
      return { success: false, message: 'Objet introuvable.' };
    }

    const lot = lotRes[0];
    const now = new Date();

    if (lot.status !== 'ACTIVE') {
      return { success: false, message: 'Ce lot n’est plus ouvert aux enchères.' };
    }

    if (lot.endsAt.getTime() <= now.getTime()) {
      return { success: false, message: 'La vente pour cet objet est clôturée.' };
    }

    // Calcul du minimum requis
    const minIncrement = getMinimumIncrementCents(lot.currentPriceCents);
    const minRequiredBid = lot.bidCount === 0
      ? lot.startingPriceCents
      : lot.currentPriceCents + minIncrement;

    if (maxBidCents < minRequiredBid) {
      return {
        success: false,
        message: `Votre enchère maximale (${(maxBidCents / 100).toFixed(2)} €) doit être d'au moins ${(minRequiredBid / 100).toFixed(2)} €.`,
      };
    }

    // Récupérer le plus haut enchérisseur actuel
    const currentHighBidRes = await tx
      .select()
      .from(bids)
      .where(and(eq(bids.lotId, lotId), eq(bids.isWinning, true)))
      .limit(1);

    let newCurrentPriceCents = lot.currentPriceCents;
    let newWinningUserId = userId;
    let isUserWinning = false;

    // Déterminer le pseudo public anonyme de l'enchérisseur pour ce lot (ex: "Enchérisseur #3")
    const existingUserHistory = await tx
      .select()
      .from(bidHistory)
      .where(and(eq(bidHistory.lotId, lotId), eq(bidHistory.userId, userId)))
      .limit(1);

    let publicBidderId = '';
    if (existingUserHistory.length > 0) {
      publicBidderId = existingUserHistory[0].publicBidderId;
    } else {
      const distinctBidders = await tx
        .select({ count: sql<number>`count(distinct ${bidHistory.userId})` })
        .from(bidHistory)
        .where(eq(bidHistory.lotId, lotId));
      const bidderNumber = (Number(distinctBidders[0]?.count) || 0) + 1;
      publicBidderId = `Enchérisseur #${bidderNumber}`;
    }

    if (currentHighBidRes.length === 0) {
      // Première enchère sur ce lot
      newCurrentPriceCents = lot.startingPriceCents;
      newWinningUserId = userId;
      isUserWinning = true;

      await tx.insert(bids).values({
        lotId,
        userId,
        maxBidCents,
        currentPriceCents: newCurrentPriceCents,
        isWinning: true,
      });

      await tx.insert(bidHistory).values({
        lotId,
        userId,
        publicBidderId,
        amountCents: newCurrentPriceCents,
      });
    } else {
      const highBid = currentHighBidRes[0];

      if (highBid.userId === userId) {
        // L'utilisateur augmente son propre montant maximum
        if (maxBidCents <= highBid.maxBidCents) {
          return {
            success: false,
            message: `Vous êtes déjà le meilleur enchérisseur avec un maximum de ${(highBid.maxBidCents / 100).toFixed(2)} €. Entrez un montant supérieur.`,
          };
        }

        await tx
          .update(bids)
          .set({ maxBidCents })
          .where(eq(bids.id, highBid.id));

        isUserWinning = true;
      } else {
        // Enchère contre un tiers existant
        if (maxBidCents > highBid.maxBidCents) {
          // Le nouveau participant dépasse l'ancien meneur
          const inc = getMinimumIncrementCents(highBid.maxBidCents);
          // Le nouveau prix est le maximum de l'ancien + un incrément (plafonné au max du nouveau)
          newCurrentPriceCents = Math.min(maxBidCents, highBid.maxBidCents + inc);
          newWinningUserId = userId;
          isUserWinning = true;

          // Déchoir l'ancien meneur
          await tx
            .update(bids)
            .set({ isWinning: false })
            .where(eq(bids.id, highBid.id));

          // Enregistrer le nouveau gagnant
          await tx.insert(bids).values({
            lotId,
            userId,
            maxBidCents,
            currentPriceCents: newCurrentPriceCents,
            isWinning: true,
          });

          await tx.insert(bidHistory).values({
            lotId,
            userId,
            publicBidderId,
            amountCents: newCurrentPriceCents,
          });
        } else if (maxBidCents === highBid.maxBidCents) {
          // Égalité : priorité temporelle au premier enchérisseur
          newCurrentPriceCents = highBid.maxBidCents;
          newWinningUserId = highBid.userId;
          isUserWinning = false;

          await tx.insert(bids).values({
            lotId,
            userId,
            maxBidCents,
            currentPriceCents: maxBidCents,
            isWinning: false,
          });

          await tx.insert(bidHistory).values({
            lotId,
            userId,
            publicBidderId,
            amountCents: maxBidCents,
          });
        } else {
          // L'enchère est inférieure au maximum du meneur actuel
          const inc = getMinimumIncrementCents(maxBidCents);
          newCurrentPriceCents = Math.min(highBid.maxBidCents, maxBidCents + inc);
          newWinningUserId = highBid.userId;
          isUserWinning = false;

          await tx.insert(bids).values({
            lotId,
            userId,
            maxBidCents,
            currentPriceCents: maxBidCents,
            isWinning: false,
          });

          // Log de l'offre et de la contre-enchère automatique
          await tx.insert(bidHistory).values({
            lotId,
            userId,
            publicBidderId,
            amountCents: maxBidCents,
          });

          const leaderHistory = await tx
            .select()
            .from(bidHistory)
            .where(and(eq(bidHistory.lotId, lotId), eq(bidHistory.userId, highBid.userId)))
            .limit(1);
          const leaderPublicId = leaderHistory[0]?.publicBidderId || 'Meneur';

          await tx.insert(bidHistory).values({
            lotId,
            userId: highBid.userId,
            publicBidderId: leaderPublicId,
            amountCents: newCurrentPriceCents,
          });
        }
      }
    }

    // Gestion de la prolongation anti-snipe
    let updatedEndsAt = lot.endsAt;
    let wasExtended = false;
    const antiSnipeTriggerMs = 120 * 1000; // 2 minutes avant la fin
    const timeRemainingMs = lot.endsAt.getTime() - now.getTime();

    if (timeRemainingMs > 0 && timeRemainingMs <= antiSnipeTriggerMs) {
      updatedEndsAt = new Date(lot.endsAt.getTime() + 2 * 60 * 1000); // +2 minutes
      wasExtended = true;
    }

    // Mettre à jour le lot
    await tx
      .update(lots)
      .set({
        currentPriceCents: newCurrentPriceCents,
        currentWinnerId: newWinningUserId,
        bidCount: lot.bidCount + 1,
        endsAt: updatedEndsAt,
        updatedAt: now,
      })
      .where(eq(lots.id, lotId));

    // Audit log
    await tx.insert(auditLogs).values({
      userId,
      action: 'PLACE_BID',
      entityType: 'LOT',
      entityId: lot.reference,
      details: `Enchère max ${(maxBidCents / 100).toFixed(2)} € sur ${lot.reference}. Nouveau prix public: ${(newCurrentPriceCents / 100).toFixed(2)} €. Gagnant: ${isUserWinning ? 'OUI' : 'NON'}${wasExtended ? ' [Anti-Snipe +2m]' : ''}`,
      ipAddress,
    });

    const nextMinCents = newCurrentPriceCents + getMinimumIncrementCents(newCurrentPriceCents);

    // Diffusion instantanée multi-utilisateurs en temps réel (SSE < 5ms)
    try {
      realtimeHub.broadcastBidPlaced({
        lotId,
        lotReference: lot.reference,
        lotTitle: lot.title,
        currentPriceCents: newCurrentPriceCents,
        bidCount: lot.bidCount + 1,
        endsAt: updatedEndsAt,
        wasExtended,
        winningUserId: newWinningUserId,
        previousWinnerId: lot.currentWinnerId,
        newBid: {
          publicBidderId,
          amountCents: newCurrentPriceCents,
          createdAt: now,
        },
        nextMinCents,
      });
    } catch (broadcastErr) {
      console.warn('Realtime broadcast warning:', broadcastErr);
    }

    return {
      success: true,
      message: isUserWinning
        ? `Félicitations, vous êtes à présent le meilleur enchérisseur ! Votre offre a dépassé l'offre maximum précédente. L'enchère retenue est de ${(newCurrentPriceCents / 100).toFixed(2)} € (votre montant maximum de ${(maxBidCents / 100).toFixed(2)} € reste confidentiel).`
        : `Votre offre de ${(maxBidCents / 100).toFixed(2)} € ne dépasse pas l'offre maximum d'un autre enchérisseur. Vous avez été immédiatement surenchéri par son enchère automatique. L'enchère est désormais portée à ${(newCurrentPriceCents / 100).toFixed(2)} €.`,
      currentPriceCents: newCurrentPriceCents,
      isWinning: isUserWinning,
      nextMinCents,
      userBidCents: maxBidCents,
      endsAt: updatedEndsAt,
      extended: wasExtended,
    };
  });
}

/**
 * Clôture automatique d'un lot arrivé à expiration
 */
export async function closeExpiredLot(lotId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const lotRes = await tx
      .select()
      .from(lots)
      .where(eq(lots.id, lotId))
      .for('update');

    if (lotRes.length === 0) return;
    const lot = lotRes[0];

    if (lot.status !== 'ACTIVE') return;

    const now = new Date();
    if (lot.endsAt.getTime() > now.getTime()) return;

    if (!lot.currentWinnerId || lot.bidCount === 0) {
      // RÈGLE D'OR : SI OBJET INVENDU (pas d'ENCHÈRES) à la fin du temps imparti (dimanche 22h)
      // Automatiquement le replacer dans Prochaines enchères !
      const nextSchedule = getNextStandardLotSchedule(now);

      await tx
        .update(lots)
        .set({
          status: 'SCHEDULED', // Replacé automatiquement dans Prochaines enchères
          endsAt: nextSchedule.endsAt, // Date de clôture reportée au dimanche suivant à 22h
          bidCount: 0,
          currentPriceCents: lot.startingPriceCents,
          currentWinnerId: null,
          updatedAt: now,
        })
        .where(eq(lots.id, lotId));

      await tx.insert(auditLogs).values({
        action: 'RESCHEDULE_UNSOLD_TO_UPCOMING',
        entityType: 'LOT',
        entityId: lot.reference,
        details: `RÈGLE D'OR : Lot ${lot.reference} invendu (0 offre) à la clôture. Automatiquement replacé dans les prochaines enchères (clôture au ${nextSchedule.endsAt.toISOString()}).`,
      });
      return;
    }

    // Vérifier si prix de réserve atteint
    const reservePrice = lot.reservePriceCents || 0;
    if (reservePrice > 0 && lot.currentPriceCents < reservePrice) {
      // Prix de réserve non atteint : l'objet est invendu -> replacé automatiquement dans les prochaines enchères
      const nextSchedule = getNextStandardLotSchedule(now);

      await tx
        .update(lots)
        .set({
          status: 'SCHEDULED', // Replacé automatiquement dans Prochaines enchères
          endsAt: nextSchedule.endsAt,
          bidCount: 0,
          currentPriceCents: lot.startingPriceCents,
          currentWinnerId: null,
          updatedAt: now,
        })
        .where(eq(lots.id, lotId));

      await tx.insert(auditLogs).values({
        action: 'RESCHEDULE_UNSOLD_TO_UPCOMING',
        entityType: 'LOT',
        entityId: lot.reference,
        details: `RÈGLE D'OR : Lot ${lot.reference} invendu (prix de réserve non atteint). Automatiquement replacé dans les prochaines enchères.`,
      });
      return;
    }

    // Le lot est ADJUGÉ / VENDU
    await tx
      .update(lots)
      .set({ status: 'SOLD', updatedAt: now })
      .where(eq(lots.id, lotId));

    // Créer la commande
    const orderNumber = `CMD-${new Date().getFullYear()}-${String(lot.id).padStart(4, '0')}`;
    const shippingEstimateCents = 2500; // 25 € forfait sécurisé standard
    const totalCents = lot.currentPriceCents + shippingEstimateCents;

    const orderInsert = await tx
      .insert(orders)
      .values({
        orderNumber,
        lotId: lot.id,
        buyerId: lot.currentWinnerId,
        finalPriceCents: lot.currentPriceCents,
        shippingCostCents: shippingEstimateCents,
        totalCents,
        status: 'AWAITING_PAYMENT',
      })
      .returning();

    await tx.insert(auditLogs).values({
      action: 'CLOSE_LOT_SOLD',
      entityType: 'ORDER',
      entityId: orderNumber,
      details: `Lot ${lot.reference} remporté pour ${(lot.currentPriceCents / 100).toFixed(2)} € par l'utilisateur ID ${lot.currentWinnerId}. Commande ${orderNumber} générée.`,
    });
  });
}
