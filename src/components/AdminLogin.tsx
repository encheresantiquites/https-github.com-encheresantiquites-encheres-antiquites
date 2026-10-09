import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { ShieldCheck, Lock, UserCheck, ArrowLeft, Loader2, AlertCircle, KeyRound, Eye, EyeOff } from 'lucide-react';

interface AdminLoginProps {
  onSuccess?: () => void;
  onBack?: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onSuccess, onBack }) => {
  const { loginAdmin } = useAuth();

  // Strictement vides à l'ouverture conformément aux règles absolues
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLockedOut, setIsLockedOut] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || isLockedOut) return;

    const cleanId = identifier.trim();
    if (!cleanId) {
      setErrorMessage('Veuillez saisir votre identifiant administrateur.');
      return;
    }

    if (!password) {
      setErrorMessage('Veuillez saisir votre mot de passe.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await loginAdmin(cleanId, password);
      // Réinitialiser les champs sensibles en mémoire
      setIdentifier('');
      setPassword('');
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      const msg = err.message || 'Identifiant ou mot de passe incorrect.';
      setErrorMessage(msg);
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);

      if (newAttempts >= 5 || msg.includes('patiente')) {
        setIsLockedOut(true);
        setTimeout(() => {
          setIsLockedOut(false);
          setFailedAttempts(0);
        }, 30000); // Déverrouillage après 30s
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-[#1C2541]/95 border border-[#D4AF37]/30 rounded-2xl p-6 sm:p-8 shadow-2xl relative backdrop-blur-md">
        {/* Bouton retour vers le site public */}
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-800">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#D4AF37] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retour au site public</span>
          </button>
          <div className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-amber-400/90 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-full">
            <Lock className="w-3 h-3 text-[#D4AF37]" />
            <span>Zone Sécurisée</span>
          </div>
        </div>

        {/* En-tête : Nom & Titre */}
        <div className="text-center space-y-2 mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/40 mb-1 text-[#D4AF37]">
            <KeyRound className="w-6 h-6" />
          </div>
          <div className="font-serif text-lg text-[#D4AF37] tracking-wider uppercase">
            Enchères Antiquités
          </div>
          <h1 className="text-2xl font-serif font-bold text-slate-100 tracking-tight">
            Connexion administrateur
          </h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Accès réservé au vendeur administrateur de la plateforme. Authentification sécurisée côté serveur.
          </p>
        </div>

        {/* Alerte Erreur */}
        {errorMessage && (
          <div className="mb-6 p-3.5 bg-rose-950/60 border border-rose-500/50 rounded-xl text-rose-200 text-xs flex items-start gap-2.5 shadow-sm">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed flex-1">{errorMessage}</div>
          </div>
        )}

        {/* Formulaire de connexion */}
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          {/* Champ Identifiant */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 tracking-wide">
              Identifiant
            </label>
            <div className="relative">
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={loading || isLockedOut}
                placeholder="Identifiant administrateur"
                autoComplete="off"
                autoFocus
                className="w-full bg-[#0B132B] border border-slate-700 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-xl px-3.5 py-2.5 text-slate-100 text-sm placeholder-slate-500 outline-none transition-all disabled:opacity-50"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500">
                <UserCheck className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Champ Mot de passe */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 tracking-wide">
              Mot de passe
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading || isLockedOut}
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full bg-[#0B132B] border border-slate-700 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-xl px-3.5 py-2.5 text-slate-100 text-sm placeholder-slate-500 outline-none transition-all pr-10 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Bouton de validation */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || isLockedOut || !identifier.trim() || !password}
              className="w-full bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold py-2.5 px-4 rounded-xl text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Vérification en cours...</span>
                </>
              ) : isLockedOut ? (
                <span>Veuillez patienter...</span>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Se connecter</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Note de sécurité */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Cabinet & Galerie De Coster • Console d'administration sécurisée. Toutes les connexions et actions font l'objet d'un horodatage juridique dans le registre d'audit.
          </p>
        </div>
      </div>
    </div>
  );
};
