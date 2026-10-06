import React from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import {
  Smartphone,
  Download,
  Share2,
  PlusSquare,
  CheckCircle2,
  X,
  Bell,
  Sparkles,
  Zap,
  ShieldCheck,
} from 'lucide-react';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNotifications?: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  onOpenNotifications,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      onClose();
      if (onOpenNotifications) {
        setTimeout(onOpenNotifications, 500);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="relative w-full max-w-lg bg-[#0B132B] border border-[#D4AF37] rounded-2xl shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="bg-[#1C2541] px-5 py-4 border-b border-[#D4AF37]/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#996515] p-0.5 shadow-md">
              <div className="w-full h-full bg-[#0B132B] rounded-[9px] flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-[#D4AF37]" />
              </div>
            </div>
            <div>
              <h2 className="font-serif font-bold text-base sm:text-lg text-amber-100">
                Installer l'application Enchères
              </h2>
              <p className="text-[11px] text-amber-300 font-mono">
                Version mobile optimisée pour antiquaires
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-5">
          {/* Why install pills */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div className="bg-[#1C2541]/90 border border-slate-800 p-2.5 rounded-xl flex items-start gap-2">
              <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-200 block">Alertes écran verrouillé</strong>
                <span className="text-slate-400 text-[11px]">Prévenu même téléphone en veille si quelqu'un vous surenchérit.</span>
              </div>
            </div>
            <div className="bg-[#1C2541]/90 border border-slate-800 p-2.5 rounded-xl flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-200 block">Accès instantané 1-clic</strong>
                <span className="text-slate-400 text-[11px]">Icône dédiée sur votre écran d'accueil sans retaper l'adresse.</span>
              </div>
            </div>
            <div className="bg-[#1C2541]/90 border border-slate-800 p-2.5 rounded-xl flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-200 block">Plein écran & Réactivité</strong>
                <span className="text-slate-400 text-[11px]">Supprime la barre d'adresse pour un confort d'enchère optimal.</span>
              </div>
            </div>
            <div className="bg-[#1C2541]/90 border border-slate-800 p-2.5 rounded-xl flex items-start gap-2">
              <Bell className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-200 block">Suivi multi-lots</strong>
                <span className="text-slate-400 text-[11px]">Notifications indépendantes pour chacun de vos objets suivis.</span>
              </div>
            </div>
          </div>

          {/* Installation Instructions Flow */}
          {isInstalled ? (
            <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-xl p-4 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <div className="font-serif font-bold text-emerald-200 text-sm">
                L'application est déjà installée sur cet appareil !
              </div>
              <p className="text-xs text-slate-300">
                Vous profitez du mode plein écran et des alertes immédiates en direct.
              </p>
            </div>
          ) : isIOS ? (
            /* Guide pas-à-pas spécial iPhone / iPad Safari */
            <div className="bg-[#1C2541] border border-amber-500/40 rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold text-amber-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-amber-400" />
                <span>Procédure pour iPhone / iPad (Safari) :</span>
              </div>
              <ol className="space-y-2 text-xs text-slate-200 list-decimal list-inside leading-relaxed">
                <li className="bg-[#0B132B] p-2 rounded-lg border border-slate-800">
                  En bas de votre écran Safari, appuyez sur le bouton <strong>Partager</strong> <Share2 className="w-3.5 h-3.5 inline mx-1 text-sky-400" />.
                </li>
                <li className="bg-[#0B132B] p-2 rounded-lg border border-slate-800">
                  Faites défiler vers le bas et touchez <strong>« Sur l'écran d'accueil »</strong> <PlusSquare className="w-3.5 h-3.5 inline mx-1 text-emerald-400" />.
                </li>
                <li className="bg-[#0B132B] p-2 rounded-lg border border-slate-800">
                  Touchez <strong>« Ajouter »</strong> en haut à droite. L'icône dorée apparaîtra sur votre téléphone !
                </li>
              </ol>
            </div>
          ) : (
            /* Bouton 1-clic pour Android, Chrome, Edge, PC/Mac */
            <div className="text-center space-y-3 pt-1">
              <button
                type="button"
                onClick={handleInstallClick}
                className="w-full bg-gradient-to-r from-[#D4AF37] via-[#F3E5AB] to-[#D4AF37] text-slate-950 font-bold py-3.5 rounded-xl text-sm shadow-xl flex items-center justify-center gap-2 hover:brightness-110 transition-all cursor-pointer font-serif"
              >
                <Download className="w-4 h-4 text-slate-950" />
                <span>INSTALLER L'APPLICATION MAINTENANT (1 CLIC)</span>
              </button>
              <p className="text-[11px] text-slate-400">
                Installation sécurisée et ultra-légère sans passer par les stores encombrants.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#1C2541] px-5 py-3 border-t border-slate-800 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              onClose();
              if (onOpenNotifications) onOpenNotifications();
            }}
            className="text-amber-300 hover:text-white underline font-medium cursor-pointer"
          >
            ⚙️ Régler les notifications d'alertes
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
