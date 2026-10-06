import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { X, ArrowLeft, RefreshCw, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';

interface RegistrationModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const RegistrationModal: React.FC<RegistrationModalProps> = ({ onClose, onSuccess }) => {
  const { switchSimulatedUser } = useAuth();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    companyName: '',
    activity: 'Antiquaire spécialisé',
    country: 'France',
    vatNumber: '',
    website: '',
    addressLine1: '',
    addressLine2: '',
    postalCode: '',
    city: '',
    acceptedTerms: false,
  });

  // Captcha state
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredSuccess, setRegisteredSuccess] = useState(false);

  // Generate random captcha
  const generateCaptcha = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaCode(code);
    setCaptchaInput('');
  };

  useEffect(() => {
    generateCaptcha();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.email || !form.password || !form.firstName || !form.lastName || !form.companyName) {
      setError('Veuillez renseigner tous les champs obligatoires (*).');
      return;
    }

    if (form.password.length < 4) {
      setError('Le mot de passe doit comporter au moins 4 caractères.');
      return;
    }

    if (captchaInput.trim().toUpperCase() !== captchaCode.trim().toUpperCase()) {
      setError('Le code captcha de sécurité est incorrect. Veuillez réessayer.');
      generateCaptcha();
      return;
    }

    if (!form.acceptedTerms) {
      setError('Veuillez accepter les conditions de participation aux enchères.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          captchaAnswer: captchaInput.trim().toUpperCase(),
          captchaExpected: captchaCode.trim().toUpperCase(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de l’inscription');
      }

      setRegisteredSuccess(true);
      // Connecter immédiatement en mode simulé pour la session
      await switchSimulatedUser(form.email.toLowerCase().trim());
      setTimeout(() => {
        onSuccess();
      }, 2500);
    } catch (err: any) {
      setError(err.message);
      generateCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-[#0B132B] border border-[#D4AF37]/50 rounded-2xl shadow-2xl p-6 sm:p-8 text-slate-200 my-4 flex flex-col max-h-[92vh]">
        {/* Top bar with Return button */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200 bg-slate-800/80 hover:bg-slate-700/80 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>← Retour</span>
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Header */}
        <div className="mb-4">
          <span className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold block mb-1">
            ACCÈS RÉSERVÉ
          </span>
          <h2 className="text-2xl font-serif font-bold text-amber-100">
            Créer mon compte professionnel
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Les enchères sont réservées aux antiquaires, brocanteurs et professionnels du marché de l'objet ancien.
          </p>
        </div>

        {registeredSuccess ? (
          <div className="bg-emerald-950/80 border border-emerald-500 rounded-xl p-8 text-center space-y-4 my-auto">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h3 className="text-xl font-serif font-bold text-emerald-200">
              Demande d'inscription enregistrée !
            </h3>
            <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
              Votre compte professionnel a bien été créé. Conformément au règlement des enchères, votre compte doit être validé par le vendeur avant de pouvoir enchérir.
            </p>
            <button
              onClick={() => onSuccess()}
              className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-6 py-2.5 rounded-lg text-xs shadow"
            >
              Accéder à mon espace professionnel
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-rose-950 border border-rose-500 text-rose-200 text-xs p-3 rounded-lg mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Complete Registration Form */}
            <form onSubmit={handleSubmit} className="overflow-y-auto space-y-4 pr-1 text-xs">
              {/* Identity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Prénom *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Henri"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Nom *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Dupont"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Email & Mot de passe */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Email professionnel *</label>
                  <input
                    type="email"
                    required
                    placeholder="contact@antiquites.fr"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Mot de passe souhaité *</label>
                  <input
                    type="password"
                    required
                    placeholder="Au moins 4 caractères"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Téléphone *</label>
                <input
                  type="tel"
                  required
                  placeholder="+33 6..."
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Company & Activity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Nom de société / Enseigne *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Galerie Saint-Germain Antiquités"
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Activité *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Antiquaire, Brocanteur, Marchand d'art..."
                    value={form.activity}
                    onChange={(e) => setForm({ ...form, activity: e.target.value })}
                    className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Pays *</label>
                  <select
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-400"
                  >
                    <option value="France">France</option>
                    <option value="Belgique">Belgique</option>
                    <option value="Luxembourg">Luxembourg</option>
                    <option value="Suisse">Suisse</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Numéro TVA (si applicable)</label>
                  <input
                    type="text"
                    placeholder="FR12345678901 ou BE0123456789"
                    value={form.vatNumber}
                    onChange={(e) => setForm({ ...form, vatNumber: e.target.value })}
                    className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Delivery Address (Shipping only, no local pickup) */}
              <div className="border-t border-slate-800 pt-3">
                <span className="text-[11px] uppercase tracking-wider font-bold text-amber-400 block mb-2">
                  Adresse professionnelle de livraison (Expéditions sécurisées)
                </span>
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 mb-1">Adresse (rue, numéro) *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: 42 Rue de l'Université"
                      value={form.addressLine1}
                      onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                      className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 mb-1">Code postal *</label>
                      <input
                        type="text"
                        required
                        placeholder="75007"
                        value={form.postalCode}
                        onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                        className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 mb-1">Ville *</label>
                      <input
                        type="text"
                        required
                        placeholder="Paris"
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                        className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* CAPTCHA ANTI-ROBOT (Demandé par l'utilisateur) */}
              <div className="bg-[#1C2541] p-4 rounded-xl border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-300">
                    Contrôle de sécurité anti-robot (Captcha) *
                  </span>
                  <button
                    type="button"
                    onClick={generateCaptcha}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-300 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Nouveau code</span>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="bg-[#0B132B] px-4 py-2 rounded-lg border border-slate-700 font-mono text-xl font-bold tracking-widest text-[#D4AF37] select-none shadow-inner">
                    {captchaCode}
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Recopiez le code ici"
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value)}
                    className="flex-1 bg-[#0B132B] border border-slate-700 rounded-lg p-2.5 font-mono text-sm uppercase text-amber-200 tracking-wider focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Terms Checkbox */}
              <div className="bg-[#1C2541]/70 p-4 rounded-xl border border-slate-800">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={form.acceptedTerms}
                    onChange={(e) => setForm({ ...form, acceptedTerms: e.target.checked })}
                    className="mt-0.5 rounded border-slate-600 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-[11px] text-slate-300 leading-relaxed">
                    J'ai pris connaissance et j'accepte les conditions de participation aux enchères et comprends que toute enchère confirmée constitue un engagement d'achat ferme. Je reconnais que les enchères sont proposées par un vendeur particulier issu de successions familiales.
                  </span>
                </label>
              </div>

              {/* Footer actions */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Retour</span>
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-[#D4AF37] hover:bg-[#E5C158] disabled:opacity-50 text-slate-950 font-bold px-6 py-2.5 rounded-lg shadow-md transition-colors cursor-pointer"
                >
                  {submitting ? 'Enregistrement...' : 'Créer mon compte professionnel'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
