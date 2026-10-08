import { db } from '../db/index.ts';
import { lots, bids, bidHistory, users, auditLogs, orders, transactionDocuments, sales } from '../db/schema.ts';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { realtimeHub } from './realtime.ts';
import { inMemoryAuctionStore } from './in-memory-store.ts';
import { calculateShipping } from '../lib/shipping.ts';
import { calculateNextSaleDates } from '../lib/sales-schedule.ts';

/**
 * Règle du calendrier officiel de la plateforme :
 * Deux ventes privées par semaine : MARDI et VENDREDI.
 * Si un lot n'a pas reçu d'offre ou n'a pas atteint le prix de réserve,
 * il est automatiquement reprogrammé pour la prochaine vente officielle (Mardi ou Vendredi).
 */
export function getNextStandardLotSchedule(refDate: Date = new Date()): { startsAt: Date; endsAt: Date } {
  const d = new Date(refDate);
  const day = d.getDay(); // 0: Dimanche, 1: Lundi, 2: Mardi, 3: Mercredi, 4: Jeudi, 5: Vendredi, 6: Samedi
  
  // Si avant mardi soir -> Vente du Mardi
  // Si entre mardi soir et vendredi soir -> Vente du Vendredi
  // Si après vendredi soir -> Vente du Mardi suivant
  let targetDay: 'MARDI' | 'VENDREDI' = 'MARDI';
  if (day === 2 && d.getHours() >= 20) {
    targetDay = 'VENDREDI';
  } else if (day === 3 || day === 4) {
    targetDay = 'VENDREDI';
  } else if (day === 5 && d.getHours() >= 20) {
    targetDay = 'MARDI';
  } else if (day === 5) {
    targetDay = 'VENDREDI';
  } else if (day === 6 || day === 0 || day === 1) {
    targetDay = 'MARDI';
  }

  return calculateNextSaleDates(targetDay, d);
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
  try {
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

    // Vérifier également le statut de la vente si le lot y est rattaché
    if (lot.saleId) {
      const saleRes = await tx.select().from(sales).where(eq(sales.id, lot.saleId)).limit(1);
      if (saleRes.length > 0) {
        const sale = saleRes[0];
        if (sale.status !== 'LIVE') {
          return {
            success: false,
            message: ['SCHEDULED', 'DRAFT'].includes(sale.status)
              ? 'La vente n’est pas encore ouverte aux enchères.'
              : 'La vente pour cet objet est clôturée.',
          };
        }
        if (sale.endsAt.getTime() <= now.getTime()) {
          return { success: false, message: 'La vente pour cet objet est clôturée.' };
        }
      }
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
  } catch (err: any) {
    console.warn('[Auction Engine] Transaction PostgreSQL échouée, bascule vers le moteur mémoire haute disponibilité:', err?.message || err);
    return inMemoryAuctionStore.placeBid(lotId, userId, maxBidCents, ipAddress);
  }
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

    // Identifier le deuxième meilleur enchérisseur pour ce lot
    const otherBids = await tx
      .select({
        userId: bids.userId,
        maxBidCents: sql<number>`max(${bids.maxBidCents})`,
      })
      .from(bids)
      .where(and(eq(bids.lotId, lotId), sql`${bids.userId} != ${lot.currentWinnerId}`))
      .groupBy(bids.userId)
      .orderBy(desc(sql`max(${bids.maxBidCents})`))
      .limit(1);

    const secondWinnerId = otherBids.length > 0 ? otherBids[0].userId : null;
    const secondBidAmountCents = otherBids.length > 0 ? Number(otherBids[0].maxBidCents) : 0;
    const paymentDueAt = new Date(now.getTime() + 24 * 3600 * 1000); // Délai strict de 24h

    // Le lot est ADJUGÉ / VENDU -> Passe au statut À PAYER
    await tx
      .update(lots)
      .set({
        status: 'SOLD',
        secondWinnerId,
        secondBidAmountCents,
        paymentDueAt,
        paymentStatus: 'AWAITING_PAYMENT',
        updatedAt: now,
      })
      .where(eq(lots.id, lotId));

    // Créer la commande avec la grille tarifaire unique de livraison (FR / BE)
    const orderNumber = `CMD-${new Date().getFullYear()}-${String(lot.id).padStart(4, '0')}`;
    const shippingCalc = calculateShipping(lot.weight, {
      shippingQuoteRequired: Boolean((lot as any).shippingQuoteRequired),
      customShippingCostCents: (lot as any).customShippingCostCents,
    });
    const shippingCostCents = shippingCalc.costCents;
    const totalCents = lot.currentPriceCents + shippingCostCents;

    const orderInsert = await tx
      .insert(orders)
      .values({
        orderNumber,
        lotId: lot.id,
        buyerId: lot.currentWinnerId,
        finalPriceCents: lot.currentPriceCents,
        shippingCostCents,
        totalCents,
        status: 'AWAITING_PAYMENT',
      })
      .returning();

    await tx.insert(auditLogs).values({
      action: 'CLOSE_LOT_SOLD',
      entityType: 'ORDER',
      entityId: orderNumber,
      details: `Lot ${lot.reference} remporté pour ${(lot.currentPriceCents / 100).toFixed(2)} € par l'utilisateur ID ${lot.currentWinnerId}. 2ème enchérisseur: ID ${secondWinnerId || 'Aucun'} (${(secondBidAmountCents / 100).toFixed(2)} €). Commande ${orderNumber} générée (délai 24h).`,
    });

    try {
      realtimeHub.sendToUser(lot.currentWinnerId, 'order:won', {
        lotId: lot.id,
        lotReference: lot.reference,
        lotTitle: lot.title,
        orderNumber,
        finalPriceCents: lot.currentPriceCents,
        paymentDueAt,
        message: `Félicitations ! Vous avez remporté le lot ${lot.reference}. Votre règlement de ${(lot.currentPriceCents / 100).toFixed(2)} € est attendu sous 24h.`,
      });
    } catch {}
  });
}

