import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useFavorites } from '../context/FavoritesContext.tsx';
import { Order, TransactionDoc, User, Lot } from '../types/index.ts';
import { TransactionDocumentModal } from './TransactionDocumentModal.tsx';
import { LotDetailModal } from './LotDetailModal.tsx';
import { getLotPrimaryImage, handleLotImageError } from '../lib/image-utils.ts';
import { DEFAULT_LOTS } from '../data/default-lots.ts';
import {
  Building,
  Gavel,
  Trophy,
  Package,
  FileText,
  User as UserIcon,
  CreditCard,
  Truck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Save,
  AlertCircle,
  Eye,
  Heart,
  Calendar,
  RotateCw,
  Scale,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { calculateShipping } from '../lib/shipping.ts';
import { ShippingRatesModal } from './ShippingRatesModal.tsx';
import { LiveCountdown } from './LiveCountdown.tsx';
import {
  formatSaleDateHeader,
  formatSaleHours,
  getSaleStatusBadge,
} from '../lib/sales-schedule.ts';

interface ActiveBidItem {
  bidId: number;
  lotId: number;
  lotReference: string;
  lotTitle: string;
  lotImage?: string;
  currentPriceCents: number;
  myMaxBidCents: number;
  isWinning: boolean;
  endsAt: string;
  lotStatus: string;
}

interface CustomerSpaceProps {
  onBack?: () => void;
}

export const CustomerSpace: React.FC<CustomerSpaceProps> = ({ onBack }) => {
  const { user, token, refreshUser } = useAuth();
  const { favoriteIds, toggleFavorite } = useFavorites();
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'bids' | 'won' | 'orders' | 'documents' | 'favorites' | 'profile'
  >('dashboard');

  const [activeBids, setActiveBids] = useState<ActiveBidItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [documents, setDocuments] = useState<TransactionDoc[]>([]);
  const [salesSchedule, setSalesSchedule] = useState<any>(null);
  const [allLots, setAllLots] = useState<Lot[]>(() => DEFAULT_LOTS);
  const [selectedLotDetailId, setSelectedLotDetailId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal payment
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<Order | null>(null);
  const [payingWithPayPal, setPayingWithPayPal] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [activePaymentMethod, setActivePaymentMethod] = useState<'paypal' | 'card'>('paypal');
  const [cardDetails, setCardDetails] = useState({
    cardholder: '',
    cardNumber: '',
    expiry: '',
    cvv: '',
  });

  // Document modal
  const [selectedDoc, setSelectedDoc] = useState<TransactionDoc | null>(null);
  const [showShippingModal, setShowShippingModal] = useState(false);

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
    companyName: user?.companyName || '',
    activity: user?.activity || '',
    country: user?.country || 'France',
    vatNumber: user?.vatNumber || '',
    website: user?.website || '',
    addressLine1: user?.addressLine1 || '',
    addressLine2: user?.addressLine2 || '',
    postalCode: user?.postalCode || '',
    city: user?.city || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSavedMsg, setProfileSavedMsg] = useState(false);

  const formatEuro = (cents: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      // Dashboard & bids
      const dashRes = await fetch('/api/my/dashboard', { headers });
      if (dashRes.ok) {
        const data = await dashRes.json();
        setActiveBids(data.activeBids || []);
      }

      // Orders
      const ordersRes = await fetch('/api/my/orders', { headers });
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        const mappedOrders = data.orders.map((o: any) => ({
          ...o.order,
          lot: o.lot,
        }));
        setOrders(mappedOrders);
      }

      // Documents
      const docsRes = await fetch('/api/my/documents', { headers });
      if (docsRes.ok) {
        const data = await docsRes.json();
        const mappedDocs = data.documents.map((d: any) => d.doc);
        setDocuments(mappedDocs);
      }

      // Calendrier des Ventes Bi-Hebdomadaires (Mardi & Vendredi)
      try {
        const schedRes = await fetch('/api/sales/schedule');
        if (schedRes.ok) {
          setSalesSchedule(await schedRes.json());
        }
      } catch (e) {
        console.error('Erreur chargement calendrier ventes:', e);
      }

      // Lots for Favorites
      try {
        const [currRes, upRes] = await Promise.all([
          fetch('/api/lots?filter=current'),
          fetch('/api/lots?filter=upcoming'),
        ]);
        const currLots = currRes.ok ? (await currRes.json()).lots || [] : [];
        const upLots = upRes.ok ? (await upRes.json()).lots || [] : [];
        setAllLots([...currLots, ...upLots]);
      } catch (e) {
        console.error('Erreur chargement lots pour favoris:', e);
      }
    } catch (err) {
      console.error('Erreur chargement données espace pro:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token, activeTab]);

  useEffect(() => {
    if (user) {
      setProfileForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        companyName: user.companyName || '',
        activity: user.activity || '',
        country: user.country || 'France',
        vatNumber: user.vatNumber || '',
        website: user.website || '',
        addressLine1: user.addressLine1 || '',
        addressLine2: user.addressLine2 || '',
        postalCode: user.postalCode || '',
        city: user.city || '',
      });
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSavingProfile(true);
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileForm),
      });
      if (res.ok) {
        await refreshUser();
        setProfileSavedMsg(true);
        setTimeout(() => setProfileSavedMsg(false), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingProfile(false);
    }
  };

  // Traitement du paiement PayPal ou Carte bancaire via PayPal
  const handleExecutePayPal = async (order: Order, methodLabel: string = 'PayPal') => {
    if (!token) return;

    if (methodLabel === 'Carte Bancaire') {
      if (cardDetails.cardNumber && cardDetails.cardNumber.replace(/\s+/g, '').length < 15) {
        setPaymentError('Veuillez saisir un numéro de carte bancaire valide (16 chiffres).');
        return;
      }
    }

    setPayingWithPayPal(true);
    setPaymentError(null);
    setPaymentSuccess(null);

    try {
      // 1. Créer l'ordre PayPal côté backend
      const createRes = await fetch(`/api/orders/${order.id}/paypal/create`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || 'Erreur création de la transaction.');

      const paypalOrderId = createData.id;

      // 2. Capture sécurisée côté serveur avec spécification de la méthode choisie
      const finalMethodName = methodLabel === 'Carte Bancaire' ? 'Carte Bancaire (via PayPal)' : 'PayPal';
      const captureRes = await fetch(`/api/orders/${order.id}/paypal/capture`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paypalOrderId,
          paymentMethod: finalMethodName,
        }),
      });

      const captureData = await captureRes.json();
      if (!captureRes.ok) throw new Error(captureData.error || 'Erreur lors de la capture du paiement.');

      setPaymentSuccess(
        `Paiement validé avec succès (${finalMethodName}) ! Reçu officiel n° ${captureData.documentNumber} émis.`
      );
      await loadData();
      setTimeout(() => {
        setSelectedOrderForPayment(null);
        setPaymentSuccess(null);
      }, 2500);
    } catch (err: any) {
      setPaymentError(err.message);
    } finally {
      setPayingWithPayPal(false);
    }
  };

  const wonOrdersPendingPayment = orders.filter((o) => o.status === 'AWAITING_PAYMENT');
  const paidOrders = orders.filter((o) => o.status !== 'AWAITING_PAYMENT');

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case 'AWAITING_PAYMENT':
        return (
          <span className="bg-amber-950 text-amber-300 border border-amber-500/40 text-[11px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-400" />
            En attente de règlement
          </span>
        );
      case 'PAID':
        return (
          <span className="bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[11px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Payé • En préparation
          </span>
        );
      case 'PURCHASED':
      case 'RECEIVED':
      case 'READY_TO_SHIP':
        return (
          <span className="bg-blue-950 text-blue-300 border border-blue-500/40 text-[11px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1">
            <Package className="w-3 h-3 text-blue-400" />
            Objet préparé pour expédition
          </span>
        );
      case 'SHIPPED':
        return (
          <span className="bg-indigo-950 text-indigo-300 border border-indigo-500/40 text-[11px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1">
            <Truck className="w-3 h-3 text-indigo-400" />
            Expédié
          </span>
        );
      case 'DELIVERED':
        return (
          <span className="bg-slate-800 text-slate-200 border border-slate-600 text-[11px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Livré
          </span>
        );
      default:
        return <span className="text-slate-400 text-xs">{status}</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Return button */}
      {onBack && (
        <div className="mb-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-white bg-[#1C2541] hover:bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 transition-colors shadow"
          >
            <span>← Retour aux enchères</span>
          </button>
        </div>
      )}

      {/* Top Welcome Card */}
      <div className="bg-[#1C2541] border border-[#D4AF37]/30 rounded-2xl p-6 mb-8 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold">
            ESPACE CLIENT PROFESSIONNEL
          </span>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-amber-100 mt-1">
            {user?.companyName || user?.firstName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : user?.email}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Statut du compte :{' '}
            <strong className="text-emerald-400">
              {user?.status === 'APPROVED' ? 'Professionnel Vérifié & Validé' : user?.status}
            </strong>{' '}
            • Enchères directes sans commission d'intermédiaire
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            disabled={loading}
            title="Rafraîchir les enchères et commandes"
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-[#0B132B] hover:bg-slate-800 text-xs font-medium text-amber-200 hover:text-white border border-slate-700 hover:border-amber-400/40 rounded-xl transition-all cursor-pointer shadow"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
          <div className="bg-[#0B132B] px-4 py-2 rounded-xl border border-slate-700 text-center">
            <span className="text-xs text-slate-400 block">Enchères en cours</span>
            <span className="text-xl font-bold font-mono text-amber-200">{activeBids.length}</span>
          </div>
          <div className="bg-[#0B132B] px-4 py-2 rounded-xl border border-slate-700 text-center">
            <span className="text-xs text-slate-400 block">Commandes remportées</span>
            <span className="text-xl font-bold font-mono text-emerald-300">{orders.length}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Sidebar + Active Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Navigation (3 cols) */}
        <div className="lg:col-span-3 space-y-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'dashboard'
                ? 'bg-[#D4AF37] text-slate-950 shadow-lg'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>Tableau de bord</span>
          </button>

          <button
            onClick={() => setActiveTab('bids')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'bids'
                ? 'bg-[#D4AF37] text-slate-950 shadow-lg'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <Gavel className="w-4 h-4" />
              <span>Mes enchères en cours</span>
            </div>
            {activeBids.length > 0 && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  activeTab === 'bids' ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-amber-300'
                }`}
              >
                {activeBids.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('won')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'won'
                ? 'bg-[#D4AF37] text-slate-950 shadow-lg'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <Trophy className="w-4 h-4" />
              <span>Enchères remportées</span>
            </div>
            {wonOrdersPendingPayment.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-rose-600 text-white animate-pulse">
                {wonOrdersPendingPayment.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'orders'
                ? 'bg-[#D4AF37] text-slate-950 shadow-lg'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Mes commandes & Suivi</span>
          </button>

          <button
            onClick={() => setActiveTab('documents')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-all relative group cursor-pointer ${
              activeTab === 'documents'
                ? 'bg-gradient-to-r from-[#D4AF37] to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <CreditCard className={`w-4 h-4 ${activeTab === 'documents' ? 'text-slate-950' : 'text-amber-400'}`} />
              <span className="font-bold">Enchères à payer</span>
            </div>
            {wonOrdersPendingPayment.length > 0 ? (
              <span className="relative flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-400 shadow-[0_0_12px_rgba(212,175,55,0.5)] animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                <span>{wonOrdersPendingPayment.length} à régler</span>
              </span>
            ) : documents.length > 0 ? (
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  activeTab === 'documents' ? 'bg-slate-950/30 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'
                }`}
              >
                {documents.length} doc{documents.length > 1 ? 's' : ''}
              </span>
            ) : null}
          </button>

          <button
            onClick={() => setActiveTab('favorites')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'favorites'
                ? 'bg-[#D4AF37] text-slate-950 shadow-lg'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <Heart className="w-4 h-4 text-rose-400" />
              <span>Mes favoris</span>
            </div>
            {favoriteIds.length > 0 && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  activeTab === 'favorites' ? 'bg-slate-950 text-rose-400' : 'bg-slate-800 text-rose-400'
                }`}
              >
                {favoriteIds.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'profile'
                ? 'bg-[#D4AF37] text-slate-950 shadow-lg'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            <span>Mon Profil & Adresses</span>
          </button>
        </div>

        {/* Right Content Area (9 cols) */}
        <div className="lg:col-span-9 bg-[#1C2541]/70 border border-slate-800 rounded-2xl p-6 min-h-[500px]">
          {/* TAB 1: DASHBOARD OVERVIEW */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#D4AF37] font-bold block">
                    ESPACE PROFESSIONNEL ACCRÉDITÉ
                  </span>
                  <h2 className="text-xl font-serif font-bold text-amber-200">
                    Tableau de Bord des Ventes
                  </h2>
                </div>
                <span className="text-xs text-slate-400 bg-slate-900/80 px-3 py-1 rounded-lg border border-slate-800">
                  2 ventes privées par semaine : <strong>Mardi</strong> & <strong>Vendredi</strong>
                </span>
              </div>

              {/* SECTION 14 & 15 : VENTE EN COURS & PROCHAINE VENTE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* VENTE EN COURS */}
                <div className="bg-[#0B132B] border-2 border-[#D4AF37]/80 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span className="text-xs uppercase tracking-widest font-black text-[#D4AF37]">
                        VENTE EN COURS
                      </span>
                    </div>
                    {salesSchedule?.currentSale ? (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/50 uppercase">
                        VENTE OUVERTE
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        SESSION CLÔTURÉE
                      </span>
                    )}
                  </div>

                  {salesSchedule?.currentSale ? (
                    <div className="space-y-3">
                      <div>
                        <span className="text-xs font-mono font-bold text-amber-300 block">
                          {salesSchedule.currentSale.saleDay === 'VENDREDI' ? 'VENTE DU VENDREDI' : 'VENTE DU MARDI'}
                        </span>
                        <h3 className="font-serif font-bold text-base text-slate-100">
                          {salesSchedule.currentSale.title}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span>Horaires : {formatSaleHours(salesSchedule.currentSale.startsAt, salesSchedule.currentSale.endsAt)}</span>
                          <span>•</span>
                          <span className="text-amber-300 font-semibold">{salesSchedule.currentSale.totalLots || 0} lots au catalogue</span>
                        </div>
                      </div>

                      {/* COMPTE À REBOURS OFFICIEL (Section 15) */}
                      <div className="bg-[#1C2541] rounded-xl p-3 border border-[#D4AF37]/30">
                        <LiveCountdown
                          startDate={salesSchedule.currentSale.startsAt}
                          targetDate={salesSchedule.currentSale.endsAt}
                          closeTimeLabel="22h00"
                        />
                      </div>

                      <button
                        onClick={() => {
                          const catalogEl = document.getElementById('catalogue');
                          if (catalogEl) catalogEl.scrollIntoView({ behavior: 'smooth' });
                          else if (onBack) onBack();
                        }}
                        className="w-full bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold py-2 rounded-xl text-xs transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Gavel className="w-3.5 h-3.5" />
                        <span>Consulter le catalogue & Porter des offres</span>
                      </button>
                    </div>
                  ) : salesSchedule?.nextSale ? (
                    <div className="space-y-3">
                      <div>
                        <span className="text-xs font-mono font-bold text-amber-300 block">
                          {salesSchedule.nextSale.saleDay === 'VENDREDI' ? 'VENTE DU VENDREDI' : 'VENTE DU MARDI'}
                        </span>
                        <h3 className="font-serif font-bold text-base text-slate-100">
                          {salesSchedule.nextSale.title}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span>Horaires : {formatSaleHours(salesSchedule.nextSale.startsAt, salesSchedule.nextSale.endsAt)}</span>
                          <span>•</span>
                          <span className="text-amber-300 font-semibold">{salesSchedule.nextSale.totalLots || 0} lots au catalogue</span>
                        </div>
                      </div>

                      {/* COMPTE À REBOURS OFFICIEL (Section 15) */}
                      <div className="bg-[#1C2541] rounded-xl p-3 border border-[#D4AF37]/30">
                        <LiveCountdown
                          startDate={salesSchedule.nextSale.startsAt}
                          targetDate={salesSchedule.nextSale.endsAt}
                          closeTimeLabel="22h00"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center space-y-2">
                      <Clock className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-xs text-slate-300 font-medium">
                        Aucune vente privée n'est en direct à cet instant.
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Consultez la prochaine session programmée ci-contre (10h00 → 22h00).
                      </p>
                    </div>
                  )}
                </div>

                {/* PROCHAINE VENTE */}
                <div className="bg-[#0B132B]/80 border border-slate-800 rounded-2xl p-5 shadow-lg relative flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs uppercase tracking-widest font-black text-slate-300">
                        PROCHAINE VENTE
                      </span>
                      {salesSchedule?.nextSale ? (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${getSaleStatusBadge(salesSchedule.nextSale.status).className}`}>
                          {getSaleStatusBadge(salesSchedule.nextSale.status).label}
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                          EN PRÉPARATION
                        </span>
                      )}
                    </div>

                    {salesSchedule?.nextSale ? (
                      <div className="space-y-3">
                        <div className="border-b border-slate-800 pb-2">
                          <span className="text-xs font-mono font-bold text-slate-300 block">
                            {salesSchedule.nextSale.saleDay === 'VENDREDI' ? 'VENTE DU VENDREDI' : 'VENTE DU MARDI'}
                          </span>
                          <h3 className="font-serif font-bold text-lg text-slate-200">
                            {formatSaleDateHeader(salesSchedule.nextSale.startsAt)}
                          </h3>
                          <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                            <span className="font-mono text-amber-200">{formatSaleHours(salesSchedule.nextSale.startsAt, salesSchedule.nextSale.endsAt)}</span>
                            <span>•</span>
                            <span>{salesSchedule.nextSale.totalLots || 0} objets sélectionnés</span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-300 italic line-clamp-2">
                          {salesSchedule.nextSale.title}
                        </p>
                      </div>
                    ) : (
                      <div className="py-6 text-center text-xs text-slate-400">
                        La prochaine vente du Mardi ou Vendredi est en cours de sélection et de préparation.
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-800/80 mt-4 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Calendrier commercial : <strong>Mardi</strong> & <strong>Vendredi</strong></span>
                    <span className="text-amber-300/80">Accès réservé</span>
                  </div>
                </div>
              </div>

              {/* Alert if won items await payment */}
              {wonOrdersPendingPayment.length > 0 && (
                <div className="bg-amber-950/60 border-2 border-amber-500 rounded-xl p-4 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3 shadow-lg shadow-amber-950/30">
                  <div>
                    <span className="font-bold block text-sm flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-amber-400" />
                      {wonOrdersPendingPayment.length} lot(s) remporté(s) en attente de paiement !
                    </span>
                    <span className="text-slate-300 block mt-0.5">
                      Délai officiel de 24h pour finaliser le règlement. En cas de dépassement, le lot est automatiquement transmis au 2ème meilleur enchérisseur.
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveTab('documents')}
                    className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition-colors shadow cursor-pointer"
                  >
                    Régler maintenant ({wonOrdersPendingPayment.length})
                  </button>
                </div>
              )}

              {/* LES 4 MODULES CLÉS DU PROFESSIONNEL (Section 14) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  onClick={() => setActiveTab('bids')}
                  className="bg-[#0B132B] hover:bg-slate-900 border border-slate-800 hover:border-amber-500/50 p-4 rounded-xl text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase font-semibold text-slate-400 group-hover:text-amber-300">
                      Mes Offres
                    </span>
                    <Gavel className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-100">
                    {activeBids.length}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    {activeBids.filter((b) => b.isWinning).length} meneur(s)
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('won')}
                  className="bg-[#0B132B] hover:bg-slate-900 border border-slate-800 hover:border-amber-500/50 p-4 rounded-xl text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase font-semibold text-slate-400 group-hover:text-amber-300">
                      Lots Remportés
                    </span>
                    <Trophy className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-emerald-400">
                    {orders.length}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Adjudications gagnées
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('documents')}
                  className="bg-[#0B132B] hover:bg-slate-900 border border-slate-800 hover:border-amber-500/50 p-4 rounded-xl text-left transition-all cursor-pointer group relative"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase font-semibold text-slate-400 group-hover:text-amber-300">
                      Lots à Payer
                    </span>
                    <CreditCard className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-amber-300">
                    {wonOrdersPendingPayment.length}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Délai de 24h
                  </span>
                  {wonOrdersPendingPayment.length > 0 && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('orders')}
                  className="bg-[#0B132B] hover:bg-slate-900 border border-slate-800 hover:border-amber-500/50 p-4 rounded-xl text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase font-semibold text-slate-400 group-hover:text-amber-300">
                      Historique Achats
                    </span>
                    <Package className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-blue-300">
                    {orders.filter((o) => o.status !== 'AWAITING_PAYMENT').length}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Commandes & Suivi
                  </span>
                </button>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#0B132B] p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase font-semibold text-slate-400">
                      Mes enchères actives ({activeBids.length})
                    </span>
                    {activeBids.length > 0 && (
                      <button
                        onClick={() => setActiveTab('bids')}
                        className="text-[11px] text-[#D4AF37] hover:underline font-semibold cursor-pointer"
                      >
                        Voir tout ({activeBids.length}) →
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {activeBids.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-3">
                        Vous ne participez à aucune enchère active actuellement.
                      </p>
                    ) : (
                      activeBids.slice(0, 4).map((b) => (
                        <div
                          key={b.bidId}
                          onClick={() => setSelectedLotDetailId(b.lotId)}
                          className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/40 transition-colors cursor-pointer"
                        >
                          <div className="truncate mr-3">
                            <span className="font-mono text-amber-400 font-bold block">{b.lotReference}</span>
                            <span className="text-slate-200 block truncate max-w-[220px]">
                              {b.lotTitle}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-bold text-amber-200 block font-mono">
                              {formatEuro(b.currentPriceCents)}
                            </span>
                            <span
                              className={`text-[10px] font-semibold flex items-center justify-end gap-1 ${
                                b.isWinning ? 'text-emerald-400' : 'text-amber-400'
                              }`}
                            >
                              {b.isWinning ? (
                                <>
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                  <span>Meneur</span>
                                </>
                              ) : (
                                <span>Surenchéri</span>
                              )}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-[#0B132B] p-4 rounded-xl border border-slate-800">
                  <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">
                    Dernières commandes
                  </span>
                  <div className="space-y-2">
                    {orders.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-3">
                        Aucune commande pour le moment.
                      </p>
                    ) : (
                      orders.slice(0, 3).map((o) => (
                        <div
                          key={o.id}
                          className="flex items-center justify-between text-xs p-2 rounded bg-slate-900/60 border border-slate-800"
                        >
                          <div>
                            <span className="font-mono text-slate-300 font-bold">{o.orderNumber}</span>
                            <span className="text-slate-400 block truncate max-w-[200px]">
                              {o.lot?.title || 'Lot'}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-slate-200 block">
                              {formatEuro(o.totalCents)}
                            </span>
                            <span className="text-[10px] text-emerald-400">{o.status}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ACTIVE BIDS */}
          {activeTab === 'bids' && (
            <div className="space-y-4">
              <h2 className="text-lg font-serif font-bold text-amber-200">
                Vos enchères en cours
              </h2>
              {activeBids.length === 0 ? (
                <div className="bg-[#0B132B] p-8 rounded-xl border border-slate-800 text-center">
                  <Gavel className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">
                    Vous n'avez pas d'enchère active sur les lots de la semaine.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeBids.map((bid) => (
                    <div
                      key={bid.bidId}
                      className="bg-[#0B132B] border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-4">
                        {bid.lotImage && (
                          <img
                            src={bid.lotImage}
                            alt=""
                            className="w-16 h-16 rounded-lg object-cover border border-slate-700"
                            referrerPolicy="strict-origin-when-cross-origin"
                            onError={(e) => handleLotImageError(e, bid.lotImage)}
                          />
                        )}
                        <div>
                          <span className="text-xs font-mono font-bold text-amber-400">
                            {bid.lotReference}
                          </span>
                          <h3 className="font-serif font-bold text-slate-100 text-sm">
                            {bid.lotTitle}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            {bid.isWinning ? (
                              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Vous êtes à présent le meilleur enchérisseur
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" />
                                Votre offre ne dépasse pas l'offre maximum (surenchéri)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto">
                        <div className="sm:text-right">
                          <span className="text-[10px] uppercase text-slate-400 block">Prix actuel</span>
                          <div className="text-xl font-bold font-serif text-[#D4AF37]">
                            {formatEuro(bid.currentPriceCents)}
                          </div>
                          <span className="text-xs text-slate-400 font-mono block">
                            Votre plafond secret : {formatEuro(bid.myMaxBidCents)}
                          </span>
                        </div>
                        <button
                          onClick={() => setSelectedLotDetailId(bid.lotId)}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#D4AF37]/20 hover:bg-[#D4AF37] text-amber-300 hover:text-slate-950 border border-[#D4AF37]/50 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Voir la fiche / Surenchérir</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: WON LOTS & PAYMENTS (Master Prompt Section 28) */}
          {activeTab === 'won' && (
            <div className="space-y-4">
              <h2 className="text-lg font-serif font-bold text-amber-200">
                Lots remportés & Règlement PayPal
              </h2>
              {orders.length === 0 ? (
                <div className="bg-[#0B132B] p-8 rounded-xl border border-slate-800 text-center">
                  <Trophy className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">
                    Vous n'avez pas encore remporté d'enchère sur la plateforme.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => {
                    const isAwaiting = order.status === 'AWAITING_PAYMENT';
                    return (
                      <div
                        key={order.id}
                        className={`bg-[#0B132B] border rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 transition-all ${
                          isAwaiting ? 'border-amber-500/50 shadow-lg' : 'border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0">
                            <Trophy className="w-6 h-6 text-amber-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-slate-300">
                                {order.orderNumber}
                              </span>
                              {getOrderStatusBadge(order.status)}
                            </div>
                            <h3 className="font-serif font-bold text-slate-100 text-sm mt-0.5">
                              {order.lot?.title || `Lot ID #${order.lotId}`}
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Prix d'adjudication : {formatEuro(order.finalPriceCents)} + Port sécurisé :{' '}
                              {formatEuro(order.shippingCostCents)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <span className="text-[10px] uppercase text-slate-400 block">Total net</span>
                            <div className="text-xl font-bold font-mono text-amber-200">
                              {formatEuro(order.totalCents)}
                            </div>
                          </div>

                          {isAwaiting ? (
                            <button
                              onClick={() => setSelectedOrderForPayment(order)}
                              className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-4 py-2.5 rounded-lg text-xs shadow-lg flex items-center gap-2 transition-all cursor-pointer"
                            >
                              <CreditCard className="w-4 h-4" />
                              <span>PAYER AVEC PAYPAL</span>
                            </button>
                          ) : (
                            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" />
                              Paiement confirmé
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ORDERS & TRACKING */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              <h2 className="text-lg font-serif font-bold text-amber-200">
                Suivi des commandes & Expéditions
              </h2>
              {orders.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Aucune commande enregistrée.</p>
              ) : (
                <div className="space-y-4">
                  {orders.map((o) => (
                    <div
                      key={o.id}
                      className="bg-[#0B132B] border border-slate-800 rounded-xl p-5 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                        <div>
                          <span className="font-mono text-sm font-bold text-amber-300">
                            {o.orderNumber}
                          </span>
                          <span className="text-xs text-slate-400 ml-2">
                            du {new Date(o.createdAt).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                        {getOrderStatusBadge(o.status)}
                      </div>

                      <div className="flex flex-wrap items-center justify-between text-xs text-slate-300">
                        <div>
                          <span className="text-slate-400 block">Objet :</span>
                          <span className="font-semibold text-slate-100">{o.lot?.title}</span>
                        </div>

                        <div>
                          <span className="text-slate-400 block">Expédition & Suivi :</span>
                          {o.trackingNumber ? (
                            <span className="font-mono text-amber-300 font-bold">
                              {o.shippingCarrier || 'Transporteur'}: {o.trackingNumber}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">En attente d'expédition</span>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="text-slate-400 block">Total Réglé :</span>
                          <span className="font-mono font-bold text-amber-200 text-sm">
                            {formatEuro(o.totalCents)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ENCHÈRES À PAYER & DOCUMENTS DE VENTE */}
          {activeTab === 'documents' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-serif font-bold text-amber-200 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-[#D4AF37]" />
                    <span>Enchères à payer & Documents de vente</span>
                  </h2>
                  <p className="text-xs text-slate-300 mt-1">
                    Règlement sous 24h par PayPal ou Carte bancaire • Téléchargement direct des confirmations de transaction (sans TVA).
                  </p>
                </div>

                <button
                  onClick={() => setShowShippingModal(true)}
                  className="flex items-center gap-2 px-3.5 py-2 bg-[#0B132B] hover:bg-slate-800 border border-[#D4AF37]/40 text-xs font-semibold text-amber-300 rounded-xl transition-all shadow cursor-pointer"
                >
                  <Truck className="w-4 h-4 text-[#D4AF37]" />
                  <span>Grille tarifaire unique (FR / BE)</span>
                </button>
              </div>

              {/* 1. ENCHÈRES EN ATTENTE DE RÈGLEMENT */}
              {wonOrdersPendingPayment.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-amber-300 text-xs font-bold uppercase tracking-wider">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                    </span>
                    <span>Enchère(s) remportée(s) en attente de règlement ({wonOrdersPendingPayment.length})</span>
                  </div>

                  <div className="space-y-3">
                    {wonOrdersPendingPayment.map((order) => {
                      const lotWeight = order.lot?.weight || '';
                      const ship = calculateShipping(lotWeight, {
                        shippingQuoteRequired: Boolean((order.lot as any)?.shippingQuoteRequired),
                        customShippingCostCents: order.shippingCostCents,
                      });

                      return (
                        <div
                          key={order.id}
                          className="bg-gradient-to-r from-amber-950/40 via-[#1C2541] to-[#0B132B] border-2 border-amber-500/60 rounded-xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-4">
                            {order.lot?.images?.[0] ? (
                              <img
                                src={order.lot.images[0]}
                                alt={order.lot.title || ''}
                                className="w-16 h-16 rounded-xl object-cover border border-amber-400/40 shadow"
                                referrerPolicy="strict-origin-when-cross-origin"
                                onError={(e) => handleLotImageError(e, order.lot?.images?.[0])}
                              />
                            ) : (
                              <div className="w-16 h-16 rounded-xl bg-amber-500/10 border border-amber-400/40 flex items-center justify-center text-amber-400">
                                <Trophy className="w-7 h-7" />
                              </div>
                            )}

                            <div className="space-y-1">
                              <span className="font-mono text-xs font-bold text-amber-300">
                                {order.orderNumber} • Réf. {order.lot?.reference}
                              </span>
                              <h3 className="font-serif font-bold text-slate-100 text-sm sm:text-base">
                                {order.lot?.title}
                              </h3>
                              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                                <span>Adjudication : <strong>{formatEuro(order.finalPriceCents)}</strong></span>
                                <span>•</span>
                                <span className="flex items-center gap-1 text-amber-300 font-medium">
                                  <Truck className="w-3.5 h-3.5" />
                                  <span>Livraison unique : {formatEuro(order.shippingCostCents)}</span>
                                  {lotWeight && <span className="text-slate-400">({lotWeight})</span>}
                                </span>
                              </div>
                              <p className="text-[11px] text-amber-400/90 italic">
                                ⏱️ Règlement sous 24h par PayPal ou Carte Bancaire
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto">
                            <div className="sm:text-right">
                              <span className="text-[10px] uppercase text-slate-400 block">Total net à régler</span>
                              <div className="text-xl sm:text-2xl font-bold font-mono text-amber-200">
                                {formatEuro(order.totalCents)}
                              </div>
                              <span className="text-[10px] text-slate-400">0% de frais de vente (particulier)</span>
                            </div>

                            <button
                              onClick={() => {
                                setSelectedOrderForPayment(order);
                                setPaymentError(null);
                                setPaymentSuccess(null);
                              }}
                              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                            >
                              <CreditCard className="w-4 h-4" />
                              <span>RÉGLER MAINTENANT</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. DOCUMENTS DE VENTE & CONFIRMATIONS OFFICIELLES */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif font-bold text-amber-200 text-sm sm:text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#D4AF37]" />
                    <span>Documents de vente & Reçus légaux certifiés</span>
                  </h3>
                  <span className="text-xs text-slate-400">
                    {documents.length} document{documents.length > 1 ? 's' : ''} disponible{documents.length > 1 ? 's' : ''}
                  </span>
                </div>

                {documents.length === 0 && wonOrdersPendingPayment.length === 0 ? (
                  <div className="bg-[#0B132B] p-8 rounded-xl border border-slate-800 text-center">
                    <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">
                      Aucune enchère à payer ni document émis pour le moment.
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Les documents de vente certifiés sont générés automatiquement dès réception du règlement.
                    </p>
                  </div>
                ) : documents.length === 0 ? (
                  <div className="bg-[#0B132B] p-4 rounded-xl border border-slate-800 text-center text-xs text-slate-400">
                    Votre document de vente officiel sera émis instantanément après validation de votre règlement ci-dessus.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="bg-[#0B132B] border border-slate-800 hover:border-amber-500/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-400/30 flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-amber-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-amber-300">
                                {doc.documentNumber}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 font-semibold">
                                Payé & Validé
                              </span>
                            </div>
                            <h4 className="text-xs sm:text-sm font-semibold text-slate-100 mt-0.5">
                              Confirmation de transaction — {doc.lotTitle}
                            </h4>
                            <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                              <span>Réf. {doc.lotReference}</span>
                              <span>•</span>
                              <span>Émis le {new Date(doc.createdAt).toLocaleDateString('fr-FR')}</span>
                              <span>•</span>
                              <span>Livraison : {formatEuro(doc.shippingCents)}</span>
                              <span>•</span>
                              <span className="italic">Vendeur particulier (sans TVA)</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block uppercase">Total réglé</span>
                            <span className="font-mono text-sm sm:text-base font-bold text-amber-200">
                              {formatEuro(doc.totalCents)}
                            </span>
                          </div>
                          <button
                            onClick={() => setSelectedDoc(doc)}
                            className="flex items-center gap-1.5 bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Voir le document de vente</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. RECAPITULATIF TRANSPARENCE GRILLE TARIFAIRE */}
              <div className="bg-[#0B132B] p-4 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-[#D4AF37]" />
                    <span>Engagement Logistique : Grille tarifaire unique</span>
                  </span>
                  <button
                    onClick={() => setShowShippingModal(true)}
                    className="text-[#D4AF37] hover:underline font-semibold text-xs cursor-pointer"
                  >
                    Détail des 8 tranches →
                  </button>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Tous les envois (France ↔ France, France ↔ Belgique, Belgique ↔ France, Belgique ↔ Belgique) sont soumis à une grille tarifaire unique facturée strictement au poids du colis : de <strong>14,90 €</strong> (≤ 500 g) jusqu’à <strong>59,90 €</strong> (≤ 25 kg). Au-delà de 25 kg ou pour les pièces spécifiques, l’expédition fait l’objet d’une cotation sur devis.
                </p>
              </div>
            </div>
          )}

          {/* TAB 6: PRO PROFILE & ADDRESS (Section 7) */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-serif font-bold text-amber-200">
                  Profil professionnel & Adresse de livraison
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Coordonnées nécessaires pour la validation de vos enchères et l'acheminement des colis sécurisés.
                </p>
              </div>

              {profileSavedMsg && (
                <div className="bg-emerald-950 border border-emerald-500 text-emerald-200 text-xs p-3 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Vos coordonnées ont été enregistrées avec succès.</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Prénom</label>
                    <input
                      type="text"
                      value={profileForm.firstName}
                      onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                      className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Nom</label>
                    <input
                      type="text"
                      value={profileForm.lastName}
                      onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                      className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Nom de l'entreprise / Enseigne
                    </label>
                    <input
                      type="text"
                      value={profileForm.companyName}
                      onChange={(e) => setProfileForm({ ...profileForm, companyName: e.target.value })}
                      className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Activité principale
                    </label>
                    <input
                      type="text"
                      placeholder="Antiquaire, Brocanteur, Marchand d'art..."
                      value={profileForm.activity}
                      onChange={(e) => setProfileForm({ ...profileForm, activity: e.target.value })}
                      className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Téléphone</label>
                    <input
                      type="text"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                      className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Numéro TVA Intracommunautaire
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: FR12345678901 ou BE0123456789"
                      value={profileForm.vatNumber}
                      onChange={(e) => setProfileForm({ ...profileForm, vatNumber: e.target.value })}
                      className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-4">
                  <h3 className="text-xs uppercase font-bold text-amber-400 tracking-wider mb-3">
                    Adresse de livraison professionnelle
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Adresse (Ligne 1)
                      </label>
                      <input
                        type="text"
                        value={profileForm.addressLine1}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, addressLine1: e.target.value })
                        }
                        className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Code Postal
                        </label>
                        <input
                          type="text"
                          value={profileForm.postalCode}
                          onChange={(e) =>
                            setProfileForm({ ...profileForm, postalCode: e.target.value })
                          }
                          className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Ville</label>
                        <input
                          type="text"
                          value={profileForm.city}
                          onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                          className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Pays</label>
                        <select
                          value={profileForm.country}
                          onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })}
                          className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                        >
                          <option value="France">France</option>
                          <option value="Belgique">Belgique</option>
                          <option value="Luxembourg">Luxembourg</option>
                          <option value="Suisse">Suisse</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-5 py-2.5 rounded-lg text-xs flex items-center gap-2 shadow transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingProfile ? 'Enregistrement...' : 'Enregistrer mon profil'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 6: MES FAVORIS */}
          {activeTab === 'favorites' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-serif font-bold text-amber-200">
                    Mes Objets Favoris ({favoriteIds.length})
                  </h2>
                  <p className="text-xs text-slate-400">
                    Retrouvez ici les pièces que vous suivez pour les enchères en cours ou à venir.
                  </p>
                </div>
              </div>

              {allLots.filter((l) => favoriteIds.includes(l.id)).length === 0 ? (
                <div className="text-center py-16 bg-[#0B132B]/60 rounded-xl border border-slate-800">
                  <Heart className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-300 mb-1">
                    Vous n'avez aucun objet dans vos favoris pour le moment
                  </p>
                  <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
                    Cliquez sur l'icône cœur sur n'importe quel objet du catalogue pour le suivre facilement.
                  </p>
                  {onBack && (
                    <button
                      onClick={onBack}
                      className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      Consulter les enchères
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {allLots
                    .filter((l) => favoriteIds.includes(l.id))
                    .map((lot) => {
                      const isUpcoming = lot.status === 'DRAFT' || lot.status === 'SCHEDULED';
                      return (
                        <div
                          key={lot.id}
                          className="bg-[#0B132B]/90 border border-[#D4AF37]/30 hover:border-[#D4AF37]/70 rounded-xl p-4 flex gap-4 transition-all shadow-md group relative"
                        >
                          <div className="w-24 h-24 rounded-lg bg-slate-900 overflow-hidden shrink-0 border border-slate-800">
                            <img
                              src={getLotPrimaryImage(lot.images)}
                              alt={lot.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              loading="lazy"
                              referrerPolicy="strict-origin-when-cross-origin"
                              onError={(e) => handleLotImageError(e, getLotPrimaryImage(lot.images))}
                            />
                          </div>

                          <div className="flex-1 flex flex-col justify-between">
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-mono font-bold text-[#D4AF37] bg-slate-900 px-2 py-0.5 rounded border border-[#D4AF37]/30">
                                  {lot.reference}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleFavorite(lot.id)}
                                  className="text-rose-400 hover:text-rose-300 p-1 cursor-pointer"
                                  title="Retirer des favoris"
                                >
                                  <Heart className="w-4 h-4 fill-rose-500" />
                                </button>
                              </div>
                              <h3 className="font-serif font-bold text-sm text-slate-100 line-clamp-1 mt-1">
                                {lot.title}
                              </h3>
                              {lot.period && (
                                <p className="text-[11px] text-amber-300/80 italic font-serif">
                                  {lot.period}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80">
                              <div>
                                <span className="text-[10px] text-slate-400 block">
                                  {isUpcoming ? 'Mise à prix' : 'Enchère actuelle'}
                                </span>
                                <span className="font-mono font-bold text-sm text-amber-200">
                                  {formatEuro(lot.currentPriceCents)}
                                </span>
                              </div>

                              <button
                                onClick={() => setSelectedLotDetailId(lot.id)}
                                className="bg-[#1C2541] hover:bg-[#D4AF37] text-amber-200 hover:text-slate-950 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#D4AF37]/40 transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>{isUpcoming ? 'Découvrir' : 'Voir / Enchérir'}</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* PayPal Payment Interactive Modal (Section 28) */}
      {selectedOrderForPayment && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-[#1C2541] border border-[#D4AF37] rounded-2xl p-6 shadow-2xl text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-400" />
                <h3 className="font-serif text-lg font-bold text-amber-100">
                  Règlement de votre acquisition
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrderForPayment(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-[#0B132B] p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Commande :</span>
                  <span className="font-mono font-bold text-amber-300">
                    {selectedOrderForPayment.orderNumber}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Objet adjugé :</span>
                  <span className="font-semibold text-slate-200">
                    {selectedOrderForPayment.lot?.title}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Prix d'adjudication :</span>
                  <span className="font-mono">{formatEuro(selectedOrderForPayment.finalPriceCents)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Livraison sécurisée (Grille unique FR/BE) :</span>
                  </span>
                  <span className="font-mono text-amber-200 font-semibold">
                    {formatEuro(selectedOrderForPayment.shippingCostCents)}
                  </span>
                </div>
                <div className="border-t border-slate-700 pt-2 flex justify-between font-bold text-sm">
                  <span className="text-slate-100">Total à régler (EUR) :</span>
                  <span className="font-mono text-amber-200 text-base">
                    {formatEuro(selectedOrderForPayment.totalCents)}
                  </span>
                </div>
              </div>

              {paymentSuccess && (
                <div className="bg-emerald-950 border border-emerald-500 text-emerald-200 p-3 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{paymentSuccess}</span>
                </div>
              )}

              {paymentError && (
                <div className="bg-rose-950 border border-rose-500 text-rose-200 p-3 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              {/* Notice légale & Échéance 24h */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-200/90 leading-relaxed">
                  <span className="font-bold text-amber-300">Délai impératif de 24h : </span>
                  Votre adjudication doit être réglée sous 24 heures par PayPal ou carte bancaire. Passé ce délai, l'offre gagnante sera automatiquement réattribuée au second enchérisseur.
                </div>
              </div>

              {/* Sélection du mode de paiement PayPal Smart Buttons */}
              <div className="space-y-3 pt-1">
                <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                  <span>Choisissez votre moyen de paiement sécurisé :</span>
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Garanti par PayPal Business
                  </span>
                </div>

                {/* Bouton 1 : PayPal officiel (Jaune #FFC439) */}
                <button
                  type="button"
                  onClick={() => {
                    setActivePaymentMethod('paypal');
                    handleExecutePayPal(selectedOrderForPayment, 'PayPal');
                  }}
                  disabled={payingWithPayPal}
                  className="w-full bg-[#FFC439] hover:bg-[#F4B930] active:scale-[0.99] text-[#003087] font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 border border-amber-300"
                >
                  <div className="flex items-center gap-1.5 font-sans tracking-tight">
                    <span className="font-black italic text-base text-[#003087]">Pay</span>
                    <span className="font-black italic text-base text-[#0079C1]">Pal</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    {payingWithPayPal && activePaymentMethod === 'paypal'
                      ? 'Connexion sécurisée à PayPal...'
                      : 'Payer avec PayPal'}
                  </span>
                </button>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-slate-700"></div>
                  <span className="flex-shrink mx-3 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    ou
                  </span>
                  <div className="flex-grow border-t border-slate-700"></div>
                </div>

                {/* Bouton 2 : Carte Bancaire PayPal (Noir #2C2E2F) */}
                <button
                  type="button"
                  onClick={() => setActivePaymentMethod(activePaymentMethod === 'card' ? 'paypal' : 'card')}
                  disabled={payingWithPayPal}
                  className="w-full bg-[#2C2E2F] hover:bg-[#1f2021] text-white font-medium py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-between gap-3 cursor-pointer border border-slate-700 hover:border-slate-500"
                >
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-amber-300" />
                    <span className="text-xs font-semibold">Débit ou Carte bancaire</span>
                    <span className="text-[10px] text-slate-400 hidden sm:inline">(Sans compte PayPal)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold bg-[#0055A5] text-white px-1.5 py-0.5 rounded">CB</span>
                    <span className="text-[9px] font-bold bg-[#1A1F71] text-white px-1.5 py-0.5 rounded">VISA</span>
                    <span className="text-[9px] font-bold bg-[#EB001B] text-white px-1.5 py-0.5 rounded">MC</span>
                  </div>
                </button>

                {/* Volet formulaire de saisie sécurisée Carte Bancaire */}
                {activePaymentMethod === 'card' && (
                  <div className="bg-[#0B132B]/80 p-4 rounded-xl border border-slate-700 space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-300 pb-1 border-b border-slate-800">
                      <span className="font-semibold text-amber-200">Saisie sécurisée Carte bancaire</span>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-emerald-400" /> Cryptage SSL 256 bits
                      </span>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Nom sur la carte</label>
                      <input
                        type="text"
                        placeholder="Ex: Jean Dupont"
                        value={cardDetails.cardholder || `${user?.firstName || ''} ${user?.lastName || ''}`.trim()}
                        onChange={(e) => setCardDetails({ ...cardDetails, cardholder: e.target.value })}
                        className="w-full bg-[#1C2541] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">Numéro de carte bancaire</label>
                      <div className="relative">
                        <input
                          type="text"
                          maxLength={19}
                          placeholder="4970 •••• •••• 4242"
                          value={cardDetails.cardNumber}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
                            setCardDetails({ ...cardDetails, cardNumber: val });
                          }}
                          className="w-full bg-[#1C2541] border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                        />
                        <CreditCard className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Date d'expiration</label>
                        <input
                          type="text"
                          maxLength={5}
                          placeholder="MM/AA (ex: 12/28)"
                          value={cardDetails.expiry}
                          onChange={(e) => {
                            let val = e.target.value.replace(/\D/g, '');
                            if (val.length >= 2) val = val.slice(0, 2) + '/' + val.slice(2, 4);
                            setCardDetails({ ...cardDetails, expiry: val });
                          }}
                          className="w-full bg-[#1C2541] border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Code CVV / CVC</label>
                        <input
                          type="password"
                          maxLength={4}
                          placeholder="•••"
                          value={cardDetails.cvv}
                          onChange={(e) => setCardDetails({ ...cardDetails, cvv: e.target.value.replace(/\D/g, '') })}
                          className="w-full bg-[#1C2541] border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>

                    {/* Remplissage de démonstration rapide si souhaité */}
                    {!cardDetails.cardNumber && (
                      <button
                        type="button"
                        onClick={() =>
                          setCardDetails({
                            cardholder: `${user?.firstName || 'Jean'} ${user?.lastName || 'Dupont'}`.trim(),
                            cardNumber: '4970 8200 1234 5678',
                            expiry: '12/28',
                            cvv: '888',
                          })
                        }
                        className="text-[10px] text-amber-400 hover:text-amber-300 underline text-left block"
                      >
                        ⚡ Remplir avec une carte test sécurisée
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleExecutePayPal(selectedOrderForPayment, 'Carte Bancaire')}
                      disabled={payingWithPayPal}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-lg text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-60"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>
                        {payingWithPayPal
                          ? 'Vérification 3D-Secure en cours...'
                          : `Régler ${formatEuro(selectedOrderForPayment.totalCents)} par Carte bancaire`}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-800 text-[10px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Document de transaction sans TVA émis instantanément</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrderForPayment(null)}
                  className="px-3 py-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document View Modal */}
      {selectedDoc && (
        <TransactionDocumentModal document={selectedDoc} onClose={() => setSelectedDoc(null)} />
      )}

      {/* Lot Inspection Modal from favorites */}
      {selectedLotDetailId && (
        <LotDetailModal
          lotId={selectedLotDetailId}
          onClose={() => {
            setSelectedLotDetailId(null);
            loadData();
          }}
        />
      )}

      {/* Modal Grille Tarifaire Unique Livraison */}
      {showShippingModal && (
        <ShippingRatesModal onClose={() => setShowShippingModal(false)} />
      )}
    </div>
  );
};
