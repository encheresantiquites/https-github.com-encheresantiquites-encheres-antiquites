import React from 'react';
import { X, Truck, ShieldCheck, Scale, AlertCircle, CheckCircle2 } from 'lucide-react';
import { DEFAULT_SHIPPING_TIERS } from '../lib/shipping.ts';

interface ShippingRatesModalProps {
  onClose: () => void;
}

export const ShippingRatesModal: React.FC<ShippingRatesModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-[#1C2541] border-2 border-[#D4AF37]/50 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl text-slate-100 flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-700/80 flex items-center justify-between sticky top-0 bg-[#1C2541]/95 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-400/40 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-serif font-bold text-amber-200">
                Grille Tarifaire Unique — Livraison
              </h2>
              <p className="text-xs text-slate-300">
                Tarifs identiques applicables à toutes les expéditions France & Belgique
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 text-xs sm:text-sm">
          {/* 4 Configurations couvertes */}
          <div className="bg-[#0B132B] p-4 rounded-xl border border-slate-800">
            <div className="text-xs uppercase font-semibold text-amber-400 tracking-wider mb-2">
              Configurations d’expédition prises en charge (Tarif identique)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-[#1C2541] p-2.5 rounded-lg border border-slate-700/80 text-center font-medium text-slate-200 text-xs">
                🇫🇷 France → 🇫🇷 France
              </div>
              <div className="bg-[#1C2541] p-2.5 rounded-lg border border-slate-700/80 text-center font-medium text-slate-200 text-xs">
                🇫🇷 France → 🇧🇪 Belgique
              </div>
              <div className="bg-[#1C2541] p-2.5 rounded-lg border border-slate-700/80 text-center font-medium text-slate-200 text-xs">
                🇧🇪 Belgique → 🇫🇷 France
              </div>
              <div className="bg-[#1C2541] p-2.5 rounded-lg border border-slate-700/80 text-center font-medium text-slate-200 text-xs">
                🇧🇪 Belgique → 🇧🇪 Belgique
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-2.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Aucune différence tarifaire liée à la frontière : le calcul s’effectue strictement sur le poids du colis.</span>
            </p>
          </div>

          {/* Grille des tarifs */}
          <div>
            <h3 className="font-serif font-bold text-amber-200 text-sm mb-2.5 flex items-center gap-2">
              <Scale className="w-4 h-4 text-[#D4AF37]" />
              <span>Barème officiel facturé au poids</span>
            </h3>
            <div className="border border-slate-700 rounded-xl overflow-hidden shadow-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0B132B] text-slate-300 uppercase tracking-wider font-semibold border-b border-slate-700">
                  <tr>
                    <th className="p-3">Tranche de poids du colis</th>
                    <th className="p-3 text-right">Frais de livraison facturés</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-[#141B33]">
                  {DEFAULT_SHIPPING_TIERS.map((tier) => (
                    <tr key={tier.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 text-slate-200 font-medium">{tier.label}</td>
                      <td className="p-3 text-right font-mono font-bold text-amber-300">
                        {tier.quoteRequired ? (
                          <span className="text-amber-400 bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded text-[11px]">
                            Sur devis
                          </span>
                        ) : (
                          `${(tier.costCents / 100).toFixed(2).replace('.', ',')} €`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Règle d'arrondi / seuil */}
          <div className="bg-[#0B132B] p-4 rounded-xl border border-slate-800 space-y-2">
            <h4 className="font-bold text-amber-300 text-xs uppercase tracking-wider">
              Règle d’application de seuil strict
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Le système applique la tranche immédiatement supérieure dès que le poids dépasse la limite d’une tranche :
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-300">
              <div className="bg-[#1C2541] p-2 rounded border border-slate-700/60">
                500 g → <strong className="text-amber-300">14,90 €</strong>
              </div>
              <div className="bg-[#1C2541] p-2 rounded border border-slate-700/60">
                501 g → <strong className="text-amber-300">16,90 €</strong>
              </div>
              <div className="bg-[#1C2541] p-2 rounded border border-slate-700/60">
                1 kg → <strong className="text-amber-300">16,90 €</strong>
              </div>
              <div className="bg-[#1C2541] p-2 rounded border border-slate-700/60">
                1,01 kg → <strong className="text-amber-300">19,90 €</strong>
              </div>
              <div className="bg-[#1C2541] p-2 rounded border border-slate-700/60">
                2 kg → <strong className="text-amber-300">19,90 €</strong>
              </div>
              <div className="bg-[#1C2541] p-2 rounded border border-slate-700/60">
                2,01 kg → <strong className="text-amber-300">24,90 €</strong>
              </div>
            </div>
          </div>

          {/* Objets volumineux et spécifiques */}
          <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-200">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="block text-amber-300 text-xs">
                Objets volumineux, fragiles ou supérieurs à 25 kg :
              </strong>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Pour les colis de plus de 25 kg, les pièces dépassant les dimensions autorisées par les services postaux ou nécessitant un transporteur d’art spécifique, le tarif automatique est remplacé par une <strong>« Livraison sur devis »</strong> validée au préalable avec l’acquéreur.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700/80 bg-[#141B33] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Compris
          </button>
        </div>
      </div>
    </div>
  );
};