/**
 * Propose le lot au deuxième meilleur enchérisseur en cas de non-paiement du gagnant dans les 24h
 */
export async function offerLotToSecondBidder(lotId: number): Promise<{ success: boolean; message: string }> {
  return await db.transaction(async (tx) => {
    const lotRes = await tx.select().from(lots).where(eq(lots.id, lotId)).for('update');
    if (lotRes.length === 0) return { success: false, message: 'Lot introuvable.' };
    const lot = lotRes[0];

    // Trouver tous les enchérisseurs précédents dont la commande a déjà été annulée ou qui ont déjà remporté/refusé
    const pastOrders = await tx
      .select({ buyerId: orders.buyerId, status: orders.status })
      .from(orders)
      .where(eq(orders.lotId, lotId));

    const excludedUserIds = new Set<number>();
    for (const o of pastOrders) {
      if (o.status === 'CANCELLED') {
        excludedUserIds.add(o.buyerId);
      }
    }
    if (lot.currentWinnerId) {
      excludedUserIds.add(lot.currentWinnerId);
    }

    // Récupérer le classement des enchérisseurs par montant maximum décroissant
    const candidateBids = await tx
      .select({
        userId: bids.userId,
        maxBidCents: sql<number>`max(${bids.maxBidCents})`,
      })
      .from(bids)
      .where(eq(bids.lotId, lotId))
      .groupBy(bids.userId)
      .orderBy(desc(sql`max(${bids.maxBidCents})`));

    const nextCandidate = candidateBids.find((b) => !excludedUserIds.has(b.userId));

    if (!nextCandidate) {
      // Annuler la commande impayée en cours
      await tx
        .update(orders)
        .set({ status: 'CANCELLED', notes: 'Annulé pour défaut de paiement sous 24h - Aucun enchérisseur suivant' })
        .where(and(eq(orders.lotId, lotId), eq(orders.status, 'AWAITING_PAYMENT')));

      await tx
        .update(lots)
        .set({
          status: 'UNSOLD',
          paymentStatus: 'UNPAID',
          updatedAt: new Date(),
        })
        .where(eq(lots.id, lotId));

      return {
        success: false,
        message: 'Aucun deuxième ou prochain enchérisseur disponible pour ce lot.',
      };
    }

    const now = new Date();
    const newPaymentDueAt = new Date(now.getTime() + 24 * 3600 * 1000); // 24h accordées au prochain enchérisseur

    // Annuler la commande impayée en cours
    await tx
      .update(orders)
      .set({ status: 'CANCELLED', notes: 'Annulé pour défaut de paiement sous 24h - Transmis au candidat suivant' })
      .where(and(eq(orders.lotId, lotId), eq(orders.status, 'AWAITING_PAYMENT')));

    // Nouveau montant d'adjudication pour le prochain enchérisseur
    const finalPriceCents = Number(nextCandidate.maxBidCents);
    const shippingCalc = calculateShipping(lot.weight, {
      shippingQuoteRequired: Boolean((lot as any).shippingQuoteRequired),
      customShippingCostCents: (lot as any).customShippingCostCents,
    });
    const shippingCostCents = shippingCalc.costCents;
    const totalCents = finalPriceCents + shippingCostCents;

    const rankSuffix = excludedUserIds.size === 1 ? '2ND' : `${excludedUserIds.size + 1}TH`;
    const orderNumber = `CMD-${now.getFullYear()}-${String(lot.id).padStart(4, '0')}-${rankSuffix}`;

    await tx.insert(orders).values({
      orderNumber,
      lotId: lot.id,
      buyerId: nextCandidate.userId,
      finalPriceCents,
      shippingCostCents,
      totalCents,
      status: 'AWAITING_PAYMENT',
      notes: `Attribué à l'enchérisseur suivant (ID ${nextCandidate.userId}) suite au défaut de paiement.`,
    });

    // Mettre à jour le lot
    await tx
      .update(lots)
      .set({
        currentWinnerId: nextCandidate.userId,
        currentPriceCents: finalPriceCents,
        paymentStatus: 'OFFERED_SECOND',
        offeredToSecondAt: now,
        paymentDueAt: newPaymentDueAt,
        updatedAt: now,
      })
      .where(eq(lots.id, lotId));

    // Audit log
    await tx.insert(auditLogs).values({
      action: 'OFFER_TO_NEXT_BIDDER',
      entityType: 'LOT',
      entityId: lot.reference,
      details: `Lot ${lot.reference} réattribué au candidat suivant (ID ${nextCandidate.userId}) pour ${(finalPriceCents / 100).toFixed(2)} €. Commande ${orderNumber} créée (délai 24h).`,
    });

    // Notification ciblée au bénéficiaire suivant
    try {
      realtimeHub.sendToUser(nextCandidate.userId, 'order:offered', {
        lotId: lot.id,
        lotReference: lot.reference,
        lotTitle: lot.title,
        orderNumber,
        finalPriceCents,
        paymentDueAt: newPaymentDueAt,
        message: `Le lot ${lot.reference} vous est proposé pour ${(finalPriceCents / 100).toFixed(2)} € suite à un défaut de paiement. Vous disposez de 24h pour finaliser le règlement.`,
      });
    } catch {}

    return {
      success: true,
      message: `Le lot ${lot.reference} a été proposé avec succès à l'enchérisseur suivant pour ${(finalPriceCents / 100).toFixed(2)} € (délai 24h accordé).`,
    };
  });
}

