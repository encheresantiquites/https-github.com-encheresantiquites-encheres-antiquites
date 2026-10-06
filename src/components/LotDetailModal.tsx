import React, { useState, useEffect } from 'react';
import { Lot, BidHistoryItem } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useFavorites } from '../context/FavoritesContext.tsx';
import { useChat } from '../context/ChatContext.tsx';
import { useRealtime } from '../context/RealtimeContext.tsx';
import { useNotifications } from '../context/NotificationContext.tsx';
import { LiveCountdown } from './LiveCountdown.tsx';
import {
  X,
  Gavel,
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Lock,
  ChevronLeft,
  ChevronRight,
  Info,
  Building,
  FileCheck,
  Calendar,
  Heart,
  MessageSquare,
  HelpCircle,
  Bell,
} from 'lucide-react';

interface LotDetailModalProps {
  lotId: number;
  onClose: () => void;
  onBidSuccess?: () => void;
  onOpenLogin?: () => void;
}

export const LotDetailModal: React.FC<LotDetailModalProps> = ({
  lotId,
  onClose,
  onBidSuccess,
  onOpenLogin,
}) => {
  const { user, token, refreshUser } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { openChat } = useChat();
  const { getLotViewers, setViewingLot, onLotBidReceived } = useRealtime();
  const { permission: notifPermission, requestPermission: requestNotifPermission } = useNotifications();
  const viewersCount = getLotViewers(lotId);
  const isFav = isFavorite(lotId);
  const [lot, setLot] = useState<Lot | null>(null);
  const [history, setHistory] = useState<BidHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [liveBidFlash, setLiveBidFlash] = useState<{ amountCents: number; bidder: string } | null>(null);

  // Bidding states
  const [bidAmountInput, setBidAmountInput] = useState<string>('');
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [acceptTermsChecked, setAcceptTermsChecked] = useState(user?.acceptedTerms || false);
  const [submittingBid, setSubmittingBid] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);
  const [bidFeedback, setBidFeedback] = useState<{
    type: 'WINNING' | 'OUTBID';
    message: string;
    bidAmountCents: number;
    currentPriceCents?: number;
    nextMinCents?: number;
  } | null>(null);
  const [showIncrementsTable, setShowIncrementsTable] = useState(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'details' | 'condition' | 'history'>('details');

  const fetchLotData = async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/lots/${lotId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setLot(data.lot);
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error('Erreur chargement lot:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLotData();
    setViewingLot(lotId);

    // Écoute instantanée des enchères sur ce lot en temps réel (< 50ms)
    const unsubscribe = onLotBidReceived?.((event) => {
      if (event.lotId === lotId) {
        setLot((prev) => {
          if (!prev) return prev;
          const isWinner = user ? event.winningUserId === user.id : false;
          return {
            ...prev,
            currentPriceCents: event.currentPriceCents,
            bidCount: event.bidCount,
            endsAt: event.endsAt,
            isWinning: isWinner,
          };
        });

        setHistory((prev) => [
          {
            id: event.newBid.id || Date.now(),
            publicBidderId: event.newBid.publicBidderId,
            amountCents: event.newBid.amountCents,
            createdAt: event.newBid.createdAt,
          },
          ...prev.filter(
            (b) =>
              !(b.amountCents === event.newBid.amountCents && b.publicBidderId === event.newBid.publicBidderId)
          ),
        ]);

        setLiveBidFlash({
          amountCents: event.currentPriceCents,
          bidder: event.newBid.publicBidderId,
        });

        setTimeout(() => {
          setLiveBidFlash(null);
        }, 4000);
      }
    });

    // Backup polling léger toutes les 10s au cas où la connexion mobile décroche
    const interval = setInterval(fetchLotData, 10000);

    return () => {
      setViewingLot(null);
      if (unsubscribe) unsubscribe();
      clearInterval(interval);
    };
  }, [lotId, token, user, setViewingLot, onLotBidReceived]);

  const formatEuro = (cents: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const getMinIncrement = (currentCents: number) => {
    if (currentCents < 5000) return 200;
    if (currentCents < 10000) return 500;
    if (currentCents < 20000) return 1000;
    if (currentCents < 50000) return 2000;
    return 2500;
  };

  const currentPriceCents = lot?.currentPriceCents || 0;
  const minIncCents = getMinIncrement(currentPriceCents);
  const minRequiredCents =
    lot?.bidCount === 0 ? lot.startingPriceCents : currentPriceCents + minIncCents;

  const minRequiredEuros = Math.ceil(minRequiredCents / 100);

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setBidError(null);
    setBidFeedback(null);

    const val = parseFloat(bidAmountInput.replace(',', '.'));
    if (isNaN(val) || val < minRequiredEuros) {
      setBidError(`Votre enchère doit être d'au moins ${minRequiredEuros} €.`);
      return;
    }

    if (!user) {
      setBidError('Veuillez vous connecter pour enchérir.');
      return;
    }

    if (user.status !== 'APPROVED') {
      setBidError('Votre compte professionnel doit être validé par le vendeur pour enchérir.');
      return;
    }

    setConfirmModalOpen(true);
  };

  const handleConfirmBid = async () => {
    if (!lot || !token) return;
    setSubmittingBid(true);
    setBidError(null);

    try {
      const val = parseFloat(bidAmountInput.replace(',', '.'));
      const maxBidCents = Math.round(val * 100);

      // Si l'utilisateur n'a pas encore validé les CGV
      if (!user?.acceptedTerms && acceptTermsChecked) {
        await fetch('/api/me/accept-terms', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        await refreshUser();
      }

      const res = await fetch(`/api/lots/${lot.id}/bid`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ maxBidCents }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors du placement de l’enchère.');
      }

      setBidFeedback({
        type: data.isWinning ? 'WINNING' : 'OUTBID',
        message: data.message,
        bidAmountCents: maxBidCents,
        currentPriceCents: data.currentPriceCents,
        nextMinCents: data.nextMinCents,
      });
      setConfirmModalOpen(false);
      setBidAmountInput('');
      await fetchLotData();
      if (onBidSuccess) onBidSuccess();
    } catch (err: any) {
      setBidError(err.message);
      setConfirmModalOpen(false);
    } finally {
      setSubmittingBid(false);
    }
  };

  if (loading || !lot) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-[#1C2541] p-8 rounded-2xl border border-amber-500/30 text-center">
          <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-amber-200 font-serif">Chargement des détails du lot...</p>
        </div>
      </div>
    );
  }

  const images = lot.images && lot.images.length > 0 ? lot.images : ['https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80'];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-[#0B132B] border border-[#D4AF37]/40 rounded-2xl shadow-2xl overflow-hidden text-slate-200 my-4 flex flex-col max-h-[92vh]">
        {/* Header Bar */}
        <div className="bg-[#1C2541] px-5 py-3 border-b border-[#D4AF37]/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-white bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700 transition-colors"
            >
              <span>← Retour</span>
            </button>
            <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded bg-[#0B132B] text-[#D4AF37] border border-[#D4AF37]/30">
              {lot.reference}
            </span>
            {/* Live presence indicator */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>{viewersCount} en direct</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleFavorite(lot.id)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer shadow-sm ${
                isFav
                  ? 'bg-rose-950/80 border-rose-500/70 text-rose-300'
                  : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700 text-slate-300 hover:text-rose-400'
              }`}
              title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
              <span className="hidden sm:inline">{isFav ? 'Dans vos favoris' : 'Favori'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Scrollable Body */}
        <div className="overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
          {/* Left Column: Photo Gallery (5 cols) */}
          <div className="lg:col-span-6 space-y-4">
            <div className="relative aspect-4/3 w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-inner group">
              <img
                src={images[selectedImageIndex]}
                alt={lot.title}
                className="w-full h-full object-cover object-center"
              />
              {images.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setSelectedImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() =>
                      setSelectedImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${
                      selectedImageIndex === idx
                        ? 'border-[#D4AF37] scale-105'
                        : 'border-slate-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Provenance Banner */}
            <div className="bg-[#1C2541]/70 border border-amber-500/20 rounded-xl p-3.5 text-xs text-slate-300">
              <div className="flex items-center gap-1.5 text-amber-300 font-serif font-semibold mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span>Origine & Transmission Familiale</span>
              </div>
              <p className="leading-relaxed text-slate-300">
                Pièce issue des collections de nos aïeux (grands-parents et parents), conservée en main propre depuis plusieurs décennies. Proposée directement par le particulier sans intermédiaire commercial.
              </p>
            </div>
          </div>

          {/* Right Column: Details & Bidding Console (6 cols) */}
          <div className="lg:col-span-6 flex flex-col justify-between space-y-5">
            <div>
              {lot.period && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs italic text-amber-400 font-serif">
                    {lot.period}
                  </span>
                </div>
              )}

              <h1 className="font-serif text-xl sm:text-2xl font-bold text-amber-100 leading-snug">
                {lot.title}
              </h1>

              {/* Countdown Timer or Upcoming Notice */}
              {lot.status === 'DRAFT' || lot.status === 'SCHEDULED' ? (
                <div className="mt-4 bg-[#1C2541]/90 rounded-xl p-4 border border-[#D4AF37]/40 flex items-center gap-3 text-amber-200 shadow-md">
                  <div className="w-10 h-10 rounded-lg bg-[#0B132B] border border-[#D4AF37]/40 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">Prochaine enchère</span>
                    <span className="font-serif font-bold text-base text-amber-100">Démarre lundi prochain</span>
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <LiveCountdown targetDate={lot.endsAt} />
                </div>
              )}

              {/* Flash enchère instantanée en direct */}
              {liveBidFlash && (
                <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-amber-950/90 via-amber-900/80 to-[#1C2541] border border-amber-400 text-amber-100 flex items-center justify-between text-xs sm:text-sm shadow-xl animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base animate-pulse">⚡</span>
                    <span>
                      Nouvelle enchère en direct de <strong className="text-amber-300">{liveBidFlash.bidder}</strong> :
                    </span>
                  </div>
                  <span className="font-mono font-bold text-amber-200 text-sm bg-black/50 px-2.5 py-0.5 rounded border border-amber-400/50">
                    {formatEuro(liveBidFlash.amountCents)}
                  </span>
                </div>
              )}

              {/* Price Panel */}
              <div className="mt-4 bg-[#1C2541] rounded-xl p-4 border border-[#D4AF37]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">
                    {lot.bidCount === 0 ? 'Mise à prix' : 'Enchère actuelle'}
                  </span>
                  <div className="flex items-center gap-2.5 flex-wrap mt-0.5">
                    <div className="text-2xl sm:text-3xl font-bold font-serif text-[#D4AF37]">
                      {formatEuro(lot.currentPriceCents)}
                    </div>
                    {/* Badge à côté de son enchère */}
                    {lot.userMaxBidCents && (
                      lot.isWinning ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/90 border border-emerald-400 text-emerald-200 shadow-md">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Vous êtes à présent le meilleur enchérisseur</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-950/90 border border-amber-400 text-amber-200 shadow-md">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Votre offre ne dépasse pas l'offre maximum</span>
                        </span>
                      )
                    )}
                  </div>
                  <span className="text-xs text-slate-400 mt-0.5 block">
                    {lot.bidCount} {lot.bidCount > 1 ? 'offres enregistrées' : 'offre'}
                  </span>
                </div>

                <div className="text-right sm:text-right">
                  <span className="text-xs uppercase tracking-wider text-slate-400">
                    Prochaine offre min.
                  </span>
                  <div className="text-lg font-mono font-bold text-amber-200">
                    {formatEuro(minRequiredCents)}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowIncrementsTable((v) => !v)}
                    className="text-[11px] text-[#D4AF37] hover:underline flex items-center sm:justify-end gap-1 mt-0.5 cursor-pointer"
                  >
                    <HelpCircle className="w-3 h-3" />
                    <span>Palier +{minIncCents / 100} € (voir barème)</span>
                  </button>
                </div>
              </div>

              {/* Panneau explicatif des paliers d'enchères */}
              {showIncrementsTable && (
                <div className="mt-3 bg-[#0B132B] border border-[#D4AF37]/50 rounded-xl p-3.5 text-xs text-slate-300 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-serif font-bold text-amber-200 text-xs">
                      Barème officiel des paliers d'enchères
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowIncrementsTable(false)}
                      className="text-slate-400 hover:text-white text-[11px]"
                    >
                      Fermer ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-[#1C2541] p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block">De 0 € à 49 € :</span>
                      <span className="font-bold text-[#D4AF37] font-mono">+2 € par enchère</span>
                    </div>
                    <div className="bg-[#1C2541] p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block">De 50 € à 99 € :</span>
                      <span className="font-bold text-[#D4AF37] font-mono">+5 € par enchère</span>
                    </div>
                    <div className="bg-[#1C2541] p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block">De 100 € à 199 € :</span>
                      <span className="font-bold text-[#D4AF37] font-mono">+10 € par enchère</span>
                    </div>
                    <div className="bg-[#1C2541] p-2 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block">De 200 € à 499 € :</span>
                      <span className="font-bold text-[#D4AF37] font-mono">+20 € par enchère</span>
                    </div>
                    <div className="bg-[#1C2541] p-2 rounded-lg border border-slate-800 col-span-2">
                      <span className="text-slate-400 block">À partir de 500 € et plus :</span>
                      <span className="font-bold text-[#D4AF37] font-mono">+25 € par enchère</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 italic pt-1 leading-relaxed">
                    💡 <strong>Comment ça fonctionne :</strong> Le moteur proxy place automatiquement le montant minimal nécessaire pour vous placer en tête au-dessus du concurrent précédent. Votre montant maximum reste strictement secret.
                  </p>
                </div>
              )}

              {/* User Bidding Status Message */}
              {lot.userMaxBidCents && (
                <div
                  className={`mt-3 p-3.5 rounded-xl border text-xs sm:text-sm flex items-center gap-3 shadow-md ${
                    lot.isWinning
                      ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-200'
                      : 'bg-gradient-to-r from-amber-950/90 to-red-950/70 border-amber-500/70 text-amber-200'
                  }`}
                >
                  {lot.isWinning ? (
                    <>
                      <div className="w-8 h-8 rounded-full bg-emerald-900 border border-emerald-400 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                      </div>
                      <div>
                        <div className="font-bold text-emerald-300 text-sm">
                          Vous êtes à présent le meilleur enchérisseur
                        </div>
                        <div className="text-slate-300 text-xs mt-0.5">
                          Votre offre maximale confidentielle de <strong>{formatEuro(lot.userMaxBidCents)}</strong> est active et mène actuellement la vente.
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-full bg-amber-900/80 border border-amber-400 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5 text-amber-300" />
                      </div>
                      <div>
                        <div className="font-bold text-amber-300 text-sm">
                          Votre offre ne dépasse pas l'offre maximum d'un autre enchérisseur
                        </div>
                        <div className="text-slate-300 text-xs mt-0.5">
                          Un autre enchérisseur a placé une enchère automatique supérieure. Votre offre de {formatEuro(lot.userMaxBidCents)} a été immédiatement couverte et surenchérie. Vous n'êtes pas en tête.
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Bidding Feedback Messages - Flash response right after submitting */}
              {bidFeedback && (
                bidFeedback.type === 'WINNING' ? (
                  <div className="mt-3 p-4 rounded-xl bg-gradient-to-r from-emerald-950 via-[#1C2541] to-slate-900 border-2 border-emerald-400 text-emerald-100 text-xs sm:text-sm space-y-2 shadow-xl animate-in fade-in">
                    <div className="flex items-center gap-2 font-bold text-emerald-300 text-sm sm:text-base">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <span>Vous êtes à présent le meilleur enchérisseur</span>
                    </div>
                    <p className="text-slate-200 leading-relaxed text-xs sm:text-sm">
                      {bidFeedback.message}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                      <span className="bg-emerald-900/60 px-2.5 py-1 rounded border border-emerald-400/50 text-emerald-200">
                        🔒 Plafond secret : <strong>{formatEuro(bidFeedback.bidAmountCents)}</strong> (conservé strictement confidentiel)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 p-4 rounded-xl bg-gradient-to-r from-amber-950 via-red-950/90 to-slate-900 border-2 border-amber-500/90 text-amber-100 text-xs sm:text-sm space-y-2.5 shadow-xl animate-in fade-in">
                    <div className="flex items-center gap-2 font-bold text-amber-300 text-sm sm:text-base">
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                      <span>Votre offre ne dépasse pas l'offre maximum d'un autre enchérisseur</span>
                    </div>
                    <p className="text-slate-200 leading-relaxed text-xs sm:text-sm">
                      {bidFeedback.message}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                      <span className="bg-black/60 px-2.5 py-1 rounded border border-amber-500/40 text-amber-200">
                        Votre montant soumis : <strong>{formatEuro(bidFeedback.bidAmountCents)}</strong> (insuffisant)
                      </span>
                      {bidFeedback.currentPriceCents && (
                        <span className="bg-black/60 px-2.5 py-1 rounded border border-amber-500/40 text-amber-300 font-bold">
                          Prix actuel du lot : <strong>{formatEuro(bidFeedback.currentPriceCents)}</strong>
                        </span>
                      )}
                    </div>
                    <div className="bg-[#0B132B]/80 border border-amber-500/40 rounded-lg p-2.5 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
                      <span>💡 Pour prendre la tête et devenir le meilleur enchérisseur :</span>
                      <span className="font-mono font-bold text-amber-300 bg-amber-950/80 px-2.5 py-1 rounded border border-amber-400/50">
                        Prochaine offre requise : {formatEuro(minRequiredCents)}
                      </span>
                    </div>
                  </div>
                )
              )}

              {bidError && (
                <div className="mt-3 p-3 rounded-lg bg-rose-950 border border-rose-500/60 text-rose-200 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                  <span>{bidError}</span>
                </div>
              )}

              {/* Bidding Console Form */}
              {lot.status === 'ACTIVE' && (
                <div className="mt-4 pt-4 border-t border-slate-800">
                  {!user ? (
                    <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-4 text-center">
                      <Lock className="w-6 h-6 text-amber-400 mx-auto mb-2" />
                      <p className="text-sm font-medium text-slate-200 mb-1">
                        Réservé aux professionnels de l'antiquité & brocante
                      </p>
                      <p className="text-xs text-slate-400 mb-3">
                        Connectez-vous avec votre compte professionnel validé pour enchérir.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenLogin) onOpenLogin();
                        }}
                        className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-semibold px-4 py-2 rounded-lg text-xs shadow-md transition-colors cursor-pointer"
                      >
                        Se connecter / S'inscrire
                      </button>
                    </div>
                  ) : user.status === 'PENDING' ? (
                    <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-4 text-xs text-amber-200">
                      <div className="flex items-center gap-2 font-semibold mb-1">
                        <Clock className="w-4 h-4 text-amber-400" />
                        <span>Compte en cours d'examen</span>
                      </div>
                      <p className="text-slate-300">
                        Votre inscription professionnelle est en cours de validation par le vendeur. Vous recevrez l'accès aux enchères dès vérification de votre activité.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleOpenConfirm} className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Votre montant maximum confidentiel (€) :
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min={minRequiredEuros}
                            step="1"
                            placeholder={`Ex: ${minRequiredEuros + 50}`}
                            value={bidAmountInput}
                            onChange={(e) => setBidAmountInput(e.target.value)}
                            className="w-full bg-[#0B132B] border border-slate-700 focus:border-[#D4AF37] rounded-lg px-4 py-2.5 text-lg font-mono font-bold text-amber-200 focus:outline-none transition-colors"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm">
                            EUR
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-[#D4AF37]" />
                          <span>
                            Montant confidentiel : le moteur n'utilisera que le minimum requis pour couvrir les concurrents.
                          </span>
                        </p>
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-[#D4AF37] to-[#B38728] hover:from-[#E5C158] hover:to-[#C59B3C] text-slate-950 font-bold py-3 rounded-lg text-sm shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <Gavel className="w-4 h-4 text-slate-950" />
                        <span>Placer mon offre maximale</span>
                      </button>

                      {/* Info Notifications Téléphone */}
                      {notifPermission === 'granted' ? (
                        <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-300 bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-500/30 text-center">
                          <Bell className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Notification activée sur votre téléphone en cas de surenchère sur cet objet.</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={requestNotifPermission}
                          className="flex items-center justify-between w-full text-[11px] text-amber-200 bg-amber-950/40 hover:bg-amber-900/50 px-3 py-1.5 rounded-lg border border-amber-500/30 transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <Bell className="w-3.5 h-3.5 text-amber-400" />
                            <span>M'avertir par notification si je suis surenchéri</span>
                          </span>
                          <span className="font-bold underline text-amber-300">Activer</span>
                        </button>
                      )}
                    </form>
                  )}
                </div>
              )}

              {/* Console for Upcoming Lots */}
              {(lot.status === 'DRAFT' || lot.status === 'SCHEDULED') && (
                <div className="mt-4 pt-4 border-t border-slate-800">
                  <div className="bg-[#1C2541]/70 border border-[#D4AF37]/30 rounded-xl p-5 text-center">
                    <Calendar className="w-6 h-6 text-[#D4AF37] mx-auto mb-2" />
                    <p className="text-sm font-serif font-bold text-slate-100 mb-1">
                      Cette enchère ouvrira lundi prochain à 10h00
                    </p>
                    <p className="text-xs text-slate-400 mb-4 max-w-md mx-auto">
                      Les offres débuteront à la mise à prix de {formatEuro(lot.startingPriceCents)}. Vous pouvez mettre cet objet dans vos favoris dès maintenant pour le retrouver et enchérir dès son ouverture.
                    </p>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(lot.id)}
                      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-md ${
                        isFav
                          ? 'bg-rose-950 border-rose-500 text-rose-200'
                          : 'bg-gradient-to-r from-[#D4AF37] to-[#B38728] hover:from-[#E5C158] hover:to-[#C59B3C] text-slate-950 border-transparent'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-500 text-rose-500' : 'text-slate-950'}`} />
                      <span>{isFav ? 'Objet enregistré dans vos favoris' : 'Mettre dans mes favoris'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Direct Question / Chat with Seller */}
              <div className="mt-3 bg-[#0B132B]/80 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 shadow-inner">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <MessageSquare className="w-4 h-4 text-[#D4AF37]" />
                  <span>Une question sur cet objet ?</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (lot) {
                      openChat({
                        id: lot.id,
                        reference: lot.reference,
                        title: lot.title,
                        image: lot.images && lot.images[0] ? lot.images[0] : undefined,
                        startingPriceCents: lot.startingPriceCents,
                      });
                    } else {
                      openChat();
                    }
                  }}
                  className="text-xs bg-[#1C2541] hover:bg-[#253256] text-[#D4AF37] border border-[#D4AF37]/40 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>Poser une question (Chat EN LIGNE 9h–17h)</span>
                </button>
              </div>
            </div>

            {/* Metadata Tabs */}
            <div className="border-t border-slate-800 pt-4">
              <div className="flex border-b border-slate-800 gap-4 text-xs font-medium mb-3">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`pb-2 border-b-2 transition-colors ${
                    activeTab === 'details'
                      ? 'border-[#D4AF37] text-amber-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Description & Dimensions
                </button>
                <button
                  onClick={() => setActiveTab('condition')}
                  className={`pb-2 border-b-2 transition-colors ${
                    activeTab === 'condition'
                      ? 'border-[#D4AF37] text-amber-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Rapport d'État & Usures
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`pb-2 border-b-2 transition-colors ${
                    activeTab === 'history'
                      ? 'border-[#D4AF37] text-amber-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Historique Public ({history.length})
                </button>
              </div>

              {activeTab === 'details' && (
                <div className="space-y-3 text-xs leading-relaxed text-slate-300">
                  <p>{lot.description}</p>
                  <div className="grid grid-cols-2 gap-2 bg-[#1C2541]/40 p-3 rounded-lg border border-slate-800 font-mono text-[11px]">
                    <div>
                      <span className="text-slate-400 block font-sans">Dimensions :</span>
                      <span className="text-amber-200 font-medium">{lot.dimensions || 'Non spécifié'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-sans">Poids :</span>
                      <span className="text-amber-200 font-medium">{lot.weight || 'Non spécifié'}</span>
                    </div>
                  </div>
                  {lot.observations && (
                    <div className="text-[11px] text-slate-400 italic">
                      Note : {lot.observations}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'condition' && (
                <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                  <div>
                    <h4 className="font-semibold text-amber-300 mb-1">État de conservation :</h4>
                    <p>{lot.conditionReport}</p>
                  </div>
                  {lot.flaws && (
                    <div className="bg-amber-950/20 border border-amber-900/40 p-2.5 rounded-lg">
                      <h4 className="font-semibold text-amber-400 mb-0.5">Défauts & marques d'usage :</h4>
                      <p className="text-slate-300">{lot.flaws}</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'history' && (
                <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs font-mono">
                  {history.length === 0 ? (
                    <p className="text-slate-400 italic py-2">Aucune enchère pour le moment.</p>
                  ) : (
                    history.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800"
                      >
                        <span className="text-slate-400">{item.publicBidderId}</span>
                        <span className="text-amber-300 font-bold">
                          {formatEuro(item.amountCents)}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(item.createdAt).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="bg-[#1C2541] px-5 py-2.5 border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap items-center justify-between shrink-0">
          <span>Règlement sous 48h par PayPal en cas de victoire</span>
          <span className="text-amber-300/80">Document de transaction sans TVA (Vendeur Particulier)</span>
        </div>
      </div>

      {/* Confirmation Modal (Master Prompt Section 19) */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-[#1C2541] border border-[#D4AF37] rounded-xl p-6 shadow-2xl text-slate-200">
            <div className="flex items-center gap-2 text-amber-400 mb-3">
              <Gavel className="w-5 h-5" />
              <h3 className="font-serif text-lg font-bold">Confirmation de votre offre</h3>
            </div>

            <p className="text-sm text-slate-200 mb-2">
              Vous allez placer une enchère maximum de :
            </p>
            <div className="text-2xl font-serif font-bold text-[#D4AF37] bg-[#0B132B] p-3 rounded-lg border border-slate-700 text-center mb-4">
              {bidAmountInput} €
            </div>

            <p className="text-xs text-amber-300/90 bg-amber-950/40 p-3 rounded-lg border border-amber-600/30 mb-4 leading-relaxed">
              « En confirmant cette enchère, vous vous engagez formellement à acheter l'objet si vous remportez la vente. »
            </p>

            {/* Checkbox for conditions if needed */}
            {!user?.acceptedTerms && (
              <label className="flex items-start gap-2 text-xs text-slate-300 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptTermsChecked}
                  onChange={(e) => setAcceptTermsChecked(e.target.checked)}
                  className="mt-0.5 rounded border-slate-600 text-amber-500 focus:ring-amber-500"
                />
                <span>
                  J'ai pris connaissance et j'accepte les conditions de participation aux ventes privées et comprends que toute enchère confirmée constitue un engagement d'achat.
                </span>
              </label>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                disabled={submittingBid}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                ANNULER
              </button>
              <button
                type="button"
                onClick={handleConfirmBid}
                disabled={submittingBid || (!user?.acceptedTerms && !acceptTermsChecked)}
                className="bg-[#D4AF37] hover:bg-[#E5C158] disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs shadow transition-colors flex items-center gap-1.5"
              >
                {submittingBid ? (
                  <span>Transmission...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-slate-950" />
                    <span>CONFIRMER MON ENCHÈRE</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
