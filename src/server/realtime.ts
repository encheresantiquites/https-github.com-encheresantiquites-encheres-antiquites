import { Response } from 'express';

export interface RealtimeClient {
  id: string;
  sessionId: string;
  res: Response;
  userId?: number;
  viewingLotId?: number;
  lastPing: number;
}

class AuctionRealtimeHub {
  private clients: Map<string, RealtimeClient> = new Map();
  private lotViewers: Map<number, Set<string>> = new Map();

  constructor() {
    // Nettoyage régulier des connexions mortes
    setInterval(() => {
      const now = Date.now();
      for (const [id, client] of this.clients.entries()) {
        try {
          client.res.write(': keepalive\n\n');
        } catch {
          this.removeClient(id);
        }
      }
    }, 20000);
  }

  public addClient(id: string, res: Response, userId?: number, viewingLotId?: number, sessionId?: string): void {
    const finalSessionId = sessionId || id;

    // Fermer et nettoyer immédiatement toute ancienne connexion fantôme issue de la même session (reconnexion, StrictMode, F5)
    for (const [existingId, existingClient] of this.clients.entries()) {
      if (
        (existingClient.sessionId === finalSessionId || (userId && existingClient.userId === userId)) &&
        existingId !== id
      ) {
        try {
          existingClient.res.end();
        } catch {}
        this.removeClient(existingId);
      }
    }

    const client: RealtimeClient = {
      id,
      sessionId: finalSessionId,
      res,
      userId,
      viewingLotId,
      lastPing: Date.now(),
    };

    this.clients.set(id, client);

    if (viewingLotId) {
      this.updateViewing(id, viewingLotId);
    }

    // Émettre l'état initial de bienvenue avec nombre réel de sessions uniques connectées
    const uniqueSessionCount = new Set(Array.from(this.clients.values()).map((c) => c.sessionId)).size;
    this.sendToClient(id, 'connected', {
      clientId: id,
      timestamp: new Date().toISOString(),
      activeTotalViewers: Math.max(1, uniqueSessionCount),
    });
  }

  public updateViewing(clientId: string, lotId: number | null): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Retirer du lot précédent
    if (client.viewingLotId && client.viewingLotId !== lotId) {
      const prevSet = this.lotViewers.get(client.viewingLotId);
      if (prevSet) {
        prevSet.delete(client.sessionId);
        this.broadcastLotPresence(client.viewingLotId);
      }
    }

    client.viewingLotId = lotId || undefined;

    // Ajouter au nouveau lot par sessionId unique
    if (lotId) {
      if (!this.lotViewers.has(lotId)) {
        this.lotViewers.set(lotId, new Set());
      }
      this.lotViewers.get(lotId)!.add(client.sessionId);
      this.broadcastLotPresence(lotId);
    }
  }

  public removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      if (client.viewingLotId) {
        const set = this.lotViewers.get(client.viewingLotId);
        if (set) {
          set.delete(client.sessionId);
          this.broadcastLotPresence(client.viewingLotId);
        }
      }
      this.clients.delete(clientId);
    }
  }

  public getLotViewersCount(lotId: number): number {
    return this.lotViewers.get(lotId)?.size || 0;
  }

  public broadcastLotPresence(lotId: number): void {
    const count = this.getLotViewersCount(lotId);
    this.broadcast('lot:presence', {
      lotId,
      viewersCount: Math.max(0, count),
    });
  }

  public broadcastBidPlaced(data: {
    lotId: number;
    lotReference: string;
    lotTitle: string;
    currentPriceCents: number;
    bidCount: number;
    endsAt: Date | string;
    wasExtended: boolean;
    winningUserId: number;
    previousWinnerId?: number | null;
    newBid: {
      id?: number;
      publicBidderId: string;
      amountCents: number;
      createdAt: Date | string;
    };
    nextMinCents: number;
  }): void {
    // 1. Broadcast public général à tous les clients connectés
    this.broadcast('auction:bid', {
      ...data,
      endsAt: typeof data.endsAt === 'string' ? data.endsAt : data.endsAt.toISOString(),
      timestamp: new Date().toISOString(),
    });

    // 2. Événements personnels ciblés pour chaque utilisateur connecté
    for (const [, client] of this.clients.entries()) {
      if (!client.userId) continue;

      if (client.userId === data.winningUserId) {
        // Le client est le nouveau meneur
        this.sendToClient(client.id, 'user:winning', {
          lotId: data.lotId,
          lotReference: data.lotReference,
          lotTitle: data.lotTitle,
          currentPriceCents: data.currentPriceCents,
        });
      } else if (data.previousWinnerId && client.userId === data.previousWinnerId) {
        // Le client vient d'être déchu de sa position de meneur !
        this.sendToClient(client.id, 'user:outbid', {
          lotId: data.lotId,
          lotReference: data.lotReference,
          lotTitle: data.lotTitle,
          newCurrentPriceCents: data.currentPriceCents,
          nextMinCents: data.nextMinCents,
        });
      }
    }
  }

  public broadcast(event: string, payload: any): void {
    const raw = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const [id, client] of this.clients.entries()) {
      try {
        client.res.write(raw);
      } catch {
        this.removeClient(id);
      }
    }
  }

  private sendToClient(clientId: string, event: string, payload: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    try {
      client.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      this.removeClient(clientId);
    }
  }
}

export const realtimeHub = new AuctionRealtimeHub();
