import { DEFAULT_LOTS } from '../data/default-lots.ts';
import type { Lot, BidHistoryItem } from '../types/index.ts';
import { getMinimumIncrementCents, type PlaceBidResult } from './auction-engine.ts';
import { realtimeHub } from './realtime.ts';

interface StoredBid {
  id: number;
  lotId: number;
  userId: number;
  maxBidCents: number;
  currentPriceCents: number;
  isWinning: boolean;
  createdAt: Date;
}

class InMemoryAuctionStore {
  private lotsMap: Map<number, Lot> = new Map();
  private bidsList: StoredBid[] = [];
  private historyList: Array<BidHistoryItem & { lotId: number; userId: number }> = [];
  private nextBidId = 100;
  private nextHistoryId = 100;

  constructor() {
    this.resetWithDefaults();
  }

  public resetWithDefaults() {
    this.lotsMap.clear();
    for (const lot of DEFAULT_LOTS) {
      this.lotsMap.set(lot.id, {
        ...lot,
        images: Array.isArray(lot.images) ? [...lot.images] : [],
      });
    }
  }

  public getLot(id: number): Lot | undefined {
    return this.lotsMap.get(id);
  }

  public getAllLots(filter: 'current' | 'ended' | 'upcoming' = 'current'): Lot[] {
    const all = Array.from(this.lotsMap.values());
    if (filter === 'ended') {
      return all.filter((l) => l.status === 'SOLD' || l.status === 'CLOSED');
    }
    if (filter === 'upcoming') {
      return all.filter((l) => l.status === 'DRAFT' || l.status === 'SCHEDULED' || l.status === 'UPCOMING');
    }
    return all.filter((l) => l.status === 'ACTIVE');
  }

