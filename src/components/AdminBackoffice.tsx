import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { Sale, Lot, User, AcquisitionItem } from '../types/index.ts';
import { getLotPrimaryImage, handleLotImageError } from '../lib/image-utils.ts';
import {
  KeyRound,
  LayoutDashboard,
  Gavel,
  Users,
  Coins,
  Truck,
  FileSpreadsheet,
  Settings,
  Plus,
  Check,
  X,
  AlertCircle,
  Clock,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  Package,
  Search,
  RefreshCw,
  Eye,
  MessageSquare,
  Send,
  Tag,
  Filter,
} from 'lucide-react';

interface AdminBackofficeProps {
  onBack?: () => void;
}

export const AdminBackoffice: React.FC<AdminBackofficeProps> = ({ onBack }) => {
  const { token } = useAuth();
  const [adminTab, setAdminTab] = useState<
    'dashboard' | 'sales' | 'clients' | 'messages' | 'acquisitions' | 'shipments' | 'audit' | 'settings'
  >('dashboard');

  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [clients, setClients] = useState<User[]>([]);
  const [salesList, setSalesList] = useState<Sale[]>([]);
  const [lotsList, setLotsList] = useState<any[]>([]);
  const [acquisitions, setAcquisitions] = useState<AcquisitionItem[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [chatMessagesList, setChatMessagesList] = useState<any[]>([]);
  const [replyTextMap, setReplyTextMap] = useState<Record<number, string>>({});
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [selectedLotFilter, setSelectedLotFilter] = useState<string>('ALL');
  const [unreadOnlyFilter, setUnreadOnlyFilter] = useState<boolean>(false);
  const [previewLot, setPreviewLot] = useState<Lot | null>(null);

  // Filter & Search
  const [clientSearch, setClientSearch] = useState('');
  const [clientFilterStatus, setClientFilterStatus] = useState<string>('ALL');

  // Modals
  const [newLotModalOpen, setNewLotModalOpen] = useState(false);
  const [newSaleModalOpen, setNewSaleModalOpen] = useState(false);
  const [acquisitionModalItem, setAcquisitionModalItem] = useState<AcquisitionItem | null>(null);
  const [shipmentModalItem, setShipmentModalItem] = useState<any | null>(null);

  // Forms
  const [newLotForm, setNewLotForm] = useState({
    saleId: 1,
    reference: `LOT-2026-${String(Math.floor(Math.random() * 9000 + 1000))}`,
    title: '',
    description: '',
    category: 'Objet de collection',
    period: 'XIXe siècle',
    dimensions: '',
    weight: '',
    conditionReport: 'Très bel état d\'origine.',
    flaws: 'Traces d\'usage minimes.',
    observations: 'Collection familiale.',
    startingPriceCents: 20000,
    reservePriceCents: 30000,
    targetAcquisitionCostCents: 15000,
    endsAt: (() => {
      const d = new Date();
      const day = d.getDay();
      const diff = day === 0 ? 0 : 7 - day;
      const sun = new Date(d);
      sun.setDate(d.getDate() + diff);
      sun.setHours(22, 0, 0, 0);
      return sun.toISOString();
    })(),
    images: ['https://images.unsplash.com/photo-1615529328331-f8917597711f?auto=format&fit=crop&w=800&q=80'],
  });

  const [acquisitionUpdateForm, setAcquisitionUpdateForm] = useState({
    actualAcquisitionCostCents: 0,
    acquisitionStatus: 'PURCHASED',
    acquisitionSource: 'Succession familiale',
    acquisitionNotes: '',
  });

  const [shipmentUpdateForm, setShipmentUpdateForm] = useState({
    shippingCarrier: 'Colissimo Recommandé R5',
    trackingNumber: '',
    status: 'SHIPPED',
  });

  const formatEuro = (cents: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const loadAdminData = async () => {
    if (!token) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}` };

    try {
      // 1. Dashboard metrics
      const dashRes = await fetch('/api/admin/dashboard', { headers });
      if (dashRes.ok) setMetrics(await dashRes.json());

      // 2. Clients
      const clientsRes = await fetch('/api/admin/clients', { headers });
      if (clientsRes.ok) {
        const d = await clientsRes.json();
        setClients(d.clients || []);
      }

      // 3. Sales & Lots
      const salesRes = await fetch('/api/admin/sales', { headers });
      if (salesRes.ok) {
        const d = await salesRes.json();
        setSalesList(d.sales || []);
      }

      const lotsRes = await fetch('/api/admin/lots', { headers });
      if (lotsRes.ok) {
        const d = await lotsRes.json();
        setLotsList(d.lots || []);
      }

      // 4. Acquisitions ("Objets à acquérir")
      const acqRes = await fetch('/api/admin/acquisitions', { headers });
      if (acqRes.ok) {
        const d = await acqRes.json();
        setAcquisitions(d.acquisitions || []);
      }

      // 5. Shipments ("À expédier")
      const shipRes = await fetch('/api/admin/shipments', { headers });
      if (shipRes.ok) {
        const d = await shipRes.json();
        setShipments(d.shipments || []);
      }

      // 6. Audit logs
      const auditRes = await fetch('/api/admin/audit-logs', { headers });
      if (auditRes.ok) {
        const d = await auditRes.json();
        setAuditLogs(d.logs || []);
      }

      // 7. Settings
      const settingsRes = await fetch('/api/admin/settings', { headers });
      if (settingsRes.ok) {
        const d = await settingsRes.json();
        const map: Record<string, string> = {};
        d.settings?.forEach((s: any) => {
          map[s.key] = s.value;
        });
        setSettings(map);
      }

      // 8. Chat messages
      const chatRes = await fetch('/api/chat/messages', { headers });
      if (chatRes.ok) {
        const d = await chatRes.json();
        setChatMessagesList(d.messages || []);
      }
    } catch (err) {
      console.error('Erreur chargement données administration:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [token]);

  // Répondre à un message de chat en direct
  const handleSendAdminReply = async (originalMsg: any) => {
    const text = (replyTextMap[originalMsg.id] || '').trim();
    if (!text || !token) return;

    try {
      setReplyingId(originalMsg.id);
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          senderName: 'Monsieur De Coster',
          targetUserId: originalMsg.userId || null,
          senderEmail: originalMsg.senderEmail || null,
          lotId: originalMsg.lotId || null,
          lotReference: originalMsg.lotReference || null,
          lotTitle: originalMsg.lotTitle || null,
        }),
      });

      if (res.ok) {
        // Marquer comme lu
        await fetch(`/api/chat/messages/${originalMsg.id}/read`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
        });

        setReplyTextMap((prev) => ({ ...prev, [originalMsg.id]: '' }));
        await loadAdminData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setReplyingId(null);
    }
  };

  // Client status action
  const handleClientStatusChange = async (userId: number, status: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/clients/${userId}/status`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await loadAdminData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Create lot
  const handleCreateLot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const res = await fetch('/api/admin/lots', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newLotForm),
      });
      if (res.ok) {
        setNewLotModalOpen(false);
        await loadAdminData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Update Acquisition
  const handleUpdateAcquisition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !acquisitionModalItem) return;
    try {
      const res = await fetch(`/api/admin/acquisitions/${acquisitionModalItem.lotId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(acquisitionUpdateForm),
      });
      if (res.ok) {
        setAcquisitionModalItem(null);
        await loadAdminData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Update Shipment
  const handleUpdateShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !shipmentModalItem) return;
    try {
      const res = await fetch(`/api/admin/orders/${shipmentModalItem.order.id}/shipment`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(shipmentUpdateForm),
      });
      if (res.ok) {
        setShipmentModalItem(null);
        await loadAdminData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Filtered clients
  const filteredClients = clients.filter((c) => {
    const matchesSearch =
      (c.firstName || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.lastName || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.companyName || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(clientSearch.toLowerCase());

    const matchesStatus = clientFilterStatus === 'ALL' || c.status === clientFilterStatus;
    return matchesSearch && matchesStatus;
  });

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

      {/* Admin Top Header */}
      <div className="bg-[#1C2541] border border-amber-500/40 rounded-2xl p-6 mb-8 shadow-2xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-amber-950 text-amber-300 border border-amber-600/50 text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Panneau de Contrôle Vendeur Particulier
            </span>
            <span className="text-slate-400 text-xs">•</span>
            <span className="text-slate-300 text-xs">Monsieur De Coster</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-amber-100 mt-1">
            Gestion Administrative des Enchères
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Suivi des validations d'antiquaires, moteur d'enchères, trésorerie et expéditions sécurisées.
          </p>
        </div>

        <button
          onClick={loadAdminData}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-amber-200 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-700 transition-colors shadow"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Actualiser</span>
        </button>
      </div>

      {/* Admin Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-4 mb-6">
        <button
          onClick={() => setAdminTab('dashboard')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'dashboard'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Tableau de bord</span>
        </button>

        <button
          onClick={() => setAdminTab('clients')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'clients'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Clients Professionnels ({clients.length})</span>
          {metrics?.pendingClientsCount > 0 && (
            <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono animate-pulse">
              {metrics.pendingClientsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setAdminTab('messages')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'messages'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Chat & Questions ({chatMessagesList.length})</span>
          {chatMessagesList.filter((m) => !m.isRead && m.senderType === 'BUYER').length > 0 && (
            <span className="bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold animate-pulse">
              {chatMessagesList.filter((m) => !m.isRead && m.senderType === 'BUYER').length}
            </span>
          )}
        </button>

        <button
          onClick={() => setAdminTab('sales')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'sales'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Gavel className="w-4 h-4" />
          <span>Ventes & Lots ({lotsList.length})</span>
        </button>

        <button
          onClick={() => setAdminTab('acquisitions')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'acquisitions'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Trésorerie & Objets à acquérir</span>
          {metrics?.acquisitionsMetrics?.toAcquireCount > 0 && (
            <span className="bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
              {metrics.acquisitionsMetrics.toAcquireCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setAdminTab('shipments')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'shipments'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Expéditions ({shipments.length})</span>
        </button>

        <button
          onClick={() => setAdminTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'audit'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Journal d'Audit</span>
        </button>

        <button
          onClick={() => setAdminTab('settings')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'settings'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Configuration Vendeur</span>
        </button>
      </div>

      {/* TAB CONTENT */}

      {/* 1. DASHBOARD */}
      {adminTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Key Metric Blocks (Master Prompt Section 41) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#1C2541] border border-slate-800 rounded-xl p-5 shadow">
              <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">
                Vente Hebdomadaire Active
              </span>
              <div className="text-2xl font-bold font-serif text-[#D4AF37]">
                {metrics?.currentSale?.reference || 'Aucune'}
              </div>
              <div className="text-xs text-slate-300 mt-2 space-y-0.5">
                <div>Lots au catalogue : {metrics?.currentSale?.totalLots || 0}</div>
                <div>Avec offres : {metrics?.currentSale?.lotsWithBids || 0}</div>
                <div>Sans offre : {metrics?.currentSale?.lotsWithoutBids || 0}</div>
              </div>
            </div>

            <div className="bg-[#1C2541] border border-slate-800 rounded-xl p-5 shadow">
              <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">
                Valeur des Enchères en Cours
              </span>
              <div className="text-2xl font-bold font-mono text-emerald-300">
                {formatEuro(metrics?.currentSale?.currentAuctionValueCents || 0)}
              </div>
              <div className="text-xs text-slate-400 mt-2">
                Cumul des meilleures offres actuelles sur la session
              </div>
            </div>

            <div className="bg-[#1C2541] border border-slate-800 rounded-xl p-5 shadow">
              <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">
                Paiements & Encaissements
              </span>
              <div className="text-2xl font-bold font-mono text-amber-200">
                {formatEuro(metrics?.ordersMetrics?.totalPaidCents || 0)}
              </div>
              <div className="text-xs text-slate-400 mt-2">
                En attente : {formatEuro(metrics?.ordersMetrics?.totalAwaitingCents || 0)} (
                {metrics?.ordersMetrics?.awaitingPaymentCount || 0} impayés)
              </div>
            </div>

            <div className="bg-[#1C2541] border border-slate-800 rounded-xl p-5 shadow">
              <span className="text-xs uppercase font-semibold text-slate-400 block mb-1">
                Chaîne d'Acquisition
              </span>
              <div className="text-2xl font-bold font-mono text-blue-300">
                {metrics?.acquisitionsMetrics?.toAcquireCount || 0} à traiter
              </div>
              <div className="text-xs text-slate-400 mt-2">
                Achetés : {metrics?.acquisitionsMetrics?.purchasedCount || 0} • Prêts :{' '}
                {metrics?.ordersMetrics?.shippedCount || 0} expédiés
              </div>
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif font-bold text-amber-200 text-sm">
                  Inscriptions Pro en attente d'approbation
                </h3>
                <span className="text-xs bg-amber-950 text-amber-300 px-2 py-0.5 rounded border border-amber-600/40">
                  {metrics?.pendingClientsCount || 0} en attente
                </span>
              </div>
              <div className="space-y-2">
                {clients.filter((c) => c.status === 'PENDING').length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2">
                    Aucune demande d'inscription en attente.
                  </p>
                ) : (
                  clients
                    .filter((c) => c.status === 'PENDING')
                    .map((c) => (
                      <div
                        key={c.id}
                        className="bg-[#0B132B] p-3 rounded-lg border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-200">
                            {c.companyName || `${c.firstName} ${c.lastName}`}
                          </span>
                          <span className="text-slate-400 block">
                            {c.activity || 'Activité non spécifiée'} • {c.country}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleClientStatusChange(c.id, 'APPROVED')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1 rounded text-[11px]"
                          >
                            Valider
                          </button>
                          <button
                            onClick={() => handleClientStatusChange(c.id, 'REJECTED')}
                            className="bg-rose-900/60 hover:bg-rose-800 text-rose-200 px-2 py-1 rounded text-[11px]"
                          >
                            Refuser
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif font-bold text-amber-200 text-sm">
                  Objets vendus et payés à acquérir / préparer
                </h3>
                <button
                  onClick={() => setAdminTab('acquisitions')}
                  className="text-xs text-amber-400 hover:underline"
                >
                  Voir tout
                </button>
              </div>
              <div className="space-y-2">
                {acquisitions.slice(0, 3).map((item) => (
                  <div
                    key={item.lotId}
                    className="bg-[#0B132B] p-3 rounded-lg border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-amber-400">
                        {item.lotReference}
                      </span>
                      <span className="text-slate-200 block truncate max-w-[220px]">
                        {item.lotTitle}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Acheteur : {item.buyerCompany || item.buyerName}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-100 block">
                        {formatEuro(item.salePriceCents)}
                      </span>
                      <span className="text-[10px] text-emerald-400 font-semibold">
                        Marge : +{formatEuro(item.actualMarginCents)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. CLIENTS (Master Prompt Section 42) */}
      {adminTab === 'clients' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-[#1C2541]/70 p-4 rounded-xl border border-slate-800">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher par nom, enseigne, email ou pays..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="w-full bg-[#0B132B] border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Filtrer par statut :</span>
              <select
                value={clientFilterStatus}
                onChange={(e) => setClientFilterStatus(e.target.value)}
                className="bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="PENDING">En attente (PENDING)</option>
                <option value="APPROVED">Validé (APPROVED)</option>
                <option value="SUSPENDED">Suspendu (SUSPENDED)</option>
                <option value="BLOCKED">Bloqué (BLOCKED)</option>
              </select>
            </div>
          </div>

          {/* Clients Table */}
          <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Professionnel / Société</th>
                    <th className="p-3">Activité & Pays</th>
                    <th className="p-3">Contact & TVA</th>
                    <th className="p-3">Statut Enchères</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {filteredClients.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/40">
                      <td className="p-3">
                        <div className="font-bold text-slate-100">
                          {c.companyName || `${c.firstName || ''} ${c.lastName || ''}`}
                        </div>
                        <div className="text-[11px] text-slate-400">{c.email}</div>
                      </td>
                      <td className="p-3">
                        <div>{c.activity || 'Antiquaire / Brocanteur'}</div>
                        <div className="text-slate-400">{c.country || 'France'}</div>
                      </td>
                      <td className="p-3 font-mono text-[11px]">
                        <div>{c.phone || 'Non renseigné'}</div>
                        <div className="text-amber-300/80">{c.vatNumber || 'TVA non spécifiée'}</div>
                      </td>
                      <td className="p-3">
                        {c.status === 'APPROVED' ? (
                          <span className="bg-emerald-950 text-emerald-300 border border-emerald-600/50 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            VALIDÉ
                          </span>
                        ) : c.status === 'PENDING' ? (
                          <span className="bg-amber-950 text-amber-300 border border-amber-600/50 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            EN ATTENTE
                          </span>
                        ) : (
                          <span className="bg-rose-950 text-rose-300 border border-rose-600/50 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            {c.status}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right space-x-1.5">
                        {c.status !== 'APPROVED' && (
                          <button
                            onClick={() => handleClientStatusChange(c.id, 'APPROVED')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded text-[11px] transition-colors"
                          >
                            Valider
                          </button>
                        )}
                        {c.status !== 'SUSPENDED' && (
                          <button
                            onClick={() => handleClientStatusChange(c.id, 'SUSPENDED')}
                            className="bg-amber-800 hover:bg-amber-700 text-amber-100 px-2 py-1 rounded text-[11px] transition-colors"
                          >
                            Suspendre
                          </button>
                        )}
                        {c.status !== 'BLOCKED' && (
                          <button
                            onClick={() => handleClientStatusChange(c.id, 'BLOCKED')}
                            className="bg-rose-900 hover:bg-rose-800 text-rose-200 px-2 py-1 rounded text-[11px] transition-colors"
                          >
                            Bloquer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MESSAGES & CHAT SERVICE (Lun-Ven 9h-17h) */}
      {adminTab === 'messages' && (() => {
        const uniqueLotRefs = Array.from(
          new Set(chatMessagesList.map((m) => m.lotReference).filter(Boolean))
        ) as string[];

        const unreadCount = chatMessagesList.filter(
          (m) => !m.isRead && m.senderType === 'BUYER'
        ).length;
        const withLotCount = chatMessagesList.filter((m) => !!m.lotReference).length;

        const filteredChatMessages = chatMessagesList.filter((msg) => {
          if (unreadOnlyFilter && (msg.isRead || msg.senderType === 'ADMIN')) return false;
          if (selectedLotFilter === 'ALL') return true;
          if (selectedLotFilter === 'NONE') return !msg.lotReference;
          return msg.lotReference === selectedLotFilter;
        });

        return (
          <div className="space-y-6">
            {/* Header & Stats Banner */}
            <div className="bg-[#1C2541] border border-amber-500/30 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-700/60 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                    Service Direct 9h–17h
                  </span>
                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-xs text-amber-200">Du lundi au vendredi</span>
                </div>
                <h2 className="text-xl font-serif font-bold text-amber-100 mt-1">
                  Questions des Antiquaires & Brocanteurs
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Répondez en direct aux demandes de précisions sur l'état, les dimensions, poinçons ou enlèvements.
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  onClick={loadAdminData}
                  className="bg-slate-800 hover:bg-slate-700 text-amber-200 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Actualiser</span>
                </button>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-[#1C2541]/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                <span className="text-xs text-slate-300">Total échanges :</span>
                <span className="font-bold font-mono text-base text-slate-100">
                  {chatMessagesList.length}
                </span>
              </div>
              <div className="bg-[#1C2541]/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                <span className="text-xs text-amber-300">Questions ciblées sur un lot :</span>
                <span className="font-bold font-mono text-base text-[#D4AF37]">
                  {withLotCount}
                </span>
              </div>
              <div className="bg-[#1C2541]/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                <span className="text-xs text-rose-300">Messages non lus :</span>
                <span
                  className={`font-bold font-mono text-base ${
                    unreadCount > 0 ? 'text-rose-400 font-extrabold animate-pulse' : 'text-slate-400'
                  }`}
                >
                  {unreadCount}
                </span>
              </div>
            </div>

            {/* Filter by Lot Toolbar */}
            <div className="bg-[#0B132B] border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                  <Filter className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Filtrer par lot :</span>
                </div>
                <select
                  value={selectedLotFilter}
                  onChange={(e) => setSelectedLotFilter(e.target.value)}
                  className="bg-[#1C2541] border border-slate-700 text-amber-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#D4AF37] cursor-pointer"
                >
                  <option value="ALL">Tous les lots ({chatMessagesList.length})</option>
                  <option value="NONE">
                    Questions générales sans lot ({chatMessagesList.filter((m) => !m.lotReference).length})
                  </option>
                  {uniqueLotRefs.map((ref) => {
                    const count = chatMessagesList.filter((m) => m.lotReference === ref).length;
                    const sample = chatMessagesList.find((m) => m.lotReference === ref);
                    return (
                      <option key={ref} value={ref}>
                        {ref} {sample?.lotTitle ? `- ${sample.lotTitle}` : ''} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={unreadOnlyFilter}
                    onChange={(e) => setUnreadOnlyFilter(e.target.checked)}
                    className="rounded border-slate-700 text-[#D4AF37] focus:ring-[#D4AF37]"
                  />
                  <span>Non lus uniquement ({unreadCount})</span>
                </label>
              </div>
            </div>

            {/* Message List */}
            {filteredChatMessages.length === 0 ? (
              <div className="bg-[#1C2541]/70 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                <MessageSquare className="w-12 h-12 text-[#D4AF37]/40 mx-auto mb-3" />
                <p className="font-serif font-bold text-base text-slate-200">
                  Aucun message correspondant au filtre
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  {selectedLotFilter !== 'ALL' || unreadOnlyFilter
                    ? 'Aucun message ne correspond à vos critères actuels. Essayez de réinitialiser le filtre.'
                    : 'Les questions posées par les acheteurs professionnels via la bulle de chat en direct apparaîtront automatiquement ici.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredChatMessages.map((msg) => {
                  const isBuyer = msg.senderType === 'BUYER';
                  const matchedLot = lotsList.find(
                    (item) => item.lot?.id === msg.lotId || item.lot?.reference === msg.lotReference
                  )?.lot;

                  return (
                    <div
                      key={msg.id}
                      className={`bg-[#1C2541]/90 border rounded-2xl p-5 shadow-md transition-all ${
                        !msg.isRead && isBuyer
                          ? 'border-[#D4AF37] bg-gradient-to-r from-[#1C2541] to-[#253256]'
                          : 'border-slate-800'
                      }`}
                    >
                      {/* En-tête de message & identification acheteur */}
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-3 pb-3 border-b border-slate-800/80">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-100 text-sm">{msg.senderName}</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                                isBuyer
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              }`}
                            >
                              {isBuyer ? 'Acheteur Pro' : 'Monsieur De Coster'}
                            </span>
                            {!msg.isRead && isBuyer && (
                              <span className="bg-rose-600 text-white text-[9px] px-2 py-0.5 rounded-full font-bold animate-pulse">
                                NOUVEAU
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                            {msg.senderEmail && (
                              <a
                                href={`mailto:${msg.senderEmail}`}
                                className="text-amber-300/80 hover:underline"
                              >
                                {msg.senderEmail}
                              </a>
                            )}
                            {msg.senderPhone && <span>• Tél : {msg.senderPhone}</span>}
                            <span>• {new Date(msg.createdAt).toLocaleString('fr-FR')}</span>
                          </div>
                        </div>
                      </div>

                      {/* ENCART D'IDENTIFICATION DU LOT ASSOCIE */}
                      {msg.lotReference ? (
                        <div className="bg-[#0B132B] border border-[#D4AF37]/50 rounded-xl p-3 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-inner">
                          <div className="flex items-center gap-3 min-w-0">
                            {matchedLot ? (
                              <img
                                src={getLotPrimaryImage(matchedLot.images)}
                                alt={msg.lotTitle || msg.lotReference}
                                className="w-12 h-12 rounded-lg object-cover border border-[#D4AF37]/40 flex-shrink-0"
                                referrerPolicy="strict-origin-when-cross-origin"
                                onError={(e) => handleLotImageError(e, getLotPrimaryImage(matchedLot.images))}
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-[#1C2541] border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                                <Tag className="w-5 h-5 text-[#D4AF37]" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="bg-[#D4AF37] text-slate-950 px-2 py-0.5 rounded font-mono font-bold text-xs">
                                  {msg.lotReference}
                                </span>
                                {matchedLot?.period && (
                                  <span className="text-[11px] text-amber-300 font-serif italic">
                                    {matchedLot.period}
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-100 font-semibold text-xs truncate mt-0.5">
                                {msg.lotTitle || matchedLot?.title || 'Objet du catalogue'}
                              </p>
                              {matchedLot && (
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  Mise à prix : {formatEuro(matchedLot.startingPriceCents)}
                                  {matchedLot.currentPriceCents > matchedLot.startingPriceCents && (
                                    <span className="text-amber-300 font-semibold ml-2">
                                      • Enchère : {formatEuro(matchedLot.currentPriceCents)}
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>

                          {matchedLot && (
                            <button
                              type="button"
                              onClick={() => setPreviewLot(matchedLot)}
                              className="bg-[#1C2541] hover:bg-[#253256] text-[#D4AF37] border border-[#D4AF37]/40 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm flex-shrink-0 cursor-pointer"
                              title="Consulter les dimensions, photos et rapport d'état complet"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Consulter la fiche du lot</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="bg-[#0B132B]/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-400 flex items-center gap-2 mb-4">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                          <span>Demande générale (aucun lot spécifique associé)</span>
                        </div>
                      )}

                      {/* Contenu du message */}
                      <div className="bg-[#0B132B]/80 rounded-xl p-4 text-sm text-slate-200 border border-slate-800 mb-4 whitespace-pre-wrap leading-relaxed">
                        {msg.message}
                      </div>

                      {/* Zone de réponse directe de Jean-Marc */}
                      {isBuyer && (
                        <div className="bg-[#0E1626] rounded-xl p-4 border border-slate-800 space-y-3">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span className="font-semibold text-amber-200">
                              Répondre à {msg.senderName}
                              {msg.lotReference && (
                                <span className="text-[#D4AF37] font-mono ml-1.5">
                                  au sujet du {msg.lotReference}
                                </span>
                              )} :
                            </span>
                            {!msg.isRead && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await fetch(`/api/chat/messages/${msg.id}/read`, {
                                    method: 'PATCH',
                                    headers: { Authorization: `Bearer ${token}` },
                                  });
                                  await loadAdminData();
                                }}
                                className="text-[11px] text-slate-400 hover:text-amber-300 transition-colors"
                              >
                                Marquer comme lu
                              </button>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <textarea
                              rows={2}
                              placeholder="Tapez votre réponse... Elle apparaîtra instantanément dans le chat de l'acheteur."
                              value={replyTextMap[msg.id] || ''}
                              onChange={(e) =>
                                setReplyTextMap((prev) => ({ ...prev, [msg.id]: e.target.value }))
                              }
                              className="flex-1 bg-[#1C2541] border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#D4AF37] resize-none"
                            />
                            <button
                              type="button"
                              disabled={!replyTextMap[msg.id]?.trim() || replyingId === msg.id}
                              onClick={() => handleSendAdminReply(msg)}
                              className={`px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                replyTextMap[msg.id]?.trim() && replyingId !== msg.id
                                  ? 'bg-[#D4AF37] text-slate-950 hover:bg-[#E5C158] shadow'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Envoyer</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* 3. SALES & LOTS (Master Prompt Section 43, 44, 45, 85) */}
      {adminTab === 'sales' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-serif font-bold text-amber-200">
              Catalogue des Ventes Hebdomadaires & Objets
            </h2>
            <button
              onClick={() => setNewLotModalOpen(true)}
              className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow"
            >
              <Plus className="w-4 h-4" />
              <span>Créer un nouveau lot</span>
            </button>
          </div>

          {/* Lots table with secret reserve prices and acquisition cost */}
          <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl overflow-hidden shadow">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Réf. Lot</th>
                    <th className="p-3">Titre & Catégorie</th>
                    <th className="p-3 text-right">Mise à prix</th>
                    <th className="p-3 text-right">Prix Réserve (Secret)</th>
                    <th className="p-3 text-right">Enchère Actuelle</th>
                    <th className="p-3 text-right">Coût estimé</th>
                    <th className="p-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {lotsList.map((item) => {
                    const l = item.lot;
                    return (
                      <tr key={l.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold text-amber-400">
                          {l.reference}
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-slate-100">{l.title}</div>
                          {l.period && (
                            <div className="text-[11px] text-amber-300/80 italic font-serif">
                              {l.period}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono">
                          {formatEuro(l.startingPriceCents)}
                        </td>
                        <td className="p-3 text-right font-mono text-amber-300 font-semibold">
                          {l.reservePriceCents > 0 ? formatEuro(l.reservePriceCents) : 'Aucun'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-[#D4AF37]">
                          {formatEuro(l.currentPriceCents)} ({l.bidCount} offres)
                        </td>
                        <td className="p-3 text-right font-mono text-slate-400">
                          {formatEuro(l.targetAcquisitionCostCents || 0)}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              l.status === 'ACTIVE'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/40'
                                : l.status === 'SOLD'
                                ? 'bg-blue-950 text-blue-300 border border-blue-600/40'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {l.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. ACQUISITIONS & TRÉSORERIE (Master Prompt Section 34, 76, 82) */}
      {adminTab === 'acquisitions' && (
        <div className="space-y-6">
          <div>
            <span className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold">
              MODULE CRITIQUE DE TRÉSORERIE
            </span>
            <h2 className="text-lg font-serif font-bold text-amber-200 mt-0.5">
              Objets à acquérir & Marges réelles
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Affichage exclusif au vendeur particulier des objets vendus, payés, pour suivre l'argent nécessaire à leur acquisition et la rentabilité nette.
            </p>
          </div>

          {/* Treasury Summary Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-[#0B132B] p-4 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 block">Total Ventes Adjugées</span>
              <div className="text-xl font-bold font-mono text-amber-200">
                {formatEuro(
                  acquisitions.reduce((acc, a) => acc + (a.salePriceCents || 0), 0)
                )}
              </div>
            </div>
            <div className="bg-[#0B132B] p-4 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 block">Coûts d'acquisition réels</span>
              <div className="text-xl font-bold font-mono text-rose-300">
                {formatEuro(
                  acquisitions.reduce((acc, a) => acc + (a.actualCostCents || 0), 0)
                )}
              </div>
            </div>
            <div className="bg-[#0B132B] p-4 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 block">Marge Nette Dégagée</span>
              <div className="text-xl font-bold font-mono text-emerald-400">
                {formatEuro(
                  acquisitions.reduce((acc, a) => acc + (a.actualMarginCents || 0), 0)
                )}
              </div>
            </div>
            <div className="bg-[#0B132B] p-4 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 block">Objets à Acquérir</span>
              <div className="text-xl font-bold font-mono text-amber-400">
                {acquisitions.filter((a) => a.acquisitionStatus === 'PENDING').length} en attente
              </div>
            </div>
          </div>

          {/* Acquisitions Table */}
          <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl overflow-hidden shadow">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Réf. Lot</th>
                    <th className="p-3">Objet</th>
                    <th className="p-3">Acheteur Professionnel</th>
                    <th className="p-3 text-right">Prix de vente</th>
                    <th className="p-3 text-right">Coût prévu</th>
                    <th className="p-3 text-right">Coût réel</th>
                    <th className="p-3 text-right">Marge réelle</th>
                    <th className="p-3">Statut acquisition</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {acquisitions.map((item) => (
                    <tr key={item.lotId} className="hover:bg-slate-800/40">
                      <td className="p-3 font-mono font-bold text-amber-400">
                        {item.lotReference}
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-100">{item.lotTitle}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Commande : {item.orderNumber}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-slate-200">
                          {item.buyerCompany || item.buyerName}
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-100">
                        {formatEuro(item.salePriceCents)}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-400">
                        {formatEuro(item.targetCostCents)}
                      </td>
                      <td className="p-3 text-right font-mono text-amber-200 font-semibold">
                        {item.actualCostCents > 0 ? formatEuro(item.actualCostCents) : '—'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-400">
                        +{formatEuro(item.actualMarginCents)}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.acquisitionStatus === 'PURCHASED'
                              ? 'bg-blue-950 text-blue-300 border border-blue-600/40'
                              : item.acquisitionStatus === 'RECEIVED'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/40'
                              : 'bg-amber-950 text-amber-300 border border-amber-600/40'
                          }`}
                        >
                          {item.acquisitionStatus === 'PENDING'
                            ? 'À ACQUÉRIR'
                            : item.acquisitionStatus === 'PURCHASED'
                            ? 'ACHETÉ'
                            : 'RÉCEPTIONNÉ'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            setAcquisitionModalItem(item);
                            setAcquisitionUpdateForm({
                              actualAcquisitionCostCents: item.actualCostCents || item.targetCostCents || 0,
                              acquisitionStatus: item.acquisitionStatus === 'PENDING' ? 'PURCHASED' : 'RECEIVED',
                              acquisitionSource: item.acquisitionSource || 'Succession directe',
                              acquisitionNotes: item.acquisitionNotes || '',
                            });
                          }}
                          className="bg-slate-800 hover:bg-[#D4AF37] text-slate-200 hover:text-slate-950 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
                        >
                          Mettre à jour
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. SHIPMENTS (Master Prompt Section 38 & 78) */}
      {adminTab === 'shipments' && (
        <div className="space-y-6">
          <h2 className="text-lg font-serif font-bold text-amber-200">
            Gestion des Expéditions & Suivi Transporteurs
          </h2>

          <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl overflow-hidden shadow">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Commande</th>
                    <th className="p-3">Objet</th>
                    <th className="p-3">Destinataire & Adresse</th>
                    <th className="p-3">Transporteur & Numéro de suivi</th>
                    <th className="p-3">Statut</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {shipments.map((s) => (
                    <tr key={s.order.id} className="hover:bg-slate-800/40">
                      <td className="p-3 font-mono font-bold text-amber-300">
                        {s.order.orderNumber}
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-100">{s.lot.title}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{s.lot.reference}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-200">
                          {s.buyer.companyName || s.buyer.name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {s.buyer.addressLine1}, {s.buyer.postalCode} {s.buyer.city} ({s.buyer.country})
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">Tél: {s.buyer.phone}</div>
                      </td>
                      <td className="p-3">
                        {s.order.trackingNumber ? (
                          <div className="font-mono text-amber-200 font-semibold">
                            {s.order.shippingCarrier}: {s.order.trackingNumber}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Non expédié</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="bg-slate-800 px-2 py-0.5 rounded text-[10px] font-semibold">
                          {s.order.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            setShipmentModalItem(s);
                            setShipmentUpdateForm({
                              shippingCarrier: s.order.shippingCarrier || 'Colissimo Recommandé R5',
                              trackingNumber: s.order.trackingNumber || '',
                              status: s.order.status === 'READY_TO_SHIP' ? 'SHIPPED' : s.order.status,
                            });
                          }}
                          className="bg-slate-800 hover:bg-[#D4AF37] text-slate-200 hover:text-slate-950 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
                        >
                          Expédier / Suivi
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. AUDIT LOGS (Master Prompt Section 51) */}
      {adminTab === 'audit' && (
        <div className="space-y-4">
          <h2 className="text-lg font-serif font-bold text-amber-200">
            Journal d'Audit & Sécurité Transactionnelle
          </h2>
          <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl overflow-hidden shadow">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#0B132B] text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3 font-sans">Date & Heure</th>
                    <th className="p-3 font-sans">Action</th>
                    <th className="p-3 font-sans">Entité</th>
                    <th className="p-3 font-sans">Détails de l'opération</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300 text-[11px]">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40">
                      <td className="p-3 text-slate-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('fr-FR')}
                      </td>
                      <td className="p-3 font-bold text-amber-300">{log.action}</td>
                      <td className="p-3 text-slate-400">{log.entityId || log.entityType}</td>
                      <td className="p-3 text-slate-300 font-sans">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 7. SETTINGS & VENDEUR PARTICULIER CONFIGURATION (Section 89) */}
      {adminTab === 'settings' && (
        <div className="space-y-6 max-w-2xl bg-[#1C2541]/70 p-6 rounded-2xl border border-slate-800">
          <div>
            <h2 className="text-lg font-serif font-bold text-amber-200">
              Paramètres Vendeur & Réglementation
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Configuration de l'identité du vendeur particulier et des paramètres techniques.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Type de vendeur actuel :
              </label>
              <input
                type="text"
                disabled
                value="PRIVATE_INDIVIDUAL (Vendeur Particulier)"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-400 font-mono"
              />
              <span className="text-[11px] text-amber-400/80 block mt-1">
                Conforme Master Prompt Section 2 & 31 : pas de fausse facture, pas de numéro de TVA fictif.
              </span>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Nom du vendeur :</label>
              <input
                type="text"
                defaultValue={settings['seller_name'] || 'Monsieur De Coster'}
                className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Mention légale affichée :</label>
              <input
                type="text"
                defaultValue={settings['seller_status'] || 'Vendeur particulier'}
                className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Délai Anti-Snipe (minutes) :</label>
              <input
                type="number"
                defaultValue={settings['anti_snipe_minutes'] || '2'}
                className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Environnement PayPal :</label>
              <select
                defaultValue={settings['paypal_environment'] || 'SANDBOX'}
                className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
              >
                <option value="SANDBOX">SANDBOX (Test)</option>
                <option value="LIVE">LIVE (Production)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE LOT */}
      {newLotModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-2xl bg-[#1C2541] border border-amber-500/40 rounded-2xl p-6 shadow-2xl text-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
              <h3 className="font-serif text-lg font-bold text-amber-200">
                Ajouter un nouvel objet de collection
              </h3>
              <button onClick={() => setNewLotModalOpen(false)} className="text-slate-400">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLot} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Référence :</label>
                  <input
                    type="text"
                    required
                    value={newLotForm.reference}
                    onChange={(e) => setNewLotForm({ ...newLotForm, reference: e.target.value })}
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono text-amber-300"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Catégorie :</label>
                  <input
                    type="text"
                    required
                    value={newLotForm.category}
                    onChange={(e) => setNewLotForm({ ...newLotForm, category: e.target.value })}
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Titre de l'objet :</label>
                <input
                  type="text"
                  required
                  value={newLotForm.title}
                  onChange={(e) => setNewLotForm({ ...newLotForm, title: e.target.value })}
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-serif text-amber-100"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description & Provenance :</label>
                <textarea
                  rows={3}
                  required
                  value={newLotForm.description}
                  onChange={(e) => setNewLotForm({ ...newLotForm, description: e.target.value })}
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Mise à prix (€) :</label>
                  <input
                    type="number"
                    step="1"
                    required
                    value={newLotForm.startingPriceCents / 100}
                    onChange={(e) =>
                      setNewLotForm({
                        ...newLotForm,
                        startingPriceCents: Math.round(parseFloat(e.target.value || '0') * 100),
                      })
                    }
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Prix de réserve (€) [Secret] :
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={newLotForm.reservePriceCents / 100}
                    onChange={(e) =>
                      setNewLotForm({
                        ...newLotForm,
                        reservePriceCents: Math.round(parseFloat(e.target.value || '0') * 100),
                      })
                    }
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono text-amber-300"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Coût estimé (€) [Interne] :
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={newLotForm.targetAcquisitionCostCents / 100}
                    onChange={(e) =>
                      setNewLotForm({
                        ...newLotForm,
                        targetAcquisitionCostCents: Math.round(parseFloat(e.target.value || '0') * 100),
                      })
                    }
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Photographies de l'objet (1 URL par ligne — Recommandé : 3, 6 ou 9 photos pour 1, 2 ou 3 rangées de 3 cases) :
                </label>
                <textarea
                  rows={4}
                  value={newLotForm.images.join('\n')}
                  onChange={(e) => {
                    const urls = e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    setNewLotForm({
                      ...newLotForm,
                      images: urls.length > 0 ? urls : ['https://images.unsplash.com/photo-1615529328331-f8917597711f?auto=format&fit=crop&w=800&q=80'],
                    });
                  }}
                  placeholder="https://images.unsplash.com/...&#10;https://images.unsplash.com/...&#10;https://images.unsplash.com/..."
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono text-xs text-amber-200"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {newLotForm.images.length} photo(s) renseignée(s). Les photos s'afficheront en rangées de 3 cases photos par ligne sur la fiche de l'objet.
                </p>

                {/* Prévisualisation en grille de 3 cases par ligne */}
                {newLotForm.images.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2 p-2 bg-[#0B132B] rounded-lg border border-slate-800">
                    {newLotForm.images.map((imgUrl, i) => (
                      <div key={i} className="aspect-square rounded overflow-hidden border border-slate-700 relative bg-black/60">
                        <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                        <span className="absolute top-1 left-1 text-[9px] font-mono px-1 rounded bg-black/80 text-white">
                          {i + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setNewLotModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-5 py-2 rounded-lg"
                >
                  Enregistrer l'objet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: UPDATE ACQUISITION */}
      {acquisitionModalItem && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-[#1C2541] border border-amber-500/40 rounded-2xl p-6 shadow-2xl text-slate-200">
            <h3 className="font-serif text-lg font-bold text-amber-200 mb-2">
              Mise à jour d'acquisition — {acquisitionModalItem.lotReference}
            </h3>
            <p className="text-xs text-slate-400 mb-4">{acquisitionModalItem.lotTitle}</p>

            <form onSubmit={handleUpdateAcquisition} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Statut d'acquisition :</label>
                <select
                  value={acquisitionUpdateForm.acquisitionStatus}
                  onChange={(e) =>
                    setAcquisitionUpdateForm({
                      ...acquisitionUpdateForm,
                      acquisitionStatus: e.target.value,
                    })
                  }
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 text-slate-200"
                >
                  <option value="PENDING">PENDING (En attente d'acquisition)</option>
                  <option value="PURCHASED">PURCHASED (Objet acquis / acheté)</option>
                  <option value="RECEIVED">RECEIVED (Objet réceptionné & prêt)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Coût réel d'acquisition (€) :
                </label>
                <input
                  type="number"
                  step="1"
                  value={acquisitionUpdateForm.actualAcquisitionCostCents / 100}
                  onChange={(e) =>
                    setAcquisitionUpdateForm({
                      ...acquisitionUpdateForm,
                      actualAcquisitionCostCents: Math.round(parseFloat(e.target.value || '0') * 100),
                    })
                  }
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono text-amber-300"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Source / Famille :</label>
                <input
                  type="text"
                  value={acquisitionUpdateForm.acquisitionSource}
                  onChange={(e) =>
                    setAcquisitionUpdateForm({
                      ...acquisitionUpdateForm,
                      acquisitionSource: e.target.value,
                    })
                  }
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAcquisitionModalItem(null)}
                  className="px-4 py-2 text-slate-400 hover:text-white"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-4 py-2 rounded-lg"
                >
                  Valider l'acquisition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: UPDATE SHIPMENT */}
      {shipmentModalItem && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-[#1C2541] border border-amber-500/40 rounded-2xl p-6 shadow-2xl text-slate-200">
            <h3 className="font-serif text-lg font-bold text-amber-200 mb-1">
              Expédition Commande {shipmentModalItem.order.orderNumber}
            </h3>
            <p className="text-xs text-slate-400 mb-4">{shipmentModalItem.lot.title}</p>

            <form onSubmit={handleUpdateShipment} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Transporteur :</label>
                <input
                  type="text"
                  required
                  value={shipmentUpdateForm.shippingCarrier}
                  onChange={(e) =>
                    setShipmentUpdateForm({ ...shipmentUpdateForm, shippingCarrier: e.target.value })
                  }
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Numéro de suivi :</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 6A123456789FR"
                  value={shipmentUpdateForm.trackingNumber}
                  onChange={(e) =>
                    setShipmentUpdateForm({ ...shipmentUpdateForm, trackingNumber: e.target.value })
                  }
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono text-amber-300"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Statut commande :</label>
                <select
                  value={shipmentUpdateForm.status}
                  onChange={(e) =>
                    setShipmentUpdateForm({ ...shipmentUpdateForm, status: e.target.value })
                  }
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 text-slate-200"
                >
                  <option value="SHIPPED">SHIPPED (Colis expédié)</option>
                  <option value="DELIVERED">DELIVERED (Colis livré)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShipmentModalItem(null)}
                  className="px-4 py-2 text-slate-400 hover:text-white"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-4 py-2 rounded-lg"
                >
                  Confirmer l'expédition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RAPIDE : CONSULTATION DE LA FICHE D'UN LOT (POUR REPONDRE AUX QUESTIONS DU CHAT) */}
      {previewLot && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-[#1C2541] border border-[#D4AF37]/60 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-[#D4AF37] text-slate-950 px-2.5 py-0.5 rounded font-mono font-bold text-xs">
                    {previewLot.reference}
                  </span>
                  <span className="text-xs text-amber-300 font-serif italic">
                    {previewLot.period || previewLot.category}
                  </span>
                </div>
                <h3 className="text-lg font-serif font-bold text-white mt-1">
                  {previewLot.title}
                </h3>
              </div>
              <button
                onClick={() => setPreviewLot(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Photos & Primary info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <img
                  src={getLotPrimaryImage(previewLot.images)}
                  alt={previewLot.title}
                  className="w-full h-48 object-cover rounded-xl border border-slate-700 shadow"
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  onError={(e) => handleLotImageError(e, getLotPrimaryImage(previewLot.images))}
                />
              </div>

              <div className="space-y-2.5 text-xs bg-[#0B132B] p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">Mise à prix :</span>
                  <span className="font-bold text-amber-300 font-mono">
                    {formatEuro(previewLot.startingPriceCents)}
                  </span>
                </div>
                {previewLot.reservePriceCents && (
                  <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                    <span className="text-slate-400">Prix réserve (Secret) :</span>
                    <span className="font-bold text-amber-400 font-mono">
                      {formatEuro(previewLot.reservePriceCents)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">Enchère actuelle :</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    {formatEuro(previewLot.currentPriceCents)} ({previewLot.bidCount} offre{previewLot.bidCount > 1 ? 's' : ''})
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">Dimensions :</span>
                  <span className="text-slate-200 font-medium">
                    {previewLot.dimensions || 'Non spécifiées'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Poids :</span>
                  <span className="text-slate-200 font-medium">
                    {previewLot.weight || 'Non spécifié'}
                  </span>
                </div>
              </div>
            </div>

            {/* Description & Condition Report */}
            <div className="space-y-3 text-xs">
              <div className="bg-[#0B132B]/80 rounded-xl p-3.5 border border-slate-800">
                <span className="font-semibold text-amber-200 block mb-1">
                  Description de l'objet :
                </span>
                <p className="text-slate-300 leading-relaxed">{previewLot.description}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#0B132B]/80 rounded-xl p-3 border border-emerald-900/40">
                  <span className="font-semibold text-emerald-400 block mb-1">
                    Rapport d'état & Authenticité :
                  </span>
                  <p className="text-slate-300">{previewLot.conditionReport || 'Très bon état.'}</p>
                </div>
                <div className="bg-[#0B132B]/80 rounded-xl p-3 border border-amber-900/40">
                  <span className="font-semibold text-amber-400 block mb-1">
                    Traces d'usage & Poinçons / Défauts :
                  </span>
                  <p className="text-slate-300">
                    {previewLot.flaws || "Traces d'usage normales conformes à l'ancienneté."}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPreviewLot(null)}
                className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-5 py-2 rounded-xl text-xs cursor-pointer shadow"
              >
                Fermer la fiche
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
