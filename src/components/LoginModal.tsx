import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { X, ArrowLeft, Lock, Mail, AlertCircle, Sparkles, UserPlus } from 'lucide-react';

interface LoginModalProps {
  onClose: () => void;
  onOpenRegister: () => void;
  onLoginSuccess: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  onClose,
  onOpenRegister,
  onLoginSuccess,
}) => {
  const { loginWithCredentials } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await loginWithCredentials(email, password);
      onLoginSuccess();
    } catch (err: any) {
      setError(err.message || 'Identifiants incorrects.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
      <div className="relative w-full max-w-md bg-[#0B132B] border border-[#D4AF37]/50 rounded-2xl shadow-2xl p-6 sm:p-8 text-slate-200 my-4 flex flex-col">
        {/* Top Control Bar with Return Button */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200 bg-slate-800/80 hover:bg-slate-700/80 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>← Retour</span>
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#8c671a] p-0.5 mx-auto mb-3 shadow-lg">
            <div className="w-full h-full bg-[#0B132B] rounded-[10px] flex items-center justify-center">
              <Lock className="w-6 h-6 text-[#D4AF37]" />
            </div>
          </div>
          <h2 className="text-2xl font-serif font-bold text-amber-100">
            Connexion Professionnelle
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Saisissez votre email et mot de passe pour accéder à votre espace
          </p>
        </div>

        {/* Test Account Helper Box */}
        <div className="mb-5 p-3.5 rounded-xl bg-amber-950/40 border border-[#D4AF37]/50 text-xs shadow-md">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-serif font-bold text-amber-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Compte test espace client :</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setEmail('client.test@enchere-antiquites.fr');
                setPassword('client123');
              }}
              className="text-[11px] text-amber-300 hover:text-white font-semibold underline cursor-pointer"
            >
              Remplir automatiquement
            </button>
          </div>
          <div className="font-mono text-[11px] text-slate-300 space-y-0.5 bg-[#0B132B]/80 p-2.5 rounded-lg border border-slate-800">
            <div>Email : <span className="text-amber-300 select-all font-semibold">client.test@enchere-antiquites.fr</span></div>
            <div>Mot de passe : <span className="text-amber-300 select-all font-semibold">client123</span></div>
          </div>
        </div>

        {error && (
          <div className="bg-rose-950/80 border border-rose-500 text-rose-200 text-xs p-3 rounded-lg mb-4 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>{error}</span>
              {error.includes('Inscription') && (
                <div className="mt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenRegister();
                    }}
                    className="text-amber-300 hover:underline font-bold"
                  >
                    Créer mon compte professionnel →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Email professionnel :
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                placeholder="votre-email@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#1C2541] border border-slate-700 focus:border-[#D4AF37] rounded-lg pl-9 pr-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Mot de passe :
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#1C2541] border border-slate-700 focus:border-[#D4AF37] rounded-lg pl-9 pr-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#D4AF37] to-[#B38728] hover:from-[#E5C158] hover:to-[#C59B3C] text-slate-950 font-bold py-3 rounded-lg text-sm shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 mt-2"
          >
            {loading ? (
              <span>Connexion en cours...</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-slate-950" />
                <span>Se connecter</span>
              </>
            )}
          </button>
        </form>

        {/* Pas encore client ? Inscription */}
        <div className="mt-6 pt-5 border-t border-slate-800 text-center text-xs">
          <p className="text-slate-400 mb-2">Pas encore client ?</p>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenRegister();
            }}
            className="inline-flex items-center gap-1.5 bg-[#1C2541] hover:bg-slate-800 text-amber-200 hover:text-white px-4 py-2 rounded-lg border border-[#D4AF37]/40 font-semibold transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-[#D4AF37]" />
            <span>Inscription professionnelle</span>
          </button>
        </div>
      </div>
    </div>
  );
};
