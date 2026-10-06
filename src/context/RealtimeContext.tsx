import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext.tsx';

export interface BidBroadcastEvent {
  lotId: number;
  lotReference: string;
  lotTitle: string;
  currentPriceCents: number;
  bidCount: number;
  endsAt: string;
  wasExtended: boolean;
  winningUserId: number;
  newBid: {
    id?: number;
    publicBidderId: string;
    amountCents: number;
    createdAt: string;
  };
  nextMinCents: number;
  timestamp: string;
}

export interface UserAlertEvent {
  type: 'OUTBID' | 'WINNING';
  lotId: number;
  lotReference: string;
  lotTitle: string;
  message: string;
  newCurrentPriceCents?: number;
  nextMinCents?: number;
  timestamp: number;
}

interface RealtimeContextType {
  isConnected: boolean;
  activeViewersCount: number;
  getLotViewers: (lotId: number) => number;
  setViewingLot: (lotId: number | null) => void;
  lastBidEvent: BidBroadcastEvent | null;
  activeAlert: UserAlertEvent | null;
  dismissAlert: () => void;
  onLotBidReceived?: (handler: (event: BidBroadcastEvent) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

// Générateur de son d'alerte Web Audio natif (aucun fichier externe requis)
function playTone(type: 'outbid' | 'winning') {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'outbid') {
      // Bip d'alerte descendant (alerte surenchère)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
    } else {
      // Carillon ascendant harmonieux (victoire / meneur)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    }
  } catch {
    // Audio non supporté ou bloqué par autoplay
  }
}

// Identifiant de session navigateur stable (évite de compter plusieurs fois le même utilisateur s'il ouvre plusieurs onglets)
function getBrowserSessionId(): string {
  try {
    let s = localStorage.getItem('enchere_device_session_id');
    if (!s) {
      s = sessionStorage.getItem('enchere_browser_session') || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('enchere_device_session_id', s);
    }
    return s;
  } catch {
    return `sess_${Date.now()}`;
  }
}

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [activeViewersCount, setActiveViewersCount] = useState<number>(1);
  const [lotViewersMap, setLotViewersMap] = useState<Record<number, number>>({});
  const [lastBidEvent, setLastBidEvent] = useState<BidBroadcastEvent | null>(null);
  const [activeAlert, setActiveAlert] = useState<UserAlertEvent | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const bidHandlersRef = useRef<Set<(event: BidBroadcastEvent) => void>>(new Set());
  const currentViewingLotRef = useRef<number | null>(null);

  const dismissAlert = useCallback(() => {
    setActiveAlert(null);
  }, []);

  const getLotViewers = useCallback(
    (lotId: number) => {
      // Retourne le nombre exact de sessions consultant ce lot (1 si l'utilisateur est seul sur le site ou la fiche)
      if (lotViewersMap[lotId] !== undefined) {
        const val = lotViewersMap[lotId];
        const maxLimit = Math.max(1, activeViewersCount);
        return Math.min(Math.max(1, val), maxLimit);
      }
      return 1;
    },
    [lotViewersMap, activeViewersCount]
  );

