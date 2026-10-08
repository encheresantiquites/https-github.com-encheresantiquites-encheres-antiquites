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
  Scale,
} from 'lucide-react';
import { DEFAULT_SHIPPING_TIERS, calculateShipping } from '../lib/shipping.ts';
import {
  formatSaleDateHeader,
  formatSaleHours,
  getSaleStatusBadge,
  calculateNextSaleDates,
} from '../lib/sales-schedule.ts';

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
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
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
  const [assignLotModalOpen, setAssignLotModalOpen] = useState(false);
  const [selectedLotsToAssign, setSelectedLotsToAssign] = useState<number[]>([]);
  const [acquisitionModalItem, setAcquisitionModalItem] = useState<AcquisitionItem | null>(null);
  const [shipmentModalItem, setShipmentModalItem] = useState<any | null>(null);

  // New Sale Form
  const [newSaleForm, setNewSaleForm] = useState({
    saleDay: 'MARDI' as 'MARDI' | 'VENDREDI',
    date: (() => {
      const dates = calculateNextSaleDates('MARDI');
      return dates.startsAt.toISOString().split('T')[0];
    })(),
    openTime: '10:00',
    closeTime: '20:00',
    title: 'Vente Privée Hebdomadaire — Objets d\'Art & Curiosités',
    description: 'Vente privée bi-hebdomadaire courte réservée exclusivement aux antiquaires et brocanteurs professionnels.',
    status: 'SCHEDULED' as 'DRAFT' | 'SCHEDULED',
  });

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
        const loadedSales = d.sales || [];
        setSalesList(loadedSales);
        setSelectedSaleId((prev) => {
          if (prev && loadedSales.some((s: any) => s.id === prev)) return prev;
          const live = loadedSales.find((s: any) => s.status === 'LIVE');
          return live ? live.id : (loadedSales[0]?.id || null);
        });
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

  // Create bi-weekly sale
  const handleCreateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const res = await fetch('/api/admin/sales', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSaleForm),
      });
      if (res.ok) {
        const data = await res.json();
        setNewSaleModalOpen(false);
        if (data.sale?.id) setSelectedSaleId(data.sale.id);
        await loadAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Erreur lors de la création de la vente');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Publish / open sale (passer en LIVE)
  const handlePublishSale = async (saleId: number) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/sales/${saleId}/publish`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await loadAdminData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Close sale (passer en CLOSED, attribuer et passer à payer 24h)
  const handleCloseSale = async (saleId: number) => {
    if (!token) return;
    if (!confirm('Voulez-vous clôturer cette vente ? Les offres seront arrêtées et les gagnants recevront le délai de règlement de 24h.')) return;
    try {
      const res = await fetch(`/api/admin/sales/${saleId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'CLOSED' }),
      });
      if (res.ok) {
        await loadAdminData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Remove lot from sale
  const handleRemoveLotFromSale = async (saleId: number, lotId: number) => {
    if (!token) return;
    if (!confirm('Retirer ce lot de cette vente ? Il restera au catalogue.')) return;
    try {
      const res = await fetch(`/api/admin/sales/${saleId}/lots/${lotId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await loadAdminData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Offer lot to 2nd bidder
  const handleOfferSecondBidder = async (lotId: number) => {
    if (!token) return;
    if (!confirm('Proposer ce lot au deuxième meilleur enchérisseur ? La commande du premier enchérisseur sera annulée pour défaut de paiement et un nouveau délai de 24h sera accordé au second.')) return;
    try {
      const res = await fetch(`/api/admin/lots/${lotId}/offer-second-bidder`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Le lot a été proposé au deuxième meilleur enchérisseur avec succès.');
        await loadAdminData();
      } else {
        alert(data.error || 'Impossible de proposer au 2ème enchérisseur.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Assign lots to sale
  const handleAssignLotsToSale = async (saleId: number, lotIds: number[]) => {
    if (!token || lotIds.length === 0) return;
    try {
      const res = await fetch(`/api/admin/sales/${saleId}/lots`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lotIds }),
      });
      if (res.ok) {
        setAssignLotModalOpen(false);
        setSelectedLotsToAssign([]);
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
          {/* CALENDRIER COMMERCIAL OFFICIEL — BI-HEBDOMADAIRE (Section 13) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* PROCHAINE VENTE */}
            <div className="bg-[#1C2541] border-2 border-[#D4AF37]/80 rounded-2xl p-5 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#D4AF37] animate-pulse"></div>
                  <span className="text-xs uppercase tracking-widest font-black text-[#D4AF37]">
                    PROCHAINE VENTE
                  </span>
                </div>
                {(() => {
                  const targetSale = metrics?.nextSale || metrics?.currentSale;
                  if (!targetSale) return null;
                  const badge = getSaleStatusBadge(targetSale.status);
                  return (
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${badge.className}`}>
                      STATUT : {badge.label}
                    </span>
                  );
                })()}
              </div>

              {(() => {
                const targetSale = metrics?.nextSale || metrics?.currentSale;
                if (!targetSale) {
                  return (
                    <div className="py-4 text-center">
                      <p className="text-xs text-slate-400 italic">Aucune vente programmée pour le moment.</p>
                      <button
                        onClick={() => {
                          setAdminTab('sales');
                          setNewSaleModalOpen(true);
                        }}
                        className="mt-2 bg-[#D4AF37] text-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold"
                      >
                        + Créer la vente du Mardi ou Vendredi
                      </button>
                    </div>
                  );
                }

                const dayLabel = targetSale.saleDay === 'VENDREDI' ? 'VENTE DU VENDREDI' : 'VENTE DU MARDI';
                const dateHeader = formatSaleDateHeader(targetSale.startsAt);
                const hoursLabel = formatSaleHours(targetSale.startsAt, targetSale.endsAt);

                return (
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between border-b border-slate-800 pb-2">
                      <div>
                        <span className="text-xs font-mono font-bold text-amber-300 block">{dayLabel}</span>
                        <h3 className="font-serif font-bold text-xl text-slate-100">{dateHeader}</h3>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-sm font-bold text-amber-200 block">{hoursLabel}</span>
                        <span className="text-xs font-semibold text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700">
                          {targetSale.totalLots || 0} lots
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-slate-300 line-clamp-1 italic">
                      {targetSale.title || targetSale.reference}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-mono text-slate-400">
                        Réf. {targetSale.reference}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedSaleId(targetSale.id);
                          setAdminTab('sales');
                        }}
                        className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 cursor-pointer shadow"
                      >
                        <span>Gérer la vente & les lots</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* VENTE SUIVANTE */}
            <div className="bg-[#1C2541]/90 border border-slate-700/80 rounded-2xl p-5 shadow-lg relative">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-widest font-black text-slate-300">
                  VENTE SUIVANTE
                </span>
                {metrics?.followingSale ? (
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${getSaleStatusBadge(metrics.followingSale.status).className}`}>
                    STATUT : {getSaleStatusBadge(metrics.followingSale.status).label}
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                    EN PRÉPARATION
                  </span>
                )}
              </div>

              {(() => {
                const following = metrics?.followingSale;
                if (!following) {
                  return (
                    <div className="py-4 text-center">
                      <p className="text-xs text-slate-400 mb-2">
                        La session suivante (Mardi ou Vendredi) est en cours de préparation.
                      </p>
                      <button
                        onClick={() => {
                          setAdminTab('sales');
                          setNewSaleModalOpen(true);
                        }}
                        className="border border-[#D4AF37] text-amber-300 hover:bg-[#D4AF37]/10 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        + Programmer la vente suivante
                      </button>
                    </div>
                  );
                }

                const dayLabel = following.saleDay === 'VENDREDI' ? 'VENTE DU VENDREDI' : 'VENTE DU MARDI';
                const dateHeader = formatSaleDateHeader(following.startsAt);
                const hoursLabel = formatSaleHours(following.startsAt, following.endsAt);

                return (
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between border-b border-slate-800 pb-2">
                      <div>
                        <span className="text-xs font-mono font-bold text-slate-300 block">{dayLabel}</span>
                        <h3 className="font-serif font-bold text-xl text-slate-200">{dateHeader}</h3>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-sm font-bold text-slate-200 block">{hoursLabel}</span>
                        <span className="text-xs font-semibold text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700">
                          {following.totalLots || 0} lots
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-slate-400 line-clamp-1 italic">
                      {following.title || following.reference}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-mono text-slate-400">
                        Réf. {following.reference}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedSaleId(following.id);
                          setAdminTab('sales');
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <span>Préparer les lots</span>
                        <span>→</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

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

      {/* 3. SALES & LOTS (Sections 1, 2, 3, 4, 5, 6, 7, 10, 11, 12) */}
      {adminTab === 'sales' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold block">
                ORGANISATION BI-HEBDOMADAIRE (MARDI & VENDREDI)
              </span>
              <h2 className="text-xl font-serif font-bold text-amber-200 mt-0.5">
                Gestion des Ventes Privées & Lots
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setNewSaleModalOpen(true)}
                className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Créer une vente (Mardi ou Vendredi)</span>
              </button>
              <button
                onClick={() => setNewLotModalOpen(true)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 border border-slate-700 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Créer un lot</span>
              </button>
            </div>
          </div>

          {/* VENTES LIST CARDS / SELECTOR */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {salesList.map((sale) => {
              const isSelected = selectedSaleId === sale.id;
              const badge = getSaleStatusBadge(sale.status);
              const dayLabel = sale.saleDay === 'VENDREDI' ? 'VENTE DU VENDREDI' : 'VENTE DU MARDI';
              const dateHeader = formatSaleDateHeader(sale.startsAt);
              const hoursLabel = formatSaleHours(sale.startsAt, sale.endsAt);
              const attachedLotsCount = lotsList.filter((item) => item.lot?.saleId === sale.id).length;

              return (
                <div
                  key={sale.id}
                  onClick={() => setSelectedSaleId(sale.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#1C2541] border-[#D4AF37] shadow-lg shadow-amber-500/10 ring-1 ring-[#D4AF37]'
                      : 'bg-[#1C2541]/60 border-slate-800 hover:border-slate-700 hover:bg-[#1C2541]/90'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-amber-400">
                      {sale.reference}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="text-xs font-mono font-bold text-slate-300 mb-0.5">
                    {dayLabel}
                  </div>
                  <h4 className="font-serif font-bold text-sm text-slate-100 mb-2 truncate">
                    {dateHeader}
                  </h4>

                  <div className="text-xs text-slate-400 line-clamp-1 mb-3">
                    {sale.title}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                    <span className="font-mono">{hoursLabel}</span>
                    <span className="font-semibold text-slate-200 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      {attachedLotsCount} lots
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* DETAIL DE LA VENTE SÉLECTIONNÉE */}
          {(() => {
            const currentSelectedSale = salesList.find((s) => s.id === selectedSaleId) || salesList[0];
            if (!currentSelectedSale) {
              return (
                <div className="bg-[#1C2541]/50 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
                  <p>Aucune vente sélectionnée. Créez une vente du Mardi ou Vendredi pour démarrer.</p>
                </div>
              );
            }

            const saleLots = lotsList.filter((item) => item.lot?.saleId === currentSelectedSale.id);
            const badge = getSaleStatusBadge(currentSelectedSale.status);
            const dayLabel = currentSelectedSale.saleDay === 'VENDREDI' ? 'VENTE DU VENDREDI' : 'VENTE DU MARDI';
            const dateHeader = formatSaleDateHeader(currentSelectedSale.startsAt);
            const hoursLabel = formatSaleHours(currentSelectedSale.startsAt, currentSelectedSale.endsAt);

            return (
              <div className="bg-[#1C2541]/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                {/* Control bar for this specific sale */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold bg-[#D4AF37] text-slate-950 px-2.5 py-0.5 rounded">
                        {currentSelectedSale.reference}
                      </span>
                      <span className="font-mono text-xs text-amber-300 font-bold">
                        {dayLabel}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <h3 className="font-serif font-bold text-xl text-slate-100 mt-1">
                      {currentSelectedSale.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {dateHeader} • Horaires : {hoursLabel} • {saleLots.length} lot(s) rattaché(s) (Recommandé : 5 à 10 lots)
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Action Ouvrir / Clôturer */}
                    {['SCHEDULED', 'DRAFT'].includes(currentSelectedSale.status) && (
                      <button
                        onClick={() => handlePublishSale(currentSelectedSale.id)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
                        title="Ouvrir immédiatement les offres pour les acheteurs professionnels"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Ouvrir la vente (LIVE)</span>
                      </button>
                    )}

                    {currentSelectedSale.status === 'LIVE' && (
                      <button
                        onClick={() => handleCloseSale(currentSelectedSale.id)}
                        className="bg-rose-700 hover:bg-rose-600 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
                        title="Clôturer la vente, arrêter les enchères et attribuer aux meilleurs enchérisseurs avec délai 24h"
                      >
                        <Clock className="w-4 h-4" />
                        <span>Clôturer la vente</span>
                      </button>
                    )}

                    <button
                      onClick={() => setAssignLotModalOpen(true)}
                      className="bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Ajouter des lots à cette vente</span>
                    </button>
                  </div>
                </div>

                {/* Table of Lots belonging to this sale */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-serif font-bold text-sm text-slate-200">
                      Lots de la vente ({saleLots.length})
                    </h4>
                    <span className="text-xs text-slate-400">
                      Surveillance complète : 1er et 2ème enchérisseurs, montants et statut de règlement (délai 24h).
                    </span>
                  </div>

                  {saleLots.length === 0 ? (
                    <div className="p-8 bg-[#0B132B] rounded-xl border border-slate-800 text-center">
                      <p className="text-xs text-slate-400 mb-3">
                        Aucun lot n'est encore assigné à cette vente bi-hebdomadaire.
                      </p>
                      <button
                        onClick={() => setAssignLotModalOpen(true)}
                        className="bg-[#D4AF37] text-slate-950 font-bold px-4 py-2 rounded-lg text-xs"
                      >
                        + Sélectionner des lots existants
                      </button>
                    </div>
                  ) : (
                    <div className="bg-[#0B132B] border border-slate-800 rounded-xl overflow-hidden shadow">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#070B19] text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                            <tr>
                              <th className="p-3">Lot</th>
                              <th className="p-3">Titre & Catégorie</th>
                              <th className="p-3 text-right">Mise à prix</th>
                              <th className="p-3 text-right">Prix Réserve (Secret)</th>
                              <th className="p-3 text-right">Offre actuelle</th>
                              <th className="p-3">Meilleur enchérisseur (Gagnant)</th>
                              <th className="p-3">2ème meilleur enchérisseur</th>
                              <th className="p-3">Statut Paiement</th>
                              <th className="p-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/80 text-slate-300">
                            {saleLots.map((item) => {
                              const l = item.lot;
                              const hasWinner = Boolean(l.currentWinnerId);
                              const hasSecondWinner = Boolean(l.secondWinnerId);
                              const isUnpaid = l.paymentStatus === 'AWAITING_PAYMENT' || l.paymentStatus === 'OVERDUE';

                              return (
                                <tr key={l.id} className="hover:bg-slate-800/30">
                                  <td className="p-3 font-mono font-bold text-amber-400 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                      <img
                                        src={getLotPrimaryImage(l.images)}
                                        alt=""
                                        className="w-9 h-9 rounded object-cover border border-slate-700"
                                      />
                                      <span>{l.reference}</span>
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    <div className="font-semibold text-slate-100 max-w-[180px] truncate">
                                      {l.title}
                                    </div>
                                    <div className="text-[11px] text-slate-400">{l.category}</div>
                                  </td>
                                  <td className="p-3 text-right font-mono text-slate-300">
                                    {formatEuro(l.startingPriceCents)}
                                  </td>
                                  <td className="p-3 text-right font-mono text-amber-300 font-semibold">
                                    {l.reservePriceCents > 0 ? formatEuro(l.reservePriceCents) : '—'}
                                  </td>
                                  <td className="p-3 text-right font-mono font-bold text-[#D4AF37]">
                                    {formatEuro(l.currentPriceCents)} ({l.bidCount} offres)
                                  </td>
                                  <td className="p-3">
                                    {hasWinner ? (
                                      <div>
                                        <span className="font-bold text-emerald-300 block">
                                          {item.winnerCompany || item.winnerEmail || `Pro #${l.currentWinnerId}`}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-mono">
                                          {formatEuro(l.currentPriceCents)}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-500 italic">Aucune offre</span>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    {hasSecondWinner ? (
                                      <div>
                                        <span className="text-slate-300 font-medium block">
                                          {item.secondWinnerCompany || item.secondWinnerEmail || `Pro #${l.secondWinnerId}`}
                                        </span>
                                        <span className="text-[10px] text-amber-300/80 font-mono">
                                          {formatEuro(l.secondBidAmountCents || 0)}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-500 italic">—</span>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    {l.paymentStatus === 'PAID' ? (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/50">
                                        PAYÉ
                                      </span>
                                    ) : l.paymentStatus === 'AWAITING_PAYMENT' ? (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-600/50">
                                        À PAYER (24H)
                                      </span>
                                    ) : l.paymentStatus === 'OFFERED_SECOND' ? (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-600/50">
                                        PROPOSÉ AU 2ND
                                      </span>
                                    ) : l.paymentStatus === 'OVERDUE' ? (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-600/50">
                                        IMPAYÉ / RETARD
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-400">
                                        {l.status}
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      {/* Bouton Proposer au 2ème enchérisseur si non payé */}
                                      {hasSecondWinner && isUnpaid && (
                                        <button
                                          onClick={() => handleOfferSecondBidder(l.id)}
                                          className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer"
                                          title="Proposer l'achat au 2ème meilleur enchérisseur"
                                        >
                                          Transmettre au 2nd
                                        </button>
                                      )}

                                      <button
                                        onClick={() => handleRemoveLotFromSale(currentSelectedSale.id, l.id)}
                                        className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 p-1 rounded transition-colors"
                                        title="Retirer le lot de cette vente"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
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

          {/* Card Grille Tarifaire Unique */}
          <div className="bg-[#1C2541]/90 border border-[#D4AF37]/40 rounded-xl p-5 shadow space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 pb-3">
              <div className="flex items-center gap-2.5">
                <Truck className="w-5 h-5 text-[#D4AF37]" />
                <div>
                  <h3 className="font-serif font-bold text-amber-200 text-sm">
                    Grille Tarifaire Unique — Livraison Sécurisée (France & Belgique)
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Tarif déterminé uniquement en fonction du poids du colis. Identique pour FR ↔ FR, FR ↔ BE, BE ↔ FR, BE ↔ BE.
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2.5 py-1 rounded-lg">
                Tarifs Actifs
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {DEFAULT_SHIPPING_TIERS.map((tier) => (
                <div key={tier.id} className="bg-[#0B132B] p-2.5 rounded-lg border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-300 font-medium text-[11px]">{tier.label}</span>
                  <span className="font-mono font-bold text-amber-300 text-xs">
                    {tier.quoteRequired ? 'Sur devis' : `${(tier.costCents / 100).toFixed(2).replace('.', ',')} €`}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 italic">
              💡 Règle de seuil strict : tout dépassement d'une tranche fait immédiatement basculer vers la tranche supérieure (ex: 501 g = 16,90 €, 1,01 kg = 19,90 €, 2,01 kg = 24,90 €). Au-delà de 25 kg ou pour les objets encombrants/fragiles : livraison sur devis.
            </p>
          </div>

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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Poids du colis (détermine la livraison) :
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 2.8 kg ou 500 g"
                    value={newLotForm.weight}
                    onChange={(e) => setNewLotForm({ ...newLotForm, weight: e.target.value })}
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono text-amber-300"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Grille unique : ≤500g (14,90€), ≤1kg (16,90€), ≤2kg (19,90€), ≤5kg (24,90€), etc.
                  </p>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Dimensions de l'objet :</label>
                  <input
                    type="text"
                    placeholder="Ex: H: 32 cm, Diam: 16 cm"
                    value={newLotForm.dimensions}
                    onChange={(e) => setNewLotForm({ ...newLotForm, dimensions: e.target.value })}
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer bg-[#0B132B] p-2.5 rounded-lg border border-slate-700">
                <input
                  type="checkbox"
                  checked={(newLotForm as any).shippingQuoteRequired || false}
                  onChange={(e) => setNewLotForm({ ...newLotForm, shippingQuoteRequired: e.target.checked } as any)}
                  className="rounded border-slate-600 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-xs text-slate-300">
                  Objet volumineux, fragile ou hors gabarit postal : <strong>Forcer la livraison sur devis</strong>
                </span>
              </label>

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

      {/* MODAL: CREATE BI-WEEKLY SALE (MARDI OU VENDREDI) */}
      {newSaleModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-xl bg-[#1C2541] border border-amber-500/40 rounded-2xl p-6 shadow-2xl text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
              <div>
                <span className="text-[10px] uppercase font-mono font-bold text-[#D4AF37] tracking-wider block">
                  CALENDRIER COMMERCIAL OFFICIEL
                </span>
                <h3 className="font-serif text-lg font-bold text-amber-200">
                  Créer une vente privée bi-hebdomadaire
                </h3>
              </div>
              <button onClick={() => setNewSaleModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSale} className="space-y-4 text-xs">
              {/* Choix du jour officiel : Mardi ou Vendredi */}
              <div>
                <label className="block text-slate-300 font-bold mb-2">
                  Jour officiel de la vente (Fixe) :
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const nextDates = calculateNextSaleDates('MARDI');
                      setNewSaleForm({
                        ...newSaleForm,
                        saleDay: 'MARDI',
                        date: nextDates.startsAt.toISOString().split('T')[0],
                        title: `Vente Privée n°${String(salesList.length + 1).padStart(3, '0')} (Mardi) — Objets d'Art`,
                      });
                    }}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      newSaleForm.saleDay === 'MARDI'
                        ? 'bg-[#D4AF37] text-slate-950 font-bold border-[#D4AF37] shadow-md'
                        : 'bg-[#0B132B] text-slate-300 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <span className="block font-mono text-sm">MARDI</span>
                    <span className="text-[10px] block opacity-90">Vente #1 de la semaine</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const nextDates = calculateNextSaleDates('VENDREDI');
                      setNewSaleForm({
                        ...newSaleForm,
                        saleDay: 'VENDREDI',
                        date: nextDates.startsAt.toISOString().split('T')[0],
                        title: `Vente Privée n°${String(salesList.length + 1).padStart(3, '0')} (Vendredi) — Collections`,
                      });
                    }}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      newSaleForm.saleDay === 'VENDREDI'
                        ? 'bg-[#D4AF37] text-slate-950 font-bold border-[#D4AF37] shadow-md'
                        : 'bg-[#0B132B] text-slate-300 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <span className="block font-mono text-sm">VENDREDI</span>
                    <span className="text-[10px] block opacity-90">Vente #2 de la semaine</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 italic">
                  Aucune vente n'a jamais lieu le lundi ni le jeudi. Ces jours sont réservés à la préparation.
                </p>
              </div>

              {/* Date & Horaires configurables */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Date de la vente :</label>
                  <input
                    type="date"
                    required
                    value={newSaleForm.date}
                    onChange={(e) => setNewSaleForm({ ...newSaleForm, date: e.target.value })}
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono text-amber-300"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Heure ouverture :</label>
                  <input
                    type="time"
                    required
                    value={newSaleForm.openTime}
                    onChange={(e) => setNewSaleForm({ ...newSaleForm, openTime: e.target.value })}
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Heure clôture :</label>
                  <input
                    type="time"
                    required
                    value={newSaleForm.closeTime}
                    onChange={(e) => setNewSaleForm({ ...newSaleForm, closeTime: e.target.value })}
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Titre de la vente :</label>
                <input
                  type="text"
                  required
                  value={newSaleForm.title}
                  onChange={(e) => setNewSaleForm({ ...newSaleForm, title: e.target.value })}
                  placeholder="Ex: Vente Privée #004 — Objets d'Art & Curiosités"
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-serif text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description & Spécificités :</label>
                <textarea
                  rows={2}
                  value={newSaleForm.description}
                  onChange={(e) => setNewSaleForm({ ...newSaleForm, description: e.target.value })}
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Statut initial :</label>
                <select
                  value={newSaleForm.status}
                  onChange={(e) => setNewSaleForm({ ...newSaleForm, status: e.target.value as any })}
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2"
                >
                  <option value="SCHEDULED">PROGRAMMÉE (Visible des professionnels avec compte à rebours)</option>
                  <option value="DRAFT">BROUILLON (Invisible des professionnels, en préparation)</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setNewSaleModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-5 py-2 rounded-lg shadow"
                >
                  Enregistrer et Programmer la vente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN LOTS TO SALE */}
      {assignLotModalOpen && selectedSaleId && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-2xl bg-[#1C2541] border border-amber-500/40 rounded-2xl p-6 shadow-2xl text-slate-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-amber-200">
                  Assigner des lots à la vente
                </h3>
                <p className="text-xs text-slate-400">
                  Chaque lot ne peut appartenir qu'à UNE seule vente. Cochez les objets à associer.
                </p>
              </div>
              <button onClick={() => setAssignLotModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {lotsList.map((item) => {
                const l = item.lot;
                const isAlreadyInThisSale = l.saleId === selectedSaleId;
                const isChecked = selectedLotsToAssign.includes(l.id) || isAlreadyInThisSale;

                return (
                  <label
                    key={l.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                      isChecked
                        ? 'bg-amber-950/30 border-amber-500/50'
                        : 'bg-[#0B132B] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isAlreadyInThisSale}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedLotsToAssign([...selectedLotsToAssign, l.id]);
                          } else {
                            setSelectedLotsToAssign(selectedLotsToAssign.filter((id) => id !== l.id));
                          }
                        }}
                        className="rounded border-slate-700 text-[#D4AF37] focus:ring-[#D4AF37]"
                      />
                      <img
                        src={getLotPrimaryImage(l.images)}
                        alt=""
                        className="w-10 h-10 rounded object-cover border border-slate-700"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-amber-300">{l.reference}</span>
                          <span className="text-[10px] text-slate-400">{l.category}</span>
                          {isAlreadyInThisSale && (
                            <span className="text-[9px] bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-600/40">
                              Déjà dans cette vente
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-200 font-semibold line-clamp-1">{l.title}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-mono font-bold text-slate-200 text-xs block">
                        {formatEuro(l.startingPriceCents)}
                      </span>
                      <span className="text-[10px] text-slate-400">Mise à prix</span>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {selectedLotsToAssign.length} nouveau(x) lot(s) sélectionné(s)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAssignLotModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:text-white text-xs"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  disabled={selectedLotsToAssign.length === 0}
                  onClick={() => handleAssignLotsToSale(selectedSaleId, selectedLotsToAssign)}
                  className="bg-[#D4AF37] hover:bg-[#E5C158] disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs shadow cursor-pointer"
                >
                  Valider l'ajout ({selectedLotsToAssign.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
