import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext.tsx';
import { FavoritesContext } from './FavoritesContext.tsx';
import { Lot } from '../types/index.ts';

export interface NotificationPreferences {
  notifyOutbid: boolean; // Surenchéri sur l'un de ses objets
  notifyLastHour: boolean; // Dernière heure de vente sur les objets où l'on a enchéri
  notifyFavoritesEnding: boolean; // Rappel si un favori se termine sans offre de notre part
  notifyNewLots: boolean; // Nouveaux objets mis en ligne le lundi
}

interface NotificationContextType {
  permission: NotificationPermission;
  preferences: NotificationPreferences;
  isSupported: boolean;
  requestPermission: () => Promise<boolean>;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
  notifyUser: (title: string, options?: NotificationOptions & { lotId?: number }) => void;
  checkLotsAlerts: (lots: Lot[]) => void;
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  notifyOutbid: true,
  notifyLastHour: true,
  notifyFavoritesEnding: true,
  notifyNewLots: true,
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const favContext = useContext(FavoritesContext);
  const isFavorite = useCallback(
    (lotId: number) => (favContext ? favContext.isFavorite(lotId) : false),
    [favContext]
  );
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => {
    try {
      const saved = localStorage.getItem('auction_notification_prefs');
      return saved ? { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) } : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notifiedLotsHistory, setNotifiedLotsHistory] = useState<Record<string, number>>({});

  const isSupported = typeof window !== 'undefined' && 'Notification' in window;

  useEffect(() => {
    if (isSupported) {
      setPermission(Notification.permission);
    }
  }, [isSupported]);

  const updatePreferences = useCallback((prefs: Partial<NotificationPreferences>) => {
    setPreferences((prev) => {
      const updated = { ...prev, ...prefs };
      try {
        localStorage.setItem('auction_notification_prefs', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    try {
      const res = await Notification.requestPermission();
      setPermission(res);
      return res === 'granted';
    } catch (e) {
      console.warn('Erreur demande permission notifications:', e);
      return false;
    }
  }, [isSupported]);

  const notifyUser = useCallback(
    (title: string, options: NotificationOptions & { lotId?: number } = {}) => {
      if (!isSupported || Notification.permission !== 'granted') return;

      const fullOptions: any = {
        icon: '/icon.svg',
        badge: '/icon.svg',
        vibrate: [200, 100, 300],
        requireInteraction: true,
        ...options,
        data: {
          lotId: options.lotId,
          ...(options.data || {}),
        },
      };

      // Si le Service Worker est actif, passer par lui pour réveiller le téléphone en veille
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          options: fullOptions,
        });
      } else {
        try {
          new Notification(title, fullOptions);
        } catch (e) {
          // Fallback silencieux si constructeur restreint
        }
      }
    },
    [isSupported]
  );

  // Vérification périodique des alertes (dernière heure, favoris expirant)
  const checkLotsAlerts = useCallback(
    (lots: Lot[]) => {
      if (permission !== 'granted') return;
      const now = Date.now();
      const ONE_HOUR_MS = 60 * 60 * 1000;

      lots.forEach((lot) => {
        if (lot.status !== 'ACTIVE') return;
        const endTime = new Date(lot.endsAt).getTime();
        const diffMs = endTime - now;

        // Si la vente se termine dans moins d'une heure et plus de 0 minute
        if (diffMs > 0 && diffMs <= ONE_HOUR_MS) {
          const hasBid = !!lot.userMaxBidCents;
          const isFav = isFavorite(lot.id);

          // 1. Alerte dernière heure sur objet où l'utilisateur participe
          if (hasBid && preferences.notifyLastHour) {
            const key = `lasthour_${lot.id}`;
            if (!notifiedLotsHistory[key]) {
              if (lot.isWinning) {
                notifyUser(`⏳ Dernière heure : Lot ${lot.reference}`, {
                  body: `Plus que ${Math.ceil(diffMs / 60000)} min ! Vous menez actuellement à ${(lot.currentPriceCents / 100).toFixed(0)} €. Restez attentif jusqu'à la fin !`,
                  tag: `lasthour-${lot.id}`,
                  lotId: lot.id,
                });
              } else {
                notifyUser(`⚠️ Clôture dans moins d'1h : Lot ${lot.reference}`, {
                  body: `Votre offre précédente a été dépassée ! Le prix actuel est de ${(lot.currentPriceCents / 100).toFixed(0)} €. Enchérissez vite pour reprendre la tête.`,
                  tag: `lasthour-outbid-${lot.id}`,
                  lotId: lot.id,
                });
              }
              setNotifiedLotsHistory((prev) => ({ ...prev, [key]: now }));
            }
          }

          // 2. Alerte favori qui se termine sans offre de sa part
          if (isFav && !hasBid && preferences.notifyFavoritesEnding) {
            const key = `fav_ending_${lot.id}`;
            if (!notifiedLotsHistory[key]) {
              notifyUser(`⭐ Votre favori se termine bientôt : ${lot.reference}`, {
                body: `« ${lot.title} » prend fin dans ${Math.ceil(diffMs / 60000)} min. Vous n'avez pas encore enchéri ! Mise à prix : ${(lot.currentPriceCents / 100).toFixed(0)} €.`,
                tag: `fav-ending-${lot.id}`,
                lotId: lot.id,
              });
              setNotifiedLotsHistory((prev) => ({ ...prev, [key]: now }));
            }
          }
        }
      });
    },
    [permission, preferences, isFavorite, notifiedLotsHistory, notifyUser]
  );

  return (
    <NotificationContext.Provider
      value={{
        permission,
        preferences,
        isSupported,
        requestPermission,
        updatePreferences,
        notifyUser,
        checkLotsAlerts,
        isModalOpen,
        setIsModalOpen,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return ctx;
};