  const setViewingLot = useCallback((lotId: number | null) => {
    currentViewingLotRef.current = lotId;
    if (clientId) {
      fetch('/api/realtime/viewing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, lotId }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (lotId && d.viewersCount !== undefined) {
            setLotViewersMap((prev) => ({ ...prev, [lotId]: Math.max(1, d.viewersCount) }));
          }
        })
        .catch(() => {});
    }
  }, [clientId]);

  const onLotBidReceived = useCallback((handler: (event: BidBroadcastEvent) => void) => {
    bidHandlersRef.current.add(handler);
    return () => {
      bidHandlersRef.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    // Connexion SSE avec sessionId persistant
    const query = new URLSearchParams();
    query.set('sessionId', getBrowserSessionId());
    if (token) query.set('token', token);
    if (currentViewingLotRef.current) query.set('lotId', currentViewingLotRef.current.toString());

    const url = `/api/realtime/stream?${query.toString()}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('open', () => {
      setIsConnected(true);
    });

    es.addEventListener('connected', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setClientId(data.clientId);
        if (data.activeTotalViewers) setActiveViewersCount(data.activeTotalViewers);
      } catch (err) {
        console.error('SSE connected parse error:', err);
      }
    });

    // Événement d'enchère générale (sur tous les lots)
    es.addEventListener('auction:bid', (e: MessageEvent) => {
      try {
        const data: BidBroadcastEvent = JSON.parse(e.data);
        setLastBidEvent(data);

        // Notifier tous les écouteurs enregistrés
        bidHandlersRef.current.forEach((handler) => {
          try {
            handler(data);
          } catch (err) {
            console.error('Handler error:', err);
          }
        });
      } catch (err) {
        console.error('SSE bid parse error:', err);
      }
    });

    // Présence en direct par lot
    es.addEventListener('lot:presence', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.lotId) {
          setLotViewersMap((prev) => ({
            ...prev,
            [data.lotId]: data.viewersCount,
          }));
        }
      } catch {}
    });

    // Alerte personnelle : vous avez été surenchéri !
    es.addEventListener('user:outbid', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 300]);
        }
        playTone('outbid');

        setActiveAlert({
          type: 'OUTBID',
          lotId: data.lotId,
          lotReference: data.lotReference,
          lotTitle: data.lotTitle,
          message: `Votre offre sur « ${data.lotReference} » ne dépasse plus le montant actuel. Vous avez été surenchéri !`,
          newCurrentPriceCents: data.newCurrentPriceCents,
          nextMinCents: data.nextMinCents,
          timestamp: Date.now(),
        });

        // Déclenchement de la notification système / PWA (écran de verrouillage / téléphone fermé)
        if ('Notification' in window && Notification.permission === 'granted') {
          const title = `⚠️ Surenchéri sur le Lot ${data.lotReference}`;
          const options = {
            body: `Votre offre sur « ${data.lotTitle} » a été dépassée. Le montant actuel s'élève à ${(data.newCurrentPriceCents / 100).toFixed(0)} €. Cliquez pour répliquer immédiatement.`,
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag: `outbid-${data.lotId}`, // Tag différencié par objet pour ne pas mélanger les notifications
            data: { lotId: data.lotId },
            vibrate: [200, 100, 300],
            requireInteraction: true,
          };

          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'SHOW_NOTIFICATION',
              title,
              options,
            });
          } else {
            try {
              new Notification(title, options);
            } catch {}
          }
        }
      } catch (err) {
        console.error('SSE user:outbid error:', err);
      }
    });

    // Alerte personnelle : vous êtes désormais le meneur !
    es.addEventListener('user:winning', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        playTone('winning');

        setActiveAlert({
          type: 'WINNING',
          lotId: data.lotId,
          lotReference: data.lotReference,
          lotTitle: data.lotTitle,
          message: `Vous êtes à présent le meilleur enchérisseur sur le lot ${data.lotReference} !`,
          newCurrentPriceCents: data.currentPriceCents,
          timestamp: Date.now(),
        });

        // Notification système
        if ('Notification' in window && Notification.permission === 'granted') {
          const title = `✨ Meilleur enchérisseur : Lot ${data.lotReference}`;
          const options = {
            body: `Félicitations ! Vous menez actuellement la vente de « ${data.lotTitle} » à ${(data.currentPriceCents / 100).toFixed(0)} €.`,
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag: `winning-${data.lotId}`,
            data: { lotId: data.lotId },
          };

          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'SHOW_NOTIFICATION',
              title,
              options,
            });
          } else {
            try {
              new Notification(title, options);
            } catch {}
          }
        }
      } catch {}
    });

    es.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      es.close();
      setIsConnected(false);
    };
  }, [token]);

  return (
    <RealtimeContext.Provider
      value={{
        isConnected,
        activeViewersCount,
        getLotViewers,
        setViewingLot,
        lastBidEvent,
        activeAlert,
        dismissAlert,
        onLotBidReceived,
      }}
    >
      {children}

      {/* Bannière d'alerte push instantanée sur mobile & desktop */}
      {activeAlert && (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-70 animate-in slide-in-from-bottom-5 duration-300">
          <div
            className={`p-4 rounded-xl border shadow-2xl backdrop-blur-md flex items-start gap-3 ${
              activeAlert.type === 'OUTBID'
                ? 'bg-gradient-to-r from-rose-950/95 via-amber-950/90 to-slate-950 border-rose-500/80 text-rose-100'
                : 'bg-gradient-to-r from-emerald-950/95 via-[#1C2541]/90 to-slate-950 border-emerald-500/80 text-emerald-100'
            }`}
          >
            <div className="mt-0.5 shrink-0 text-xl">
              {activeAlert.type === 'OUTBID' ? '⚠️' : '🎉'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs uppercase tracking-wider text-amber-300 font-mono">
                  {activeAlert.type === 'OUTBID' ? 'Surenchère immédiate' : 'Meilleur enchérisseur'}
                </span>
                <span className="text-[10px] text-slate-400">À l'instant</span>
              </div>
              <p className="text-xs sm:text-sm font-semibold mt-0.5 leading-snug">
                {activeAlert.message}
              </p>
              {activeAlert.newCurrentPriceCents && (
                <div className="mt-1 text-xs text-slate-300">
                  Nouveau prix :{' '}
                  <strong className="text-amber-300 font-serif">
                    {(activeAlert.newCurrentPriceCents / 100).toFixed(0)} €
                  </strong>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={dismissAlert}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-black/30 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = () => {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error('useRealtime must be used within RealtimeProvider');
  }
  return ctx;
};