/**
 * Tâche d'arrière-plan automatisée :
 * 1. Ouvre les ventes programmées lorsque leur heure est atteinte
 * 2. Clôture les ventes en cours et détermine les vainqueurs
 */
export async function updateSalesStatusesAndClosures(): Promise<void> {
  try {
    const now = new Date();

    // 1. Ouvrir les ventes programmées arrivées à échéance
    const scheduledSales = await db
      .select()
      .from(sales)
      .where(and(eq(sales.status, 'SCHEDULED'), sql`${sales.startsAt} <= ${now}`, sql`${sales.endsAt} > ${now}`));

    for (const s of scheduledSales) {
      await db.update(sales).set({ status: 'LIVE', updatedAt: now }).where(eq(sales.id, s.id));
      await db.update(lots).set({ status: 'ACTIVE', updatedAt: now }).where(and(eq(lots.saleId, s.id), eq(lots.status, 'DRAFT')));
      console.log(`[Sales Scheduler] Vente ${s.reference} passée à LIVE.`);
    }

    // 2. Clôturer les ventes en cours arrivées à terme
    const liveSales = await db
      .select()
      .from(sales)
      .where(and(eq(sales.status, 'LIVE'), sql`${sales.endsAt} <= ${now}`));

    for (const s of liveSales) {
      await db.update(sales).set({ status: 'ENDED', updatedAt: now }).where(eq(sales.id, s.id));
      const saleLots = await db.select({ id: lots.id }).from(lots).where(and(eq(lots.saleId, s.id), eq(lots.status, 'ACTIVE')));
      for (const l of saleLots) {
        await closeExpiredLot(l.id);
      }
      console.log(`[Sales Scheduler] Vente ${s.reference} passée à ENDED (${saleLots.length} lots clôturés).`);
    }
  } catch (err) {
    console.warn('[Sales Scheduler] Erreur lors de la mise à jour des statuts des ventes:', err);
  }
}
