import React, { useState } from 'react';
import { useNotifications } from '../context/NotificationContext.tsx';
import {
  Bell,
  BellRing,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Heart,
  X,
  Volume2,
  Smartphone,
} from 'lucide-react';

export const NotificationPreferencesModal: React.FC = () => {
  const {
    permission,
    preferences,
    updatePreferences,
    requestPermission,
    notifyUser,
    isModalOpen,
    setIsModalOpen,
  } = useNotifications();

  const [testSent, setTestSent] = useState(false);

  if (!isModalOpen) return null;

  const handleEnable = async () => {
    const granted = await requestPermission();
    if (granted) {
      handleTestNotification();
    }
  };

  const handleTestNotification = () => {
    notifyUser('🔔 Test d’alerte : Lot PEND-02 (Pendule Empire)', {
      body: 'Exemple : Un concurrent a surenchéri à 140 €. Cliquez pour voir l’objet et riposter.',
      lotId: 1,
    });
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="relative w-full max-w-lg bg-[#0B132B] border border-[#D4AF37]/50 rounded-2xl shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="bg-[#1C2541] px-5 py-4 border-b border-[#D4AF37]/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#0B132B] border border-[#D4AF37]/40 flex items-center justify-center text-amber-300">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-base text-amber-100">
                Centre de notifications & alertes
              </h2>
              <p className="text-[11px] text-slate-400">
                Ne manquez aucune enchère, même téléphone en veille ou fermé
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Permission Status Box */}
          {permission !== 'granted' ? (
            <div className="bg-gradient-to-r from-amber-950/70 to-slate-900 border border-amber-500/50 rounded-xl p-4 text-xs space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Autorisation nécessaire sur votre appareil</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Pour recevoir les alertes instantanées lorsque vous êtes surenchéri ou pendant la dernière heure, autorisez les notifications dans votre navigateur.
              </p>
              <button
                type="button"
                onClick={handleEnable}
                className="w-full bg-gradient-to-r from-[#D4AF37] to-[#B38728] hover:from-[#E5C158] hover:to-[#C59B3C] text-slate-950 font-bold py-2.5 rounded-lg text-xs shadow flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                <span>Activer les notifications sur cet appareil</span>
              </button>
            </div>
          ) : (
            <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-xl p-3 flex items-center justify-between text-xs text-emerald-200">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Notifications autorisées sur cet appareil</span>
              </div>
              <button
                type="button"
                onClick={handleTestNotification}
                className="text-[11px] bg-[#1C2541] hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                {testSent ? '✓ Envoyé !' : 'Tester un bip d’alerte'}
              </button>
            </div>
          )}

          <div className="space-y-3 pt-1">
            <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-400 font-mono">
              Choisissez vos alertes par objet :
            </h3>

            {/* 1. Surenchère immédiate */}
            <label className="bg-[#1C2541] border border-slate-800 hover:border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={preferences.notifyOutbid}
                onChange={(e) => updatePreferences({ notifyOutbid: e.target.checked })}
                className="mt-1 rounded border-slate-600 text-amber-500 focus:ring-amber-500 cursor-pointer"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-semibold text-amber-200 text-xs sm:text-sm">
                  <span>⚠️ Surenchère immédiate par objet</span>
                  <span className="text-[10px] bg-amber-900/60 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30 font-mono">Prioritaire</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  Alerte instantanée dès qu'un concurrent surenchérit sur l'un de vos objets. Chaque objet a sa propre notification distincte (ex. Pendule, Commode, Tableau) pour ne rien mélanger.
                </p>
              </div>
            </label>

            {/* 2. Dernière heure de vente */}
            <label className="bg-[#1C2541] border border-slate-800 hover:border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={preferences.notifyLastHour}
                onChange={(e) => updatePreferences({ notifyLastHour: e.target.checked })}
                className="mt-1 rounded border-slate-600 text-amber-500 focus:ring-amber-500 cursor-pointer"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-semibold text-amber-200 text-xs sm:text-sm">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Dernière heure de vente (clôture imminente)</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  Rappel 60 minutes avant la fin de la vente sur les objets où vous participez, pour vous préparer au dénouement de la vente.
                </p>
              </div>
            </label>

            {/* 3. Favoris sans offre */}
            <label className="bg-[#1C2541] border border-slate-800 hover:border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={preferences.notifyFavoritesEnding}
                onChange={(e) => updatePreferences({ notifyFavoritesEnding: e.target.checked })}
                className="mt-1 rounded border-slate-600 text-amber-500 focus:ring-amber-500 cursor-pointer"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-semibold text-amber-200 text-xs sm:text-sm">
                  <Heart className="w-3.5 h-3.5 text-rose-400" />
                  <span>Favoris se terminant sans offre de votre part</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  Rappel 1 heure avant la clôture pour les pièces ajoutées à vos favoris mais sur lesquelles vous n'avez pas encore placé d'enchère.
                </p>
              </div>
            </label>

            {/* 4. Nouveaux objets mis en ligne */}
            <label className="bg-[#1C2541] border border-slate-800 hover:border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={preferences.notifyNewLots}
                onChange={(e) => updatePreferences({ notifyNewLots: e.target.checked })}
                className="mt-1 rounded border-slate-600 text-amber-500 focus:ring-amber-500 cursor-pointer"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-semibold text-amber-200 text-xs sm:text-sm">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Nouveaux objets mis en ligne (lundi matin)</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  Soyez averti dès l'ouverture du catalogue le lundi à 10h pour découvrir les nouvelles trouvailles de collections privées avant tout le monde.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#1C2541] px-5 py-3 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-amber-400" />
            <span>Compatible iOS Safari & Android Chrome</span>
          </span>
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-4 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
          >
            Enregistrer & Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
