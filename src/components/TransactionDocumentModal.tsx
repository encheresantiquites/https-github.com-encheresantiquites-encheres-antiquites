import React from 'react';
import { TransactionDoc } from '../types/index.ts';
import { X, Printer, ShieldCheck, Download } from 'lucide-react';

interface TransactionDocumentModalProps {
  document: TransactionDoc;
  onClose: () => void;
}

export const TransactionDocumentModal: React.FC<TransactionDocumentModalProps> = ({
  document,
  onClose,
}) => {
  const formatEuro = (cents: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(cents / 100);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
      <div className="relative w-full max-w-3xl bg-white text-slate-900 rounded-xl shadow-2xl overflow-hidden flex flex-col my-4">
        {/* Top Control Bar (Screen only) */}
        <div className="bg-slate-900 text-slate-100 px-6 py-3 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-amber-400 font-semibold">{document.documentNumber}</span>
            <span className="text-slate-400">•</span>
            <span>Document de Vente Particulier</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Formal Document Content */}
        <div className="p-8 sm:p-12 space-y-8 print:p-0">
          {/* Document Header */}
          <div className="border-b-2 border-slate-900 pb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-widest text-slate-500 font-bold block mb-1">
                DOCUMENT LÉGAL DE TRANSACTION
              </span>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900 tracking-tight">
                CONFIRMATION DE TRANSACTION
              </h1>
              <p className="text-sm text-slate-600 mt-1 font-mono">
                Référence : <strong>{document.documentNumber}</strong>
              </p>
            </div>

            <div className="text-right">
              <div className="inline-block bg-slate-100 border border-slate-300 px-3 py-1 rounded text-xs font-mono font-medium text-slate-700">
                Date : {document.paidAt ? new Date(document.paidAt).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')}
              </div>
              <div className="mt-2 text-xs text-emerald-700 font-semibold flex items-center justify-end gap-1">
                <ShieldCheck className="w-4 h-4" />
                <span>RÈGLEMENT CONFIRMÉ</span>
              </div>
            </div>
          </div>

          {/* Parties: Vendeur Particulier & Acheteur Professionnel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-sm">
            {/* Vendeur (Section 31 & 89) */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 block mb-2">
                VENDEUR CÉDANT :
              </span>
              <p className="font-bold text-slate-900 text-base">{document.sellerName}</p>
              <p className="text-xs font-semibold text-amber-800 bg-amber-50 inline-block px-2 py-0.5 rounded border border-amber-200 my-1">
                {document.sellerStatus} (Non assujetti à TVA)
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Cession de biens patrimoniaux issus de collections familiales privées
              </p>
              <p className="text-xs text-slate-600">{document.sellerAddress || 'Lille / Bruxelles'}</p>
            </div>

            {/* Acheteur Pro */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500 block mb-2">
                ACQUÉREUR PROFESSIONNEL :
              </span>
              <p className="font-bold text-slate-900 text-base">{document.buyerName}</p>
              {document.buyerCompany && (
                <p className="text-xs font-semibold text-slate-700">{document.buyerCompany}</p>
              )}
              <p className="text-xs text-slate-600 mt-1 whitespace-pre-line leading-relaxed">
                {document.buyerAddress}
              </p>
            </div>
          </div>

          {/* Details Table */}
          <div className="border border-slate-300 rounded-lg overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-700 text-xs uppercase font-semibold border-b border-slate-300">
                <tr>
                  <th className="p-3.5">Réf. Lot</th>
                  <th className="p-3.5">Désignation de l'objet adjugé</th>
                  <th className="p-3.5 text-right">Montant d'adjudication</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="p-3.5 font-mono text-xs font-bold text-slate-700">
                    {document.lotReference}
                  </td>
                  <td className="p-3.5">
                    <div className="font-semibold text-slate-900">{document.lotTitle}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Enchères hebdomadaires d'objets de famille
                    </div>
                  </td>
                  <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                    {formatEuro(document.amountCents)}
                  </td>
                </tr>
                {document.shippingCents > 0 && (
                  <tr className="bg-slate-50/50">
                    <td className="p-3.5 font-mono text-xs text-slate-500">EXP-SEC</td>
                    <td className="p-3.5 text-xs text-slate-600">
                      Participation aux frais d'emballage sécurisé & expédition recommandée
                    </td>
                    <td className="p-3.5 text-right font-mono text-slate-700">
                      {formatEuro(document.shippingCents)}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-slate-100 border-t-2 border-slate-400">
                <tr>
                  <td colSpan={2} className="p-4 font-bold text-slate-900 text-right uppercase text-xs">
                    Total Réglé (EUR) :
                  </td>
                  <td className="p-4 text-right font-mono font-bold text-xl text-slate-900">
                    {formatEuro(document.totalCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Payment & Legal Clarification Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div>
              <span className="font-bold text-slate-700 block mb-1">Détails du règlement :</span>
              <p className="text-slate-600">Mode : {document.paymentMethod}</p>
              {document.paymentReference && (
                <p className="text-slate-600 font-mono">
                  Identifiant transaction : {document.paymentReference}
                </p>
              )}
            </div>

            <div>
              <span className="font-bold text-slate-700 block mb-1">Mention légale :</span>
              <p className="text-slate-500 leading-relaxed italic">
                Cession effectuée par un particulier dans le cadre de la gestion de son patrimoine privé familial. Aucune TVA n'est applicable conformément aux règles régissant les ventes entre un particulier vendeur et un professionnel.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-8 py-3 border-t border-slate-200 text-center text-[11px] text-slate-500 print:hidden">
          Ce reçu constitue une preuve de paiement et un justificatif comptable d'acquisition d'occasion.
        </div>
      </div>
    </div>
  );
};
