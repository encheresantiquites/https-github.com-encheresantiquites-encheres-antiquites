import React from 'react';
import { Lot } from '../types/index.ts';
import { LiveCountdown } from './LiveCountdown.tsx';
import { useFavorites } from '../context/FavoritesContext.tsx';
import { useChat } from '../context/ChatContext.tsx';
import { Gavel, CheckCircle2, AlertCircle, Eye, Heart, Calendar, MessageSquare } from 'lucide-react';
import { getLotPrimaryImage, handleLotImageError } from '../lib/image-utils.ts';

interface LotCardProps {
  lot: Lot;
  onSelect: (lot: Lot) => void;
}

export const LotCard: React.FC<LotCardProps> = ({ lot, onSelect }) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { openChat } = useChat();
  const isFav = isFavorite(lot.id);

  const primaryImage = getLotPrimaryImage(lot.images);

  const formatEuro = (cents: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const isUpcoming = lot.status === 'DRAFT' || lot.status === 'SCHEDULED';
  const isSold = lot.status === 'SOLD';
  const isUnsold = lot.status === 'UNSOLD' || lot.status === 'RESERVE_NOT_MET';
  const isClosed = isSold || lot.status === 'CLOSED' || (!isUpcoming && new Date(lot.endsAt).getTime() <= Date.now());

  return (
    <div
      onClick={() => onSelect(lot)}
      className="group bg-[#1C2541]/90 rounded-xl overflow-hidden border border-[#D4AF37]/20 hover:border-[#D4AF37]/70 shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col cursor-pointer transform hover:-translate-y-1 relative"
    >
      {/* Image Container with Badges - Format compact et raffiné */}
      <div className="relative aspect-[16/10] w-full bg-slate-900 overflow-hidden">
        <img
          src={primaryImage}
          alt={lot.title}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ease-out"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          onError={(e) => handleLotImageError(e, primaryImage)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30 pointer-events-none"></div>

        {/* Top Left Badge */}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5 items-center">
          <span className="bg-[#0B132B]/90 backdrop-blur-md text-[#D4AF37] text-[10px] font-mono px-2 py-0.5 rounded border border-[#D4AF37]/30 font-semibold shadow">
            {lot.reference}
          </span>
        </div>

        {/* Top Right: Favorite Button + Status / Countdown */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(lot.id);
            }}
            className={`p-1.5 rounded-full backdrop-blur-md border transition-all cursor-pointer shadow-md ${
              isFav
                ? 'bg-rose-950/90 border-rose-500/70 text-rose-400 scale-105'
                : 'bg-[#0B132B]/80 border-slate-700/60 text-slate-300 hover:text-rose-400 hover:border-rose-400/50'
            }`}
            title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            aria-label="Favori"
          >
            <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
          </button>

          {isUpcoming ? (
            <span className="bg-[#0B132B]/90 backdrop-blur-md text-amber-300 text-[10px] font-semibold px-2 py-0.5 rounded border border-[#D4AF37]/40 shadow flex items-center gap-1">
              <Calendar className="w-3 h-3 text-[#D4AF37]" />
              <span>Lundi prochain</span>
            </span>
          ) : (
            <LiveCountdown targetDate={lot.endsAt} compact />
          )}
        </div>

        {/* Bidding status badge for current user if applicable */}
        {lot.userMaxBidCents && (
          <div className="absolute bottom-2.5 left-2.5">
            {lot.isWinning ? (
              <span className="inline-flex items-center gap-1 bg-emerald-950/90 backdrop-blur-md text-emerald-200 text-[11px] px-2 py-0.5 rounded-md border border-emerald-400 font-semibold shadow-lg">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Vous êtes à présent le meilleur enchérisseur
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 bg-amber-950/90 backdrop-blur-md text-amber-200 text-[11px] px-2 py-0.5 rounded-md border border-amber-400 font-semibold shadow-lg">
                <AlertCircle className="w-3 h-3 text-amber-400" />
                Offre dépassée (surenchéri)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Lot Card Content - Proportions harmonieuses */}
      <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between">
        <div>
          {lot.period && (
            <span className="text-[10px] font-serif text-[#D4AF37] italic tracking-wide">
              {lot.period}
            </span>
          )}
          <h3 className="font-serif text-sm sm:text-base font-bold text-slate-100 group-hover:text-amber-200 transition-colors line-clamp-2 leading-snug mt-0.5">
            {lot.title}
          </h3>
          <p className="text-[11px] text-slate-400 line-clamp-2 mt-1.5 leading-relaxed">
            {lot.description}
          </p>
        </div>

        {/* Price & Action Section */}
        <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-end justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-medium">
              {isClosed ? 'Enchère(s) clôturée(s)' : isUpcoming || lot.bidCount === 0 ? 'Mise à prix' : 'Enchère actuelle'}
            </div>
            <div className="text-lg sm:text-xl font-bold font-serif text-[#D4AF37] tracking-tight">
              {formatEuro(lot.currentPriceCents)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {isUpcoming ? (
                <span className="text-amber-300/80 text-[10px]">Prochaine vente</span>
              ) : (
                `${lot.bidCount} ${lot.bidCount > 1 ? 'enchères' : 'enchère'}`
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openChat({
                  id: lot.id,
                  reference: lot.reference,
                  title: lot.title,
                  image: primaryImage,
                  startingPriceCents: lot.startingPriceCents,
                });
              }}
              className="p-1.5 sm:p-2 rounded-lg bg-[#0B132B] hover:bg-slate-800 text-slate-300 hover:text-[#D4AF37] border border-slate-700/60 transition-colors shadow cursor-pointer"
              title="Poser une question sur cet objet (Chat EN LIGNE 9h–17h)"
              aria-label="Poser une question"
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#D4AF37]" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(lot);
              }}
              className="flex items-center gap-1.5 bg-[#0B132B] hover:bg-[#D4AF37] text-amber-200 hover:text-slate-950 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg text-xs font-semibold border border-[#D4AF37]/40 hover:border-transparent transition-all shadow cursor-pointer"
            >
              {isUpcoming ? (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span>Découvrir</span>
                </>
              ) : (
                <>
                  <Gavel className="w-3.5 h-3.5" />
                  <span>Enchérir</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
