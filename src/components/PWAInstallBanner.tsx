import React from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import { useNotifications } from '../context/NotificationContext.tsx';
import {
  Smartphone,
  Download,
  Bell,
  Sparkles,
  Zap,
  CheckCircle2,
  Clock,
  Heart,
} from 'lucide-react';

interface PWAInstallBannerProps {
  onOpenInstallModal: () => void;
  onOpenNotificationsModal: () => void;
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({
  onOpenInstallModal,
  onOpenNotificationsModal,
}) => {
  const { isInstalled } = usePWAInstall();
  const { permission } = useNotifications();

  return (
    <div className="bg-gradient-to-r from-[#0B132B] via-[#1C2541] to-[#0B132B] border-y border-[#D4AF37]/30 py-4 px-4 sm:px-6 shadow-xl relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 right-1/4 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Left info */}
        <div className="flex items-center gap-3.5 text-center lg:text-left">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#996515] p-0.5 shadow-lg shrink-0 hidden sm:flex items-center justify-center">
            <div className="w-full h-full bg-[#0B132B] rounded-[10px] flex items-center justify-center text-amber-300">
              <Smartphone className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-center lg:justify-start gap-2 flex-wrap">
              <span className="font-serif font-bold text-base sm:text-lg text-amber-100">
                Application mobile & Alertes de surenchère en direct
              </span>
              <span className="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-mono font-semibold">
                Nouveau
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Téléphone fermé ou en veille : soyez alerté instantanément si un concurrent surenchérit sur l'un de vos objets, lors de la dernière heure de vente ou avant la fin de vos favoris.
            </p>
          </div>
        </div>

        {/* Right action buttons */}
        <div className="flex items-center gap-2.5 flex-wrap justify-center shrink-0">
          {!isInstalled && (
            <button
              type="button"
              onClick={onOpenInstallModal}
              className="bg-gradient-to-r from-[#D4AF37] to-[#B38728] hover:from-[#E5C158] hover:to-[#C59B3C] text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm shadow-lg flex items-center gap-2 transition-all cursor-pointer font-serif"
            >
              <Download className="w-4 h-4 text-slate-950" />
              <span>Installer l'application</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenNotificationsModal}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border flex items-center gap-2 transition-all cursor-pointer ${
              permission === 'granted'
                ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200 hover:bg-emerald-900/60'
                : 'bg-[#1C2541] hover:bg-slate-800 border-[#D4AF37]/40 text-amber-200 hover:text-white'
            }`}
          >
            {permission === 'granted' ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Alertes activées</span>
              </>
            ) : (
              <>
                <Bell className="w-4 h-4 text-amber-400" />
                <span>Régler les notifications</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