  public getHistory(lotId: number): BidHistoryItem[] {
    return this.historyList
      .filter((h) => h.lotId === lotId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(({ id, publicBidderId, amountCents, createdAt }) => ({
        id,
        publicBidderId,
        amountCents,
        createdAt,
      }));
  }

  public getUserMaxBid(lotId: number, userId: number): number | null {
    const userBids = this.bidsList.filter((b) => b.lotId === lotId && b.userId === userId);
    if (userBids.length === 0) return null;
    return Math.max(...userBids.map((b) => b.maxBidCents));
  }

  public getUserActiveBids(userId: number): any[] {
    const userBids = this.bidsList.filter((b) => b.userId === userId);
    const bidsByLot = new Map<number, StoredBid>();
    for (const b of userBids) {
      const existing = bidsByLot.get(b.lotId);
      if (!existing || b.maxBidCents > existing.maxBidCents) {
        bidsByLot.set(b.lotId, b);
      }
    }

    const result = [];
    for (const [lotId, bid] of bidsByLot.entries()) {
      const lot = this.lotsMap.get(lotId);
      if (lot && lot.status === 'ACTIVE') {
        result.push({
          bidId: bid.id,
          lotId: lot.id,
          lotReference: lot.reference,
          lotTitle: lot.title,
          lotImage: (Array.isArray(lot.images) && lot.images[0]) || '',
          currentPriceCents: lot.currentPriceCents,
          myMaxBidCents: bid.maxBidCents,
          isWinning: lot.currentWinnerId === userId,
          endsAt: lot.endsAt,
          lotStatus: lot.status,
        });
      }
    }
    return result;
  }

  public getUserOrders(userId: number): any[] {
    // Commandes acquises pour le compte client (notamment pour Pierre Beaumont / id: 5)
    if (userId === 5) {
      return [
        {
          order: {
            id: 3,
            orderNumber: 'CMD-2026-0099',
            lotId: 9,
            buyerId: 5,
            finalPriceCents: 78000,
            shippingCostCents: 3490,
            totalCents: 81490,
            status: 'SHIPPED',
            shippingCarrier: 'Colissimo Recommandé Expert',
            trackingNumber: '9V018274619FR',
            shippedAt: '2026-10-04T12:15:53.104Z',
            deliveredAt: null,
            notes: null,
            createdAt: '2026-10-05T12:15:53.104Z',
            updatedAt: '2026-10-05T12:15:53.104Z',
          },
          lot: {
            id: 9,
            reference: 'LOT-2026-0000-A',
            title: 'Plaque émaillée de Limoges Sainte-Famille, cadre ébène',
            category: 'Émaux & Objets Religieux',
            images: [
              'https://images.unsplash.com/photo-1615529328331-f8917597711f?auto=format&fit=crop&w=800&q=80',
            ],
          },
        },
      ];
    }
    return [];
  }

  public getUserDocuments(userId: number): any[] {
    if (userId === 5) {
      return [
        {
          doc: {
            id: 2,
            documentNumber: 'REC-2026-0099',
            orderId: 3,
            docType: 'TRANSACTION_CONFIRMATION',
            sellerName: 'Monsieur De Coster',
            sellerStatus: 'Vendeur particulier - Collections privées familiales',
            sellerAddress: 'Lille (59000), France',
            buyerName: 'Pierre Beaumont',
            buyerCompany: 'Antiquités Beaumont & Fils',
            buyerAddress: '14 rue des Beaux-Arts\n75006 Paris, France',
            lotReference: 'LOT-2026-0000-A',
            lotTitle: 'Plaque émaillée de Limoges Sainte-Famille, cadre ébène',
            amountCents: 78000,
            shippingCents: 3490,
            totalCents: 81490,
            paymentMethod: 'PayPal',
            paymentReference: 'PAYID-MHZ9912401',
            paidAt: '2026-10-04T12:15:53.104Z',
            createdAt: '2026-10-05T12:15:53.104Z',
          },
          orderNumber: 'CMD-2026-0099',
        },
      ];
    }
    return [];
  }

  public placeBid(
    lotId: number,
    userId: number,
    maxBidCents: number,
    ipAddress?: string
  ): PlaceBidResult {
    const lot = this.lotsMap.get(lotId);
    if (!lot) {
      return { success: false, message: 'Objet introuvable.' };
    }

    const now = new Date();
    const endsAt = new Date(lot.endsAt);

    if (lot.status !== 'ACTIVE') {
      return { success: false, message: 'Ce lot n’est plus ouvert aux enchères.' };
    }

    if (endsAt.getTime() <= now.getTime()) {
      return { success: false, message: 'La vente pour cet objet est clôturée.' };
    }

    const minIncrement = getMinimumIncrementCents(lot.currentPriceCents);
    const minRequiredBid =
      lot.bidCount === 0 ? lot.startingPriceCents : lot.currentPriceCents + minIncrement;

    if (maxBidCents < minRequiredBid) {
      return {
        success: false,
        message: `Votre enchère maximale (${(maxBidCents / 100).toFixed(2)} €) doit être d'au moins ${(minRequiredBid / 100).toFixed(2)} €.`,
      };
    }

    // Trouver le plus haut enchérisseur actuel
    const currentHighBid = this.bidsList.find((b) => b.lotId === lotId && b.isWinning);

    // Déterminer le pseudo anonyme (ex: "Enchérisseur #2")
    const existingHistory = this.historyList.find((h) => h.lotId === lotId && h.userId === userId);
    let publicBidderId = '';
    if (existingHistory) {
      publicBidderId = existingHistory.publicBidderId;
    } else {
      const distinctUsers = new Set(this.historyList.filter((h) => h.lotId === lotId).map((h) => h.userId));
      publicBidderId = `Enchérisseur #${distinctUsers.size + 1}`;
    }

    let newCurrentPriceCents = lot.currentPriceCents;
    let newWinningUserId = userId;
    let isUserWinning = false;

    if (!currentHighBid) {
      // Première enchère
      newCurrentPriceCents = lot.startingPriceCents;
      newWinningUserId = userId;
      isUserWinning = true;

      this.bidsList.push({
        id: this.nextBidId++,
        lotId,
        userId,
        maxBidCents,
        currentPriceCents: newCurrentPriceCents,
        isWinning: true,
        createdAt: now,
      });

      this.historyList.push({
        id: this.nextHistoryId++,
        lotId,
        userId,
        publicBidderId,
        amountCents: newCurrentPriceCents,
        createdAt: now.toISOString(),
      });
    } else {
      if (currentHighBid.userId === userId) {
        // Augmentation de son propre plafond
        if (maxBidCents <= currentHighBid.maxBidCents) {
          return {
            success: false,
            message: `Vous êtes déjà le meilleur enchérisseur avec un maximum de ${(currentHighBid.maxBidCents / 100).toFixed(2)} €. Entrez un montant supérieur.`,
          };
        }
        currentHighBid.maxBidCents = maxBidCents;
        isUserWinning = true;
      } else {
        if (maxBidCents > currentHighBid.maxBidCents) {
          const inc = getMinimumIncrementCents(currentHighBid.maxBidCents);
          newCurrentPriceCents = Math.min(maxBidCents, currentHighBid.maxBidCents + inc);
          newWinningUserId = userId;
          isUserWinning = true;

          currentHighBid.isWinning = false;

          this.bidsList.push({
            id: this.nextBidId++,
            lotId,
            userId,
            maxBidCents,
            currentPriceCents: newCurrentPriceCents,
            isWinning: true,
            createdAt: now,
          });

          this.historyList.push({
            id: this.nextHistoryId++,
            lotId,
            userId,
            publicBidderId,
            amountCents: newCurrentPriceCents,
            createdAt: now.toISOString(),
          });
        } else if (maxBidCents === currentHighBid.maxBidCents) {
          newCurrentPriceCents = currentHighBid.maxBidCents;
          newWinningUserId = currentHighBid.userId;
          isUserWinning = false;

          this.bidsList.push({
            id: this.nextBidId++,
            lotId,
            userId,
            maxBidCents,
            currentPriceCents: maxBidCents,
            isWinning: false,
            createdAt: now,
          });

          this.historyList.push({
            id: this.nextHistoryId++,
            lotId,
            userId,
            publicBidderId,
            amountCents: maxBidCents,
            createdAt: now.toISOString(),
          });
        } else {
          const inc = getMinimumIncrementCents(maxBidCents);
          newCurrentPriceCents = Math.min(currentHighBid.maxBidCents, maxBidCents + inc);
          newWinningUserId = currentHighBid.userId;
          isUserWinning = false;

          this.bidsList.push({
            id: this.nextBidId++,
            lotId,
            userId,
            maxBidCents,
            currentPriceCents: maxBidCents,
            isWinning: false,
            createdAt: now,
          });

          this.historyList.push({
            id: this.nextHistoryId++,
            lotId,
            userId,
            publicBidderId,
            amountCents: maxBidCents,
            createdAt: now.toISOString(),
          });

          const leaderHistory = this.historyList.find((h) => h.lotId === lotId && h.userId === currentHighBid.userId);
          const leaderPublicId = leaderHistory?.publicBidderId || 'Meneur';

          this.historyList.push({
            id: this.nextHistoryId++,
            lotId,
            userId: currentHighBid.userId,
            publicBidderId: leaderPublicId,
            amountCents: newCurrentPriceCents,
            createdAt: new Date(now.getTime() + 10).toISOString(),
          });
        }
      }
    }

    // Anti-snipe
    let updatedEndsAt = endsAt;
    let wasExtended = false;
    const timeRemainingMs = endsAt.getTime() - now.getTime();
    if (timeRemainingMs > 0 && timeRemainingMs <= 120 * 1000) {
      updatedEndsAt = new Date(endsAt.getTime() + 2 * 60 * 1000);
      wasExtended = true;
    }

    // Mise à jour de l'objet
    lot.currentPriceCents = newCurrentPriceCents;
    lot.currentWinnerId = newWinningUserId;
    lot.bidCount += 1;
    lot.endsAt = updatedEndsAt.toISOString();

    const nextMinCents = newCurrentPriceCents + getMinimumIncrementCents(newCurrentPriceCents);

    // Diffuser SSE
    try {
      realtimeHub.broadcastBidPlaced({
        lotId,
        lotReference: lot.reference,
        lotTitle: lot.title,
        currentPriceCents: newCurrentPriceCents,
        bidCount: lot.bidCount,
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
    } catch (e) {
      // Ignorer
    }

    const message = isUserWinning
      ? `Félicitations, vous êtes à présent le meilleur enchérisseur ! Votre offre a dépassé l'offre maximum précédente. L'enchère retenue est de ${(newCurrentPriceCents / 100).toFixed(2)} € (votre montant maximum de ${(maxBidCents / 100).toFixed(2)} € reste confidentiel).`
      : `Un autre enchérisseur avait déjà placé un ordre automatique supérieur ou égal à votre offre. L'enchère retenue s'élève désormais à ${(newCurrentPriceCents / 100).toFixed(2)} €.`;

    return {
      success: true,
      message,
      currentPriceCents: newCurrentPriceCents,
      isWinning: isUserWinning,
      nextMinCents,
      userBidCents: maxBidCents,
      endsAt: updatedEndsAt,
      extended: wasExtended,
    };
  }
}

export const inMemoryAuctionStore = new InMemoryAuctionStore();
