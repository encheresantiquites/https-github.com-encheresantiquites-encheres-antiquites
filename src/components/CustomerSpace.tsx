import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useFavorites } from '../context/FavoritesContext.tsx';
import { Order, TransactionDoc, User, Lot } from '../types/index.ts';
import { TransactionDocumentModal } from './TransactionDocumentModal.tsx';
import { LotDetailModal } from './LotDetailModal.tsx';
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
} from 'lucide-react';

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
  const [allLots, setAllLots] = useState<Lot[]>([]);
  const [selectedLotDetailId, setSelectedLotDetailId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal payment
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<Order | null>(null);
  const [payingWithPayPal, setPayingWithPayPal] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Document modal
  const [selectedDoc, setSelectedDoc] = useState<TransactionDoc | null>(null);

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
  }, [token]);

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

  // Traitement du paiement PayPal
  const handleExecutePayPal = async (order: Order) => {
    if (!token) return;
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
      if (!createRes.ok) throw new Error(createData.error || 'Erreur création PayPal.');

      const paypalOrderId = createData.id;

      // 2. Simuler ou déclencher la capture sécurisée côté serveur
      const captureRes = await fetch(`/api/orders/${order.id}/paypal/capture`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paypalOrderId }),
      });

      const captureData = await captureRes.json();
      if (!captureRes.ok) throw new Error(captureData.error || 'Erreur capture PayPal.');

      setPaymentSuccess(
        `Paiement validé avec succès ! Reçu officiel n° ${captureData.documentNumber} émis.`
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
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'documents'
                ? 'bg-[#D4AF37] text-slate-950 shadow-lg'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Documents de vente ({documents.length})</span>
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
              <h2 className="text-lg font-serif font-bold text-amber-200">
                Vue d'ensemble de votre activité
              </h2>

              {/* Alert if won items await payment */}
              {wonOrdersPendingPayment.length > 0 && (
                <div className="bg-amber-950/50 border border-amber-500/60 rounded-xl p-4 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="font-bold block text-sm">
                      {wonOrdersPendingPayment.length} objet(s) remporté(s) en attente de règlement !
                    </span>
                    <span className="text-slate-300">
                      Veuillez finaliser votre règlement sous 48h via PayPal afin de valider l'acquisition.
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveTab('won')}
                    className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors"
                  >
                    Régler maintenant
                  </button>
                </div>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#0B132B] p-4 rounded-xl border border-slate-800">
                  <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">
                    Mes enchères actives
                  </span>
                  <div className="space-y-2">
                    {activeBids.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-3">
                        Vous ne participez à aucune enchère active actuellement.
                      </p>
                    ) : (
                      activeBids.slice(0, 3).map((b) => (
                        <div
                          key={b.bidId}
                          className="flex items-center justify-between text-xs p-2 rounded bg-slate-900/60 border border-slate-800"
                        >
                          <div>
                            <span className="font-mono text-amber-400">{b.lotReference}</span>
                            <span className="text-slate-200 block truncate max-w-[200px]">
                              {b.lotTitle}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-amber-200 block">
                              {formatEuro(b.currentPriceCents)}
                            </span>
                            <span
                              className={`text-[10px] font-semibold ${
                                b.isWinning ? 'text-emerald-400' : 'text-amber-400'
                              }`}
                            >
                              {b.isWinning ? 'Meilleur enchérisseur' : 'Surenchéri'}
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

                      <div className="text-right">
                        <span className="text-[10px] uppercase text-slate-400 block">Prix actuel</span>
                        <div className="text-xl font-bold font-serif text-[#D4AF37]">
                          {formatEuro(bid.currentPriceCents)}
                        </div>
                        <span className="text-xs text-slate-400 font-mono">
                          Votre max : {formatEuro(bid.myMaxBidCents)}
                        </span>
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

          {/* TAB 5: TRANSACTION DOCUMENTS (Master Prompt Section 31 & 88) */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-serif font-bold text-amber-200">
                    Documents légaux de transaction
                  </h2>
                  <p className="text-xs text-slate-400">
                    Confirmations de vente et reçus délivrés par le vendeur particulier (sans TVA).
                  </p>
                </div>
              </div>

              {documents.length === 0 ? (
                <div className="bg-[#0B132B] p-8 rounded-xl border border-slate-800 text-center">
                  <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">
                    Aucun document émis pour le moment. Les reçus sont générés automatiquement après paiement confirmé.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="bg-[#0B132B] border border-slate-800 hover:border-amber-500/40 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-amber-400" />
                        <div>
                          <span className="font-mono text-xs font-bold text-amber-300">
                            {doc.documentNumber}
                          </span>
                          <h4 className="text-xs font-semibold text-slate-200">
                            Confirmation de transaction — {doc.lotTitle}
                          </h4>
                          <span className="text-[11px] text-slate-400">
                            Émis le {new Date(doc.createdAt).toLocaleDateString('fr-FR')} • Vendeur particulier
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="font-mono text-sm font-bold text-slate-100">
                          {formatEuro(doc.totalCents)}
                        </span>
                        <button
                          onClick={() => setSelectedDoc(doc)}
                          className="flex items-center gap-1.5 bg-slate-800 hover:bg-[#D4AF37] text-slate-200 hover:text-slate-950 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Afficher le document</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                              src={
                                lot.images && lot.images[0]
                                  ? lot.images[0]
                                  : 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=400&q=80'
                              }
                              alt={lot.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
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
                <div className="flex justify-between">
                  <span className="text-slate-400">Frais d'emballage & transport :</span>
                  <span className="font-mono">
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

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Paiement direct sécurisé au vendeur particulier via PayPal Business. La transaction sera vérifiée côté serveur avant confirmation finale.
              </p>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedOrderForPayment(null)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => handleExecutePayPal(selectedOrderForPayment)}
                  disabled={payingWithPayPal}
                  className="bg-[#0070BA] hover:bg-[#005ea6] text-white font-bold px-6 py-2.5 rounded-lg text-xs shadow-lg flex items-center gap-2 transition-all cursor-pointer"
                >
                  {payingWithPayPal ? (
                    <span>Traitement sécurisé...</span>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      <span>Confirmer le paiement avec PayPal</span>
                    </>
                  )}
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
    </div>
  );
};
