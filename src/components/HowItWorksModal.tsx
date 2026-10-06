import React from 'react';
import { X, ArrowLeft, ShieldCheck, UserCheck, Eye, Gavel, Lock, CreditCard, Truck } from 'lucide-react';

interface HowItWorksModalProps {
  onClose: () => void;
  onOpenRegister: () => void;
}

export const HowItWorksModal: React.FC<HowItWorksModalProps> = ({ onClose, onOpenRegister }) => {
  const steps = [
    {
      num: 1,
      icon: <UserCheck className="w-5 h-5 text-amber-400" />,
      title: 'Créez votre compte professionnel',
      desc: 'Renseignez votre identité, votre enseigne, pays et numéro de TVA éventuel afin d’accéder aux enchères réservées.',
    },
    {
      num: 2,
      icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
      title: 'Validation de votre profil par le vendeur',
      desc: 'Pour garantir le sérieux des échanges, chaque professionnel est validé manuellement. Aucune enchère anonyme n’est autorisée.',
    },
    {
      num: 3,
      icon: <Eye className="w-5 h-5 text-amber-400" />,
      title: 'Découvrez les enchères en ligne',
      desc: 'Chaque semaine, une sélection exclusive d’objets d’art issus de nos collections familiales est mise aux enchères.',
    },
    {
      num: 4,
      icon: <Gavel className="w-5 h-5 text-amber-400" />,
      title: 'Examinez l’objet & ses constats d’état',
      desc: 'Consultez les photos détaillées, les dimensions précises, les éventuels défauts d’usage et la mise à prix.',
    },
    {
      num: 5,
      icon: <Lock className="w-5 h-5 text-amber-400" />,
      title: 'Indiquez votre montant maximum (Paliers d’enchères & Proxy)',
      desc: 'Votre montant maximum reste strictement confidentiel. Le moteur automatique applique les paliers officiels (+2 € jusqu’à 50 €, +5 € jusqu’à 100 €, +10 € jusqu’à 200 €, +20 € jusqu’à 500 €, +25 € au-delà) pour vous maintenir en tête au prix le plus juste.',
    },
    {
      num: 6,
      icon: <ShieldCheck className="w-5 h-5 text-amber-400" />,
      title: 'Prolongation Anti-Snipe sécurisée',
      desc: 'Si une enchère intervient dans les 2 dernières minutes, la clôture est automatiquement prolongée de 2 minutes pour préserver l’équité.',
    },
    {
      num: 7,
      icon: <CreditCard className="w-5 h-5 text-emerald-400" />,
      title: 'Règlement sous 24h par PayPal ou Carte Bancaire & Reçu officiel',
      desc: 'En cas d’adjudication gagnante, le règlement s’effectue sous 24 heures par PayPal ou carte bancaire sécurisée. Passé ce délai impératif de 24h, votre offre gagnante sera annulée et l’objet sera automatiquement proposé au second meilleur enchérisseur. Un document de transaction sans TVA est ensuite émis.',
    },
    {
      num: 8,
      icon: <Truck className="w-5 h-5 text-blue-400" />,
      title: 'Expédition sécurisée par transporteur (Pas de remise en main propre)',
      desc: 'Chaque pièce est emballée sous protection blindée sur-mesure et expédiée par transporteur recommandé avec assurance ad valorem. Aucune remise en main propre n’est organisée.',
    },
  ];

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
      <div className="relative w-full max-w-3xl bg-[#0B132B] border border-[#D4AF37]/50 rounded-2xl shadow-2xl p-6 sm:p-8 text-slate-200 flex flex-col my-4">
        {/* Top Control Bar with Return Button */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
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

        {/* Title */}
        <div className="mb-4">
          <span className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold block mb-1">
            GUIDE DE PARTICIPATION
          </span>
          <h2 className="text-2xl font-serif font-bold text-amber-100">
            Comment participer aux enchères ?
          </h2>
        </div>

        {/* Legal Context Notice - Débute par : Je suis un vendeur particulier disposant... */}
        <div className="bg-[#1C2541] border border-amber-500/30 rounded-xl p-4 text-xs text-slate-300 mb-6 leading-relaxed">
          <div className="flex items-center gap-2 text-amber-300 font-serif font-bold mb-1.5">
            <ShieldCheck className="w-4 h-4" />
            <span>Cadre juridique & Vendeur particulier</span>
          </div>
          <p className="italic text-slate-200">
            « Je suis un vendeur particulier disposant de plusieurs centaines d’objets d’art et de curiosités issus de collections familiales héritées de mes grands-parents et de mes parents, qui étaient collectionneurs. Je propose progressivement ces objets à des antiquaires et brocanteurs professionnels en France et en Belgique. »
          </p>
        </div>

        {/* 8 Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto max-h-[46vh] pr-1">
          {steps.map((s) => (
            <div
              key={s.num}
              className="bg-[#1C2541]/70 border border-slate-800/80 p-3.5 rounded-xl flex items-start gap-3"
            >
              <div className="w-8 h-8 rounded-lg bg-[#0B132B] border border-[#D4AF37]/30 flex items-center justify-center shrink-0 mt-0.5">
                {s.icon}
              </div>
              <div>
                <span className="text-[10px] font-mono font-bold text-[#D4AF37] block">
                  ÉTAPE {s.num}
                </span>
                <h4 className="text-xs font-serif font-bold text-slate-100 mb-1">{s.title}</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retour</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onOpenRegister();
            }}
            className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-5 py-2.5 rounded-lg text-xs shadow-md transition-colors"
          >
            Créer mon compte professionnel
          </button>
        </div>
      </div>
    </div>
  );
};
