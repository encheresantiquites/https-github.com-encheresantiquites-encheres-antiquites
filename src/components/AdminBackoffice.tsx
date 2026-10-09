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
  Edit,
  Trash2,
  Download,
  Printer,
  FileText,
  ShieldCheck,
  BookOpen,
  Upload,
  Landmark,
  Lock,
  History,
  Calculator,
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
    'dashboard' | 'lots' | 'sales' | 'ended_sales' | 'orders' | 'finances' | 'police' | 'clients' | 'messages' | 'acquisitions' | 'shipments' | 'audit' | 'settings'
  >('dashboard');

  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  const [clients, setClients] = useState<User[]>([]);
  const [salesList, setSalesList] = useState<Sale[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [lotsList, setLotsList] = useState<any[]>([]);
  const [ordersList, setOrdersList] = useState<any[]>([]);
  const [policeRegister, setPoliceRegister] = useState<any[]>([]);
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

  // Registre financier automatique (Priorité 2)
  const [financialRecords, setFinancialRecords] = useState<any[]>([]);
  const [financesSummary, setFinancesSummary] = useState<any>(null);
  const [financesSearch, setFinancesSearch] = useState('');
  const [financesFilterStatus, setFinancesFilterStatus] = useState<string>('ALL');
  const [editFinanceModalItem, setEditFinanceModalItem] = useState<any | null>(null);
  const [viewFinanceHistoryItem, setViewFinanceHistoryItem] = useState<any | null>(null);
  const [savingFinance, setSavingFinance] = useState(false);

  // Sécurité Administrateur (Changement mot de passe)
  const [adminPasswordForm, setAdminPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordChangeMessage, setPasswordChangeMessage] = useState<string | null>(null);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Filters & Search
  const [clientSearch, setClientSearch] = useState('');
  const [clientFilterStatus, setClientFilterStatus] = useState<string>('ALL');
  const [lotsSearch, setLotsSearch] = useState('');
  const [lotsFilterStatus, setLotsFilterStatus] = useState<string>('ALL');
  const [lotsFilterSale, setLotsFilterSale] = useState<string>('ALL');
  const [lotsFilterCategory, setLotsFilterCategory] = useState<string>('ALL');
  const [ordersSearch, setOrdersSearch] = useState('');
  const [ordersFilterStatus, setOrdersFilterStatus] = useState<string>('ALL');
  const [policeSearch, setPoliceSearch] = useState('');

  // Modals
  const [newLotModalOpen, setNewLotModalOpen] = useState(false);
  const [editLotModalItem, setEditLotModalItem] = useState<any | null>(null);
  const [manualPaymentModalItem, setManualPaymentModalItem] = useState<any | null>(null);
  const [viewBordereauItem, setViewBordereauItem] = useState<any | null>(null);
  const [clientDetailModalUser, setClientDetailModalUser] = useState<User | null>(null);
  const [newSaleModalOpen, setNewSaleModalOpen] = useState(false);
  const [assignLotModalOpen, setAssignLotModalOpen] = useState(false);
  const [selectedLotsToAssign, setSelectedLotsToAssign] = useState<number[]>([]);
  const [acquisitionModalItem, setAcquisitionModalItem] = useState<AcquisitionItem | null>(null);
  const [shipmentModalItem, setShipmentModalItem] = useState<any | null>(null);

  // Edit Lot Form
  const [editLotForm, setEditLotForm] = useState<any>({
    id: 0,
    reference: '',
    title: '',
    description: '',
    category: '',
    period: '',
    dimensions: '',
    weight: '',
    conditionReport: '',
    flaws: '',
    observations: '',
    startingPriceCents: 0,
    reservePriceCents: 0,
    targetAcquisitionCostCents: 0,
    status: 'ACTIVE',
    saleId: null,
    shippingQuoteRequired: false,
    customShippingCostCents: null,
    images: [] as string[],
  });

  // Manual Payment Form
  const [manualPaymentForm, setManualPaymentForm] = useState({
    paymentMethod: 'Virement bancaire',
    paymentReference: '',
    notes: '',
  });

  // New Sale Form
  const [newSaleForm, setNewSaleForm] = useState({
    saleDay: 'MARDI' as 'MARDI' | 'VENDREDI',
    date: (() => {
      const dates = calculateNextSaleDates('MARDI');
      return dates.startsAt.toISOString().split('T')[0];
    })(),
    openTime: '10:00',
    closeTime: '22:00',
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
    actualAcquisitionCostCents: 12000,
    status: 'ACTIVE' as 'DRAFT' | 'SCHEDULED' | 'ACTIVE',
    startDate: (() => {
      const dates = calculateNextSaleDates('MARDI');
      return dates.startsAt.toISOString().split('T')[0];
    })(),
    startTime: '10:00',
    endDate: (() => {
      const dates = calculateNextSaleDates('MARDI');
      return dates.endsAt.toISOString().split('T')[0];
    })(),
    endTime: '22:00',
    endsAt: (() => {
      const dates = calculateNextSaleDates('MARDI');
      return dates.endsAt.toISOString();
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

      // 9. Orders & Adjudications
      const ordersRes = await fetch('/api/admin/orders', { headers });
      if (ordersRes.ok) {
        const d = await ordersRes.json();
        setOrdersList(d.orders || []);
      }

      // 10. Livre de Police
      const policeRes = await fetch('/api/admin/police-register', { headers });
      if (policeRes.ok) {
        const d = await policeRes.json();
        setPoliceRegister(d.register || []);
      }

      // 11. Registre financier automatique (Priorité 2)
      const finRes = await fetch('/api/admin/finances', { headers });
      if (finRes.ok) {
        const d = await finRes.json();
        setFinancialRecords(d.records || []);
        setFinancesSummary(d.summary || null);
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

  // Ouvrir la modale d'édition de lot
  const handleOpenEditLot = (lotItem: any) => {
    const l = lotItem.lot || lotItem;
    setEditLotForm({
      id: l.id,
      reference: l.reference,
      title: l.title,
      description: l.description,
      category: l.category,
      period: l.period || '',
      dimensions: l.dimensions || '',
      weight: l.weight || '',
      conditionReport: l.conditionReport || '',
      flaws: l.flaws || '',
      observations: l.observations || '',
      startingPriceCents: l.startingPriceCents,
      reservePriceCents: l.reservePriceCents || 0,
      targetAcquisitionCostCents: l.targetAcquisitionCostCents || 0,
      status: l.status,
      saleId: l.saleId || null,
      shippingQuoteRequired: Boolean(l.shippingQuoteRequired),
      customShippingCostCents: l.customShippingCostCents || null,
      images: Array.isArray(l.images) ? l.images : [],
    });
    setEditLotModalItem(l);
  };

  // Mettre à jour un lot existant
  const handleUpdateLot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editLotModalItem) return;
    try {
      const res = await fetch(`/api/admin/lots/${editLotModalItem.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editLotForm),
      });
      if (res.ok) {
        setEditLotModalItem(null);
        await loadAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Erreur lors de la mise à jour du lot');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Supprimer définitivement un lot
  const handleDeleteLot = async (lotId: number, ref: string) => {
    if (!token) return;
    if (!confirm(`Confirmer la suppression du lot ${ref} ? Cette action est irréversible.`)) return;
    try {
      const res = await fetch(`/api/admin/lots/${lotId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await loadAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Impossible de supprimer ce lot');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Valider manuellement le paiement d'une commande
  const handleMarkOrderPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !manualPaymentModalItem) return;
    try {
      const res = await fetch(`/api/admin/orders/${manualPaymentModalItem.id}/mark-paid`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(manualPaymentForm),
      });
      if (res.ok) {
        setManualPaymentModalItem(null);
        setManualPaymentForm({ paymentMethod: 'Virement bancaire', paymentReference: '', notes: '' });
        await loadAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Erreur lors de la validation du règlement');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Export conforme du Livre de Police en CSV
  const handleExportPoliceCSV = () => {
    if (policeRegister.length === 0) {
      alert('Aucun objet enregistré dans le livre de police.');
      return;
    }
    const headers = [
      'N° Ordre',
      'Date Entrée',
      'Référence',
      'Désignation complète de l\'objet',
      'Catégorie',
      'Époque',
      'Dimensions',
      'Poids',
      'Provenance / Cédant',
      'Prix acquisition (€)',
      'Mise à prix (€)',
      'Prix réserve (€)',
      'Statut',
      'Date Sortie / Vente',
      'Acquéreur (Nom / Société)',
      'SIRET / TVA',
      'Prix Adjudication (€)',
      'N° Bordereau / Commande',
    ];

    const rows = policeRegister.map((e) => [
      e.orderIndex,
      e.entryDate ? new Date(e.entryDate).toLocaleDateString('fr-FR') : '',
      `"${e.reference}"`,
      `"${(e.description || '').replace(/"/g, '""')}"`,
      `"${e.category || ''}"`,
      `"${e.period || ''}"`,
      `"${e.dimensions || ''}"`,
      `"${e.weight || ''}"`,
      `"${(e.source || '').replace(/"/g, '""')}"`,
      (e.actualCostCents ? e.actualCostCents / 100 : e.targetCostCents / 100).toFixed(2),
      (e.startingPriceCents / 100).toFixed(2),
      (e.reservePriceCents ? e.reservePriceCents / 100 : 0).toFixed(2),
      `"${e.status}"`,
      e.exitDate ? new Date(e.exitDate).toLocaleDateString('fr-FR') : (e.saleDate ? new Date(e.saleDate).toLocaleDateString('fr-FR') : ''),
      `"${(e.buyerIdentity || '—').replace(/"/g, '""')}"`,
      `"${e.buyerSiretVat || '—'}"`,
      e.adjudicationPriceCents ? (e.adjudicationPriceCents / 100).toFixed(2) : '—',
      `"${e.orderNumber || '—'}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `LIVRE_DE_POLICE_DE_COSTER_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

  // Enregistrer les modifications financières (frais d'achat, coûts directs, frais de paiement)
  const handleSaveFinance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFinanceModalItem || !token) return;
    setSavingFinance(true);
    try {
      const res = await fetch(`/api/admin/finances/${editFinanceModalItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          acquisitionCostCents: Math.round(parseFloat(editFinanceModalItem.acquisitionCostEuros || '0') * 100),
          directCostsCents: Math.round(parseFloat(editFinanceModalItem.directCostsEuros || '0') * 100),
          paymentFeesCents: Math.round(parseFloat(editFinanceModalItem.paymentFeesEuros || '0') * 100),
          notes: editFinanceModalItem.notes,
        }),
      });
      if (res.ok) {
        setEditFinanceModalItem(null);
        await loadAdminData();
      }
    } catch (err) {
      console.error('Erreur mise à jour financière:', err);
    } finally {
      setSavingFinance(false);
    }
  };

  // Changement sécurisé de mot de passe administrateur
  const handleChangeAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeMessage(null);
    setPasswordChangeError(null);

    if (adminPasswordForm.newPassword !== adminPasswordForm.confirmPassword) {
      setPasswordChangeError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    if (adminPasswordForm.newPassword.length < 6) {
      setPasswordChangeError('Le nouveau mot de passe doit comporter au moins 6 caractères.');
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: adminPasswordForm.currentPassword,
          newPassword: adminPasswordForm.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasswordChangeError(data.error || 'Erreur lors du changement de mot de passe.');
      } else {
        setPasswordChangeMessage('Votre mot de passe administrateur a été mis à jour avec succès (hachage bcrypt sécurisé).');
        setAdminPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      }
    } catch (err: any) {
      setPasswordChangeError('Une erreur réseau est survenue.');
    } finally {
      setPasswordLoading(false);
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
      const finalEndsAt = newLotForm.endDate && newLotForm.endTime
        ? new Date(`${newLotForm.endDate}T${newLotForm.endTime}:00`).toISOString()
        : newLotForm.endsAt;

      const payload = {
        ...newLotForm,
        endsAt: finalEndsAt,
      };

      const res = await fetch('/api/admin/lots', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setNewLotModalOpen(false);
        await loadAdminData();
      } else {
        const data = await res.json();
        alert(data.error || 'Erreur lors de la création du lot.');
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Erreur réseau.');
    }
  };

  // Marquer un lot comme impayé après expiration du délai de 24h
  const handleMarkUnpaid = async (lotId: number) => {
    if (!token) return;
    if (!confirm('Déclarer cet objet impayé ? La commande sera annulée et le lot redeviendra disponible pour réattribution au 2e enchérisseur ou remise en vente.')) return;
    try {
      const res = await fetch(`/api/admin/lots/${lotId}/mark-unpaid`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Lot marqué comme impayé avec succès.');
        await loadAdminData();
      } else {
        alert(data.error || 'Erreur lors du traitement du lot impayé.');
      }
    } catch (e: any) {
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
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'dashboard'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Tableau de bord</span>
        </button>

        <button
          onClick={() => setAdminTab('sales')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'sales'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Gavel className="w-4 h-4" />
          <span>Ventes (Mardi / Vendredi)</span>
        </button>

        <button
          onClick={() => setAdminTab('ended_sales')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'ended_sales'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Ventes terminées ({salesList.filter((s) => s.status === 'ENDED' || s.status === 'CLOSED').length})</span>
        </button>

        <button
          onClick={() => setAdminTab('lots')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'lots'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Catalogue & Lots ({lotsList.length})</span>
        </button>

        <button
          onClick={() => setAdminTab('orders')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'orders'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Bordereaux & Règlements ({ordersList.length})</span>
          {ordersList.filter((o) => o.status === 'AWAITING_PAYMENT').length > 0 && (
            <span className="bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold animate-pulse">
              {ordersList.filter((o) => o.status === 'AWAITING_PAYMENT').length} à payer
            </span>
          )}
        </button>

        <button
          onClick={() => setAdminTab('finances')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'finances'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Landmark className="w-4 h-4" />
          <span>Registre Financier</span>
          {financialRecords.length > 0 && (
            <span className="bg-slate-800 text-amber-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
              {financialRecords.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setAdminTab('police')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'police'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Livre de Police (Légal)</span>
        </button>

        <button
          onClick={() => setAdminTab('clients')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
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
          onClick={() => setAdminTab('acquisitions')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'acquisitions'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Trésorerie & Achats</span>
          {metrics?.acquisitionsMetrics?.toAcquireCount > 0 && (
            <span className="bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
              {metrics.acquisitionsMetrics.toAcquireCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setAdminTab('shipments')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'shipments'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Expéditions ({shipments.length})</span>
        </button>

        <button
          onClick={() => setAdminTab('messages')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'messages'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Messages & Chat ({chatMessagesList.length})</span>
          {chatMessagesList.filter((m) => !m.isRead && m.senderType === 'BUYER').length > 0 && (
            <span className="bg-amber-500 text-slate-950 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold animate-pulse">
              {chatMessagesList.filter((m) => !m.isRead && m.senderType === 'BUYER').length}
            </span>
          )}
        </button>

        <button
          onClick={() => setAdminTab('audit')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
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
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            adminTab === 'settings'
              ? 'bg-[#D4AF37] text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Paramètres</span>
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
                  <div>
                    <span className="text-xs uppercase tracking-widest font-black text-[#D4AF37] block">
                      PROCHAINE VENTE
                    </span>
                    <span className="text-[11px] font-mono text-amber-200/90 font-bold block">
                      Mardi ou Vendredi • 10h00 → 22h00
                    </span>
                  </div>
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
                    <div className="py-4 text-center space-y-2">
                      <div className="border border-slate-700/60 bg-slate-900/60 rounded-xl p-3">
                        <span className="text-xs font-mono font-bold text-amber-300 block">Mardi ou Vendredi</span>
                        <span className="font-mono text-sm font-bold text-amber-200">10h00 → 22h00</span>
                      </div>
                      <p className="text-xs text-slate-400 italic">Aucune vente programmée pour le moment.</p>
                      <button
                        onClick={() => {
                          setAdminTab('sales');
                          setNewSaleModalOpen(true);
                        }}
                        className="mt-2 bg-[#D4AF37] text-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                      >
                        + Créer la vente du Mardi ou Vendredi (10h00 → 22h00)
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
                <div>
                  <span className="text-xs uppercase tracking-widest font-black text-slate-300 block">
                    VENTE SUIVANTE
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 font-bold block">
                    Mardi ou Vendredi • 10h00 → 22h00
                  </span>
                </div>
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
                    <div className="py-4 text-center space-y-2">
                      <div className="border border-slate-700/60 bg-slate-900/60 rounded-xl p-3">
                        <span className="text-xs font-mono font-bold text-slate-300 block">Mardi ou Vendredi</span>
                        <span className="font-mono text-sm font-bold text-slate-200">10h00 → 22h00</span>
                      </div>
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
                        + Programmer la vente suivante (10h00 → 22h00)
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
                        <button
                          onClick={() => setClientDetailModalUser(c)}
                          className="bg-slate-800 hover:bg-slate-700 text-amber-300 px-2 py-1 rounded text-[11px] border border-slate-700 transition-colors cursor-pointer"
                          title="Consulter le dossier professionnel complet (SIRET, Kbis, Coordonnées)"
                        >
                          Dossier KYC
                        </button>
                        {c.status !== 'APPROVED' && (
                          <button
                            onClick={() => handleClientStatusChange(c.id, 'APPROVED')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded text-[11px] transition-colors cursor-pointer"
                          >
                            Valider
                          </button>
                        )}
                        {c.status !== 'SUSPENDED' && (
                          <button
                            onClick={() => handleClientStatusChange(c.id, 'SUSPENDED')}
                            className="bg-amber-800 hover:bg-amber-700 text-amber-100 px-2 py-1 rounded text-[11px] transition-colors cursor-pointer"
                          >
                            Suspendre
                          </button>
                        )}
                        {c.status !== 'BLOCKED' && (
                          <button
                            onClick={() => handleClientStatusChange(c.id, 'BLOCKED')}
                            className="bg-rose-900 hover:bg-rose-800 text-rose-200 px-2 py-1 rounded text-[11px] transition-colors cursor-pointer"
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

      {/* 3b. VENTES TERMINÉES & BILAN DES ADJUDICATIONS */}
      {adminTab === 'ended_sales' && (() => {
        const endedSales = salesList.filter((s) => s.status === 'ENDED' || s.status === 'CLOSED');
        const paidOrders = ordersList.filter((o) => o.status === 'PAID');
        const pendingOrders = ordersList.filter((o) => o.status === 'AWAITING_PAYMENT');
        const totalAdjudicatedCents = ordersList.reduce((acc, o) => acc + (o.finalPriceCents || 0), 0);
        const totalCollectedCents = paidOrders.reduce((acc, o) => acc + (o.totalCents || 0), 0);

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold block">
                  HISTORIQUE OFFICIEL DES VACATIONS
                </span>
                <h2 className="text-xl font-serif font-bold text-amber-200 mt-0.5">
                  Ventes Terminées & Bilan des Adjudications
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Surveillance des adjudicataires, contrôle du délai de paiement de 24h et transfert en cascade aux seconds enchérisseurs en cas d'impayé.
                </p>
              </div>
            </div>

            {/* Metrics cards for ended sales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#1C2541] border border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="text-slate-400 text-xs font-semibold mb-1">Ventes clôturées</div>
                <div className="text-2xl font-bold font-mono text-slate-100">{endedSales.length}</div>
                <div className="text-[11px] text-slate-500 mt-1">Vacations du Mardi / Vendredi</div>
              </div>

              <div className="bg-[#1C2541] border border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="text-slate-400 text-xs font-semibold mb-1">Volume Adjugé</div>
                <div className="text-2xl font-bold font-mono text-amber-300">
                  {(totalAdjudicatedCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                </div>
                <div className="text-[11px] text-slate-500 mt-1">{ordersList.length} objet(s) adjugé(s)</div>
              </div>

              <div className="bg-[#1C2541] border border-emerald-900/50 rounded-xl p-4 shadow-sm bg-emerald-950/20">
                <div className="text-emerald-400 text-xs font-semibold mb-1">Règlements Encaissés</div>
                <div className="text-2xl font-bold font-mono text-emerald-300">
                  {(totalCollectedCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                </div>
                <div className="text-[11px] text-emerald-500/80 mt-1">
                  {paidOrders.length} bordereau(x) soldé(s)
                </div>
              </div>

              <div className="bg-[#1C2541] border border-amber-900/50 rounded-xl p-4 shadow-sm bg-amber-950/20">
                <div className="text-amber-400 text-xs font-semibold mb-1">En attente sous 24h</div>
                <div className="text-2xl font-bold font-mono text-amber-300">
                  {pendingOrders.length} lot(s)
                </div>
                <div className="text-[11px] text-amber-500/80 mt-1">
                  Échéance stricte 24h avant cascade
                </div>
              </div>
            </div>

            {/* List of Ended Sales */}
            {endedSales.length === 0 ? (
              <div className="bg-[#1C2541]/70 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 space-y-3">
                <Clock className="w-10 h-10 text-amber-400/60 mx-auto" />
                <h3 className="font-serif text-lg font-bold text-slate-200">
                  Aucune vente bi-hebdomadaire n'est encore archivée comme terminée
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Dès qu'une vente du Mardi ou Vendredi atteint 22h00 ou est clôturée, elle apparaît automatiquement ici avec l'état complet des adjudications et bordereaux.
                </p>
                <button
                  onClick={() => setAdminTab('sales')}
                  className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5"
                >
                  <span>Voir les ventes programmées et en cours</span>
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {endedSales.map((sale) => {
                    const isSelected = selectedSaleId === sale.id;
                    const dateHeader = formatSaleDateHeader(sale.startsAt);
                    const attachedLots = lotsList.filter((item) => item.lot?.saleId === sale.id);
                    const soldCount = attachedLots.filter((item) => item.lot?.status === 'SOLD').length;

                    return (
                      <div
                        key={sale.id}
                        onClick={() => setSelectedSaleId(sale.id)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#1C2541] border-[#D4AF37] shadow-lg ring-1 ring-[#D4AF37]'
                            : 'bg-[#1C2541]/60 border-slate-800 hover:border-slate-700 hover:bg-[#1C2541]/90'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-xs font-bold text-amber-400">
                            {sale.reference}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-slate-800 text-slate-300 border border-slate-700">
                            Terminée
                          </span>
                        </div>
                        <h4 className="font-serif font-bold text-sm text-slate-100 mb-1 truncate">
                          {dateHeader}
                        </h4>
                        <div className="text-xs text-slate-400 line-clamp-1 mb-3">
                          {sale.title}
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                          <span>{attachedLots.length} lot(s) au total</span>
                          <span className="text-emerald-400 font-semibold">{soldCount} adjugé(s)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Table of all historical orders / adjudications */}
            <div className="bg-[#1C2541] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="font-serif font-bold text-base text-slate-100">
                    Registre des Adjudications & Commandes ({ordersList.length})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Chaque adjudication est horodatée. En cas de non-règlement dans les 24h, transférez le lot au 2ème enchérisseur.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/60">
                      <th className="p-3 font-semibold">N° Bordereau</th>
                      <th className="p-3 font-semibold">Objet Adjugé</th>
                      <th className="p-3 font-semibold">Adjudicataire (1er)</th>
                      <th className="p-3 font-semibold">Montant Adjugé</th>
                      <th className="p-3 font-semibold">Livraison</th>
                      <th className="p-3 font-semibold">Total Dû</th>
                      <th className="p-3 font-semibold">Statut Règlement (24h)</th>
                      <th className="p-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {ordersList.map((order) => {
                      const isPaid = order.status === 'PAID';
                      const isAwaiting = order.status === 'AWAITING_PAYMENT';
                      const isCancelled = order.status === 'CANCELLED';

                      return (
                        <tr key={order.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="p-3 font-mono font-bold text-amber-300">
                            {order.orderNumber}
                          </td>
                          <td className="p-3">
                            <div className="font-serif font-bold text-slate-100 truncate max-w-[200px]">
                              {order.lot?.title || `Lot #${order.lotId}`}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              Réf : {order.lot?.reference}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-slate-200">
                              {order.buyer?.companyName || `${order.buyer?.firstName || ''} ${order.buyer?.lastName || ''}`.trim() || order.buyer?.email}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {order.buyer?.city} ({order.buyer?.country || 'FR'})
                            </div>
                          </td>
                          <td className="p-3 font-mono text-slate-200">
                            {(order.finalPriceCents / 100).toFixed(2)} €
                          </td>
                          <td className="p-3 font-mono text-slate-400">
                            {order.shippingCostCents ? `${(order.shippingCostCents / 100).toFixed(2)} €` : 'Inclus'}
                          </td>
                          <td className="p-3 font-mono font-bold text-amber-200">
                            {(order.totalCents / 100).toFixed(2)} €
                          </td>
                          <td className="p-3">
                            {isPaid && (
                              <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-300 border border-emerald-600/40 px-2 py-0.5 rounded text-[10px] font-bold">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                RÉGLÉ
                              </span>
                            )}
                            {isAwaiting && (
                              <span className="inline-flex items-center gap-1 bg-amber-950/80 text-amber-300 border border-amber-600/40 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse">
                                <Clock className="w-3 h-3 text-amber-400" />
                                EN ATTENTE (24h)
                              </span>
                            )}
                            {isCancelled && (
                              <span className="inline-flex items-center gap-1 bg-rose-950/80 text-rose-300 border border-rose-600/40 px-2 py-0.5 rounded text-[10px] font-bold">
                                <X className="w-3 h-3 text-rose-400" />
                                IMPAYÉ / ANNULÉ
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Valider manuellement le paiement */}
                              {isAwaiting && (
                                <button
                                  type="button"
                                  onClick={() => setManualPaymentModalItem(order)}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-[10px] font-bold transition-all shadow-sm"
                                  title="Valider le règlement reçu par virement"
                                >
                                  Valider paiement
                                </button>
                              )}

                              {/* Transmettre au second enchérisseur si impayé */}
                              {isAwaiting && (
                                <button
                                  type="button"
                                  onClick={() => handleOfferSecondBidder(order.lotId)}
                                  className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-[10px] font-bold transition-all"
                                  title="Transmettre au 2ème enchérisseur (Défaut de paiement 24h)"
                                >
                                  Transmettre au 2nd
                                </button>
                              )}

                              {/* Marquer impayé */}
                              {isAwaiting && (
                                <button
                                  type="button"
                                  onClick={() => handleMarkUnpaid(order.lotId)}
                                  className="bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700/50 px-2 py-1 rounded text-[10px] font-bold transition-all"
                                  title="Déclarer ce lot impayé"
                                >
                                  Impayé
                                </button>
                              )}

                              {/* Consulter le bordereau / facture */}
                              <button
                                type="button"
                                onClick={() => setViewBordereauItem(order)}
                                className="bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1"
                                title="Voir le Bordereau d'adjudication officiel"
                              >
                                <FileText className="w-3 h-3" />
                                <span>Bordereau</span>
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
          </div>
        );
      })()}

      {/* 2b. CATALOGUE GÉNÉRAL & GESTION DES LOTS */}
      {adminTab === 'lots' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold block">
                INVENTAIRE & GESTION DU CATALOGUE
              </span>
              <h2 className="text-xl font-serif font-bold text-amber-200 mt-0.5">
                Catalogue Général des Objets & Lots ({lotsList.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Création, modification, affectation aux ventes du Mardi ou Vendredi, suivi des offres et prix de réserve secrets.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setNewLotModalOpen(true)}
                className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Créer un nouvel objet</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar for Lots */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Total Catalogue</span>
              <span className="font-mono text-xl font-bold text-slate-100">{lotsList.length} objets</span>
            </div>
            <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Affectés à une vente</span>
              <span className="font-mono text-xl font-bold text-amber-300">
                {lotsList.filter((item) => (item.lot || item).saleId).length} lots
              </span>
            </div>
            <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Non affectés (En stock)</span>
              <span className="font-mono text-xl font-bold text-blue-300">
                {lotsList.filter((item) => !(item.lot || item).saleId).length} prêts
              </span>
            </div>
            <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Adjugés / Vendus</span>
              <span className="font-mono text-xl font-bold text-emerald-300">
                {lotsList.filter((item) => (item.lot || item).status === 'SOLD').length} vendus
              </span>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-[#1C2541]/80 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher par référence, titre, catégorie, époque..."
                value={lotsSearch}
                onChange={(e) => setLotsSearch(e.target.value)}
                className="w-full bg-[#0B132B] border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-slate-200 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={lotsFilterSale}
                onChange={(e) => setLotsFilterSale(e.target.value)}
                className="bg-[#0B132B] border border-slate-700 rounded-lg px-2.5 py-2 text-slate-200"
              >
                <option value="ALL">Toutes les ventes</option>
                <option value="ORPHAN">Non affectés à une vente</option>
                {salesList.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.reference} — {s.saleDay === 'VENDREDI' ? 'Vendredi' : 'Mardi'} ({s.status})
                  </option>
                ))}
              </select>

              <select
                value={lotsFilterStatus}
                onChange={(e) => setLotsFilterStatus(e.target.value)}
                className="bg-[#0B132B] border border-slate-700 rounded-lg px-2.5 py-2 text-slate-200"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="ACTIVE">ACTIF (En vente)</option>
                <option value="DRAFT">BROUILLON</option>
                <option value="SCHEDULED">PROGRAMMÉ</option>
                <option value="SOLD">VENDU / ADJUGÉ</option>
                <option value="UNSOLD">INVENDU / SANS OFFRE</option>
              </select>
            </div>
          </div>

          {/* Lots Table */}
          {(() => {
            const filteredLots = lotsList.filter((item) => {
              const l = item.lot || item;
              const matchesSearch =
                !lotsSearch ||
                l.title.toLowerCase().includes(lotsSearch.toLowerCase()) ||
                l.reference.toLowerCase().includes(lotsSearch.toLowerCase()) ||
                (l.category && l.category.toLowerCase().includes(lotsSearch.toLowerCase())) ||
                (l.period && l.period.toLowerCase().includes(lotsSearch.toLowerCase()));

              const matchesStatus = lotsFilterStatus === 'ALL' || l.status === lotsFilterStatus;
              const matchesCategory = lotsFilterCategory === 'ALL' || l.category === lotsFilterCategory;
              const matchesSale =
                lotsFilterSale === 'ALL' ||
                (lotsFilterSale === 'ORPHAN' ? !l.saleId : String(l.saleId) === lotsFilterSale);

              return matchesSearch && matchesStatus && matchesCategory && matchesSale;
            });

            if (filteredLots.length === 0) {
              return (
                <div className="bg-[#1C2541]/50 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
                  <Package className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  <p>Aucun objet ne correspond à vos critères de recherche.</p>
                </div>
              );
            }

            return (
              <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#070B19] text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                      <tr>
                        <th className="p-3">Objet</th>
                        <th className="p-3">Désignation & Époque</th>
                        <th className="p-3">Vente de rattachement</th>
                        <th className="p-3 text-right">Mise à prix</th>
                        <th className="p-3 text-right">Prix Réserve</th>
                        <th className="p-3 text-right">Enchère actuelle</th>
                        <th className="p-3">Statut</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-300">
                      {filteredLots.map((item) => {
                        const l = item.lot || item;
                        const attachedSale = salesList.find((s) => s.id === l.saleId);

                        return (
                          <tr key={l.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-3 font-mono font-bold text-amber-400 whitespace-nowrap">
                              <div className="flex items-center gap-2.5">
                                <img
                                  src={getLotPrimaryImage(l.images)}
                                  alt=""
                                  className="w-10 h-10 rounded-lg object-cover border border-slate-700 shadow"
                                />
                                <div>
                                  <span className="block">{l.reference}</span>
                                  <span className="text-[10px] text-slate-500 font-sans">{l.weight || 'Poids N/C'}</span>
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="font-semibold text-slate-100 max-w-[220px] truncate">
                                {l.title}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                                <span>{l.category}</span>
                                {l.period && <span>• {l.period}</span>}
                              </div>
                            </td>
                            <td className="p-3">
                              {attachedSale ? (
                                <div>
                                  <span className="font-mono text-xs font-bold text-amber-300 block">
                                    {attachedSale.saleDay === 'VENDREDI' ? 'VENTE VENDREDI' : 'VENTE MARDI'}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {attachedSale.reference} ({attachedSale.status})
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] text-blue-300/80 bg-blue-950/60 border border-blue-800/40 px-2 py-0.5 rounded-full inline-block font-mono">
                                  En stock / Non affecté
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-300">
                              {formatEuro(l.startingPriceCents)}
                            </td>
                            <td className="p-3 text-right font-mono text-amber-300/90 font-semibold">
                              {l.reservePriceCents > 0 ? formatEuro(l.reservePriceCents) : '—'}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-[#D4AF37]">
                              {formatEuro(l.currentPriceCents)}
                              <span className="text-[10px] text-slate-400 block font-sans font-normal">
                                {l.bidCount} offre{l.bidCount > 1 ? 's' : ''}
                              </span>
                            </td>
                            <td className="p-3">
                              {l.status === 'SOLD' ? (
                                <span className="bg-emerald-950 text-emerald-300 border border-emerald-600/50 px-2 py-0.5 rounded text-[10px] font-bold">
                                  VENDU
                                </span>
                              ) : l.status === 'ACTIVE' ? (
                                <span className="bg-amber-950 text-amber-300 border border-amber-600/50 px-2 py-0.5 rounded text-[10px] font-bold">
                                  EN COURS
                                </span>
                              ) : l.status === 'UNSOLD' ? (
                                <span className="bg-slate-900 text-slate-400 border border-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                  INVENDU
                                </span>
                              ) : (
                                <span className="bg-slate-900 text-slate-300 border border-slate-700 px-2 py-0.5 rounded text-[10px] font-semibold">
                                  {l.status}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setPreviewLot(l)}
                                  className="text-slate-400 hover:text-amber-300 hover:bg-slate-800 p-1.5 rounded transition-colors"
                                  title="Consulter la fiche détaillée de l'objet"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleOpenEditLot(item)}
                                  className="text-slate-400 hover:text-blue-300 hover:bg-slate-800 p-1.5 rounded transition-colors"
                                  title="Modifier les informations, prix et photos"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                {l.bidCount === 0 && l.status !== 'SOLD' && (
                                  <button
                                    onClick={() => handleDeleteLot(l.id, l.reference)}
                                    className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 p-1.5 rounded transition-colors"
                                    title="Supprimer cet objet du catalogue"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* 2c. BORDEREAUX D'ADJUDICATION & RÈGLEMENTS */}
      {adminTab === 'orders' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold block">
                SUIVI CONTRACTUEL & COMPTABILITÉ
              </span>
              <h2 className="text-xl font-serif font-bold text-amber-200 mt-0.5">
                Bordereaux d'Adjudication & Règlements ({ordersList.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Contrôle strict du délai de règlement de 24h, validation des encaissements et transmission au second enchérisseur en cas de défaillance.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadAdminData}
                className="bg-slate-800 hover:bg-slate-700 text-amber-200 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Actualiser les statuts</span>
              </button>
            </div>
          </div>

          {/* KPIs Règlements */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Total Adjudications</span>
              <span className="font-mono text-xl font-bold text-slate-100">{ordersList.length}</span>
            </div>
            <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">En attente sous 24h</span>
              <span className="font-mono text-xl font-bold text-amber-400">
                {ordersList.filter((o) => o.status === 'AWAITING_PAYMENT').length}
              </span>
            </div>
            <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Encaissé / Réglé</span>
              <span className="font-mono text-xl font-bold text-emerald-400">
                {formatEuro(
                  ordersList
                    .filter((o) => ['PAID', 'SHIPPED', 'DELIVERED', 'PURCHASED', 'RECEIVED', 'READY_TO_SHIP'].includes(o.status))
                    .reduce((acc, o) => acc + (o.totalCents || 0), 0)
                )}
              </span>
            </div>
            <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Défaillances / Transmis 2nd</span>
              <span className="font-mono text-xl font-bold text-blue-400">
                {ordersList.filter((o) => o.status === 'CANCELLED' || o.notes?.includes('candidat suivant')).length}
              </span>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-[#1C2541]/80 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher par N° commande, référence lot, acheteur, société..."
                value={ordersSearch}
                onChange={(e) => setOrdersSearch(e.target.value)}
                className="w-full bg-[#0B132B] border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-slate-200 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={ordersFilterStatus}
                onChange={(e) => setOrdersFilterStatus(e.target.value)}
                className="bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="AWAITING_PAYMENT">En attente de paiement (24h)</option>
                <option value="PAID">Payé (En préparation)</option>
                <option value="SHIPPED">Colis expédié</option>
                <option value="DELIVERED">Livré</option>
                <option value="CANCELLED">Annulé (Défaut de paiement)</option>
              </select>
            </div>
          </div>

          {/* Orders Table */}
          {(() => {
            const filteredOrders = ordersList.filter((o) => {
              const matchesSearch =
                !ordersSearch ||
                o.orderNumber.toLowerCase().includes(ordersSearch.toLowerCase()) ||
                (o.lot && o.lot.title && o.lot.title.toLowerCase().includes(ordersSearch.toLowerCase())) ||
                (o.lot && o.lot.reference && o.lot.reference.toLowerCase().includes(ordersSearch.toLowerCase())) ||
                (o.buyer && (
                  (o.buyer.companyName && o.buyer.companyName.toLowerCase().includes(ordersSearch.toLowerCase())) ||
                  (o.buyer.email && o.buyer.email.toLowerCase().includes(ordersSearch.toLowerCase())) ||
                  (o.buyer.lastName && o.buyer.lastName.toLowerCase().includes(ordersSearch.toLowerCase()))
                ));

              const matchesStatus = ordersFilterStatus === 'ALL' || o.status === ordersFilterStatus;
              return matchesSearch && matchesStatus;
            });

            if (filteredOrders.length === 0) {
              return (
                <div className="bg-[#1C2541]/50 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  <p>Aucune adjudication ou commande ne correspond à ces critères.</p>
                </div>
              );
            }

            return (
              <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#070B19] text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                      <tr>
                        <th className="p-3">N° Bordereau / Date</th>
                        <th className="p-3">Objet Adjugé</th>
                        <th className="p-3">Adjudicataire (Professionnel)</th>
                        <th className="p-3 text-right">Adjudication</th>
                        <th className="p-3 text-right">Livraison</th>
                        <th className="p-3 text-right">Total TTC</th>
                        <th className="p-3">Statut Règlement</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-300">
                      {filteredOrders.map((o) => {
                        const l = o.lot || {};
                        const b = o.buyer || {};
                        const isAwaiting = o.status === 'AWAITING_PAYMENT';
                        const isPaid = ['PAID', 'SHIPPED', 'DELIVERED', 'PURCHASED', 'RECEIVED', 'READY_TO_SHIP'].includes(o.status);

                        return (
                          <tr key={o.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="p-3 font-mono font-bold text-amber-400 whitespace-nowrap">
                              <div>{o.orderNumber}</div>
                              <span className="text-[10px] text-slate-400 font-sans font-normal">
                                {o.createdAt ? new Date(o.createdAt).toLocaleDateString('fr-FR') : '—'}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {l.images && (
                                  <img
                                    src={getLotPrimaryImage(l.images)}
                                    alt=""
                                    className="w-9 h-9 rounded object-cover border border-slate-700"
                                  />
                                )}
                                <div>
                                  <span className="font-mono text-[10px] text-amber-300/90 block">{l.reference}</span>
                                  <span className="font-semibold text-slate-100 max-w-[180px] truncate block">{l.title}</span>
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="font-semibold text-slate-100">
                                {b.companyName || `${b.firstName || ''} ${b.lastName || ''}`}
                              </div>
                              <div className="text-[11px] text-slate-400">{b.email}</div>
                              <div className="text-[10px] text-slate-500">{b.city || 'France'} {b.phone ? `• ${b.phone}` : ''}</div>
                            </td>
                            <td className="p-3 text-right font-mono text-slate-200">
                              {formatEuro(o.finalPriceCents)}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-400 text-[11px]">
                              {formatEuro(o.shippingCostCents)}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-[#D4AF37]">
                              {formatEuro(o.totalCents)}
                            </td>
                            <td className="p-3">
                              {isPaid ? (
                                <span className="bg-emerald-950 text-emerald-300 border border-emerald-600/50 px-2 py-0.5 rounded text-[10px] font-bold">
                                  PAYÉ
                                </span>
                              ) : isAwaiting ? (
                                <div>
                                  <span className="bg-amber-950 text-amber-300 border border-amber-600/50 px-2 py-0.5 rounded text-[10px] font-bold block w-fit mb-0.5">
                                    À PAYER (24H)
                                  </span>
                                  <span className="text-[10px] text-amber-400/80 font-mono">
                                    Délai en cours
                                  </span>
                                </div>
                              ) : o.status === 'CANCELLED' ? (
                                <span className="bg-rose-950 text-rose-300 border border-rose-600/50 px-2 py-0.5 rounded text-[10px] font-bold">
                                  ANNULÉ / IMPAYÉ
                                </span>
                              ) : (
                                <span className="bg-slate-900 text-slate-300 px-2 py-0.5 rounded text-[10px]">
                                  {o.status}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isAwaiting && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setManualPaymentModalItem(o);
                                        setManualPaymentForm({
                                          paymentMethod: 'Virement bancaire',
                                          paymentReference: `VIR-${o.orderNumber}`,
                                          notes: '',
                                        });
                                      }}
                                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded text-[10px] flex items-center gap-1 shadow cursor-pointer"
                                      title="Valider la réception du règlement (Virement, Chèque, etc.)"
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>Valider règlement</span>
                                    </button>
                                    <button
                                      onClick={() => handleOfferSecondBidder(o.lotId)}
                                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-2 py-1 rounded text-[10px] shadow cursor-pointer"
                                      title="Transmettre au deuxième meilleur enchérisseur"
                                    >
                                      2nd enchérisseur
                                    </button>
                                  </>
                                )}

                                <button
                                  onClick={() => setViewBordereauItem(o)}
                                  className="bg-slate-800 hover:bg-slate-700 text-amber-200 border border-slate-700 px-2 py-1 rounded text-[10px] flex items-center gap-1 cursor-pointer"
                                  title="Consulter et imprimer le bordereau d'adjudication officiel"
                                >
                                  <FileText className="w-3 h-3" />
                                  <span>Bordereau</span>
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
            );
          })()}
        </div>
      )}

      {/* 2c-bis. REGISTRE FINANCIER AUTOMATIQUE & MARGES (Section 2 - Priorité 2) */}
      {adminTab === 'finances' && (
        <div className="space-y-6">
          {/* En-tête officiel du Registre Financier */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-amber-950 text-amber-300 border border-amber-600/50 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                  GESTION COMMERCIALE & COMPTABLE
                </span>
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-600/50 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                  LIGNE UNIQUE PAR OBJET
                </span>
              </div>
              <h2 className="text-xl font-serif font-bold text-amber-200 mt-1 flex items-center gap-2">
                <Landmark className="w-6 h-6 text-[#D4AF37]" />
                <span>Registre Financier & Marges Opérationnelles</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
                Chaque objet dispose d'une ligne financière unique générée automatiquement. Le prix d'achat réel est visible exclusivement par l'administrateur. Les ventes adjugées mais non payées ne sont jamais comptabilisées comme encaissements réels.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => loadAdminData()}
                className="flex items-center gap-2 bg-[#1C2541] hover:bg-slate-800 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Actualiser les calculs</span>
              </button>
            </div>
          </div>

          {/* FORMULES OFFICIELLES RAPPELÉES */}
          <div className="bg-[#1C2541]/50 border border-slate-800 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Calculator className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-amber-300">Formules officielles appliquées :</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono">
              <span className="bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg text-slate-200">
                Marge brute = Prix de vente retenu − Prix d'achat
              </span>
              <span className="bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg text-slate-200">
                Marge nette = Prix de vente retenu − Prix d'achat − Frais réels
              </span>
            </div>
          </div>

          {/* 7 KPI CARDS OFFICIELLES */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {/* 1. PRIX D'ACHAT RÉEL */}
            <div className="bg-[#1C2541] border border-slate-800 p-4 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                <span>Achats Réels</span>
                <Lock className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="font-mono text-base lg:text-lg font-black text-amber-200">
                {(((financesSummary?.totalAcquisitionCostCents || 0)) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
              </div>
              <div className="text-[10px] text-amber-400/80 font-mono">Admin exclusif</div>
            </div>

            {/* 2. PRIX ADJUGÉ */}
            <div className="bg-[#1C2541] border border-slate-800 p-4 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                <span>Prix Adjugé</span>
                <Gavel className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="font-mono text-base lg:text-lg font-bold text-blue-200">
                {(((financesSummary?.totalAdjudicatedPriceCents || 0)) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
              </div>
              <div className="text-[10px] text-slate-400">Enchères initiales</div>
            </div>

            {/* 3. PRIX RETENU */}
            <div className="bg-[#1C2541] border border-slate-800 p-4 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                <span>Prix Retenu</span>
                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="font-mono text-base lg:text-lg font-bold text-amber-300">
                {(((financesSummary?.totalFinalPriceCents || 0)) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
              </div>
              <div className="text-[10px] text-amber-400/80">Après cascade</div>
            </div>

            {/* 4. FRAIS DIRECTS & PAIEMENT */}
            <div className="bg-[#1C2541] border border-slate-800 p-4 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                <span>Frais Réels</span>
                <Coins className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div className="font-mono text-base lg:text-lg font-bold text-rose-300">
                {((((financesSummary?.totalDirectCostsCents || 0) + (financesSummary?.totalPaymentFeesCents || 0))) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
              </div>
              <div className="text-[10px] text-slate-400">Coûts + commissions</div>
            </div>

            {/* 5. ENCAISSÉ RÉEL */}
            <div className="bg-[#1C2541] border border-emerald-500/50 bg-emerald-950/20 p-4 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-emerald-400 text-[10px] uppercase font-bold tracking-wider">
                <span>Encaissé Réel</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="font-mono text-base lg:text-lg font-black text-emerald-300">
                {(((financesSummary?.totalCollectedAmountCents || 0)) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
              </div>
              <div className="text-[10px] text-emerald-400/80">{financesSummary?.collectedCount || 0} ventes soldées</div>
            </div>

            {/* 6. MARGE BRUTE */}
            <div className="bg-[#1C2541] border border-slate-800 p-4 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                <span>Marge Brute</span>
                <TrendingUp className="w-3.5 h-3.5 text-amber-300" />
              </div>
              <div className="font-mono text-base lg:text-lg font-black text-amber-200">
                {(((financesSummary?.totalGrossMarginCents || 0)) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
              </div>
              <div className="text-[10px] text-slate-400">Retenu − Achat</div>
            </div>

            {/* 7. MARGE NETTE OPÉRATIONNELLE */}
            <div className="bg-[#1C2541] border border-[#D4AF37]/50 bg-[#D4AF37]/5 p-4 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-[#D4AF37] text-[10px] uppercase font-bold tracking-wider">
                <span>Marge Nette</span>
                <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
              </div>
              <div className="font-mono text-base lg:text-lg font-black text-[#D4AF37]">
                {(((financesSummary?.totalNetMarginCents || 0)) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
              </div>
              <div className="text-[10px] text-amber-300/80 font-mono">
                {financesSummary?.totalFinalPriceCents > 0
                  ? `${Math.round(((financesSummary?.totalNetMarginCents || 0) / financesSummary.totalFinalPriceCents) * 100)} % taux net`
                  : 'Opérationnelle'}
              </div>
            </div>
          </div>

          {/* BARRE DE RECHERCHE ET FILTRES STATUT */}
          <div className="bg-[#1C2541]/70 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Rechercher par référence, titre d'objet..."
                  value={financesSearch}
                  onChange={(e) => setFinancesSearch(e.target.value)}
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              {/* Filtres par statut financier */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {[
                  { id: 'ALL', label: 'Tous' },
                  { id: 'CATALOGUE', label: 'En catalogue' },
                  { id: 'ADJUGE_ATTENTE', label: 'Adjugé (attente 24h)' },
                  { id: 'CASCADE_ATTENTE', label: 'Cascade (2e/3e)' },
                  { id: 'PAYE_SOLDE', label: 'Payé & soldé' },
                  { id: 'IMPAYE', label: 'Impayé' },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setFinancesFilterStatus(st.id)}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                      financesFilterStatus === st.id
                        ? 'bg-[#D4AF37] text-slate-950 font-bold'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* TABLEAU DU REGISTRE FINANCIER */}
          {(() => {
            const filteredRecords = financialRecords.filter((rec) => {
              if (financesSearch) {
                const s = financesSearch.toLowerCase();
                const matchRef = rec.reference?.toLowerCase().includes(s);
                const matchTitle = rec.title?.toLowerCase().includes(s);
                if (!matchRef && !matchTitle) return false;
              }
              if (financesFilterStatus !== 'ALL') {
                if (financesFilterStatus === 'CATALOGUE' && !['CATALOGUE', 'EN_VENTE'].includes(rec.financialStatus)) return false;
                if (financesFilterStatus !== 'CATALOGUE' && rec.financialStatus !== financesFilterStatus) return false;
              }
              return true;
            });

            if (filteredRecords.length === 0) {
              return (
                <div className="bg-[#1C2541]/70 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                  <Landmark className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                  <p className="text-sm font-semibold">Aucune ligne financière ne correspond aux filtres.</p>
                  <p className="text-xs text-slate-500 mt-1">Chaque objet créé dispose d'une ligne financière unique.</p>
                </div>
              );
            }

            return (
              <div className="bg-[#1C2541]/70 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-[#0B132B]/80 text-slate-400 text-[11px] uppercase tracking-wider font-mono">
                        <th className="p-3 font-semibold">Objet / Réf</th>
                        <th className="p-3 font-semibold text-amber-300">
                          <span className="flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            Prix Achat Réel
                          </span>
                        </th>
                        <th className="p-3 font-semibold">Adjugé Initial</th>
                        <th className="p-3 font-semibold text-amber-200">Prix Retenu</th>
                        <th className="p-3 font-semibold">Coûts Directs</th>
                        <th className="p-3 font-semibold">Frais Paiement</th>
                        <th className="p-3 font-semibold text-emerald-300">Encaissé Réel</th>
                        <th className="p-3 font-semibold text-amber-300">Marge Brute</th>
                        <th className="p-3 font-semibold text-[#D4AF37]">Marge Nette</th>
                        <th className="p-3 font-semibold">Statut Financier</th>
                        <th className="p-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-200">
                      {filteredRecords.map((rec) => {
                        const acqCost = rec.acquisitionCostCents || 0;
                        const adjPrice = rec.adjudicatedPriceCents;
                        const finalPrice = rec.finalPriceCents;
                        const directCosts = rec.directCostsCents || 0;
                        const paymentFees = rec.paymentFeesCents || 0;
                        const collected = rec.collectedAmountCents || 0;
                        const grossMargin = rec.grossMarginCents || 0;
                        const netMargin = rec.netMarginCents || 0;

                        // Badge de statut financier
                        let statusBadge = { label: rec.financialStatus, class: 'bg-slate-800 text-slate-300 border-slate-700' };
                        if (rec.financialStatus === 'PAYE_SOLDE') {
                          statusBadge = { label: 'PAYÉ & SOLDÉ', class: 'bg-emerald-950 text-emerald-300 border-emerald-500/50 font-bold' };
                        } else if (rec.financialStatus === 'ADJUGE_ATTENTE') {
                          statusBadge = { label: 'ADJUGÉ (ATTENTE 24H)', class: 'bg-blue-950 text-blue-300 border-blue-500/50' };
                        } else if (rec.financialStatus === 'CASCADE_ATTENTE') {
                          statusBadge = { label: 'CASCADE EN COURS', class: 'bg-amber-950 text-amber-300 border-amber-600/50 font-bold animate-pulse' };
                        } else if (rec.financialStatus === 'IMPAYE') {
                          statusBadge = { label: 'IMPAYÉ DÉFINITIF', class: 'bg-rose-950 text-rose-300 border-rose-600/50 font-bold' };
                        } else if (rec.financialStatus === 'EN_VENTE') {
                          statusBadge = { label: 'EN VENTE', class: 'bg-indigo-950 text-indigo-300 border-indigo-500/50' };
                        } else {
                          statusBadge = { label: 'CATALOGUE', class: 'bg-slate-800 text-slate-400 border-slate-700' };
                        }

                        return (
                          <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                            {/* Réf & Titre */}
                            <td className="p-3">
                              <span className="font-mono text-amber-300 font-bold block">{rec.reference}</span>
                              <span className="text-slate-300 truncate max-w-[200px] block" title={rec.title}>
                                {rec.title}
                              </span>
                            </td>

                            {/* Prix d'achat réel (Admin exclusif) */}
                            <td className="p-3 font-mono font-bold text-amber-300">
                              <span className="flex items-center gap-1.5">
                                <Lock className="w-3 h-3 text-amber-400/70" />
                                <span>{(acqCost / 100).toFixed(2)} €</span>
                              </span>
                            </td>

                            {/* Prix adjugé initial */}
                            <td className="p-3 font-mono text-slate-300">
                              {adjPrice ? `${(adjPrice / 100).toFixed(2)} €` : <span className="text-slate-500 italic">-</span>}
                            </td>

                            {/* Prix retenu (actualisé après cascade) */}
                            <td className="p-3 font-mono font-bold text-amber-200">
                              {finalPrice ? (
                                <span className="flex items-center gap-1">
                                  <span>{(finalPrice / 100).toFixed(2)} €</span>
                                  {adjPrice && finalPrice !== adjPrice && (
                                    <span className="text-[10px] bg-amber-950 text-amber-400 px-1.5 py-0.2 rounded border border-amber-700">
                                      Cascade
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-slate-500 italic">-</span>
                              )}
                            </td>

                            {/* Coûts directs */}
                            <td className="p-3 font-mono text-slate-400">
                              {(directCosts / 100).toFixed(2)} €
                            </td>

                            {/* Frais paiement */}
                            <td className="p-3 font-mono text-slate-400">
                              {(paymentFees / 100).toFixed(2)} €
                            </td>

                            {/* Montant réellement encaissé (0 € tant que non payé) */}
                            <td className="p-3 font-mono font-bold">
                              {collected > 0 ? (
                                <span className="text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40">
                                  {(collected / 100).toFixed(2)} €
                                </span>
                              ) : (
                                <span className="text-slate-500">0,00 €</span>
                              )}
                            </td>

                            {/* Marge brute */}
                            <td className={`p-3 font-mono font-bold ${grossMargin >= 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                              {(grossMargin / 100).toFixed(2)} €
                            </td>

                            {/* Marge nette opérationnelle */}
                            <td className={`p-3 font-mono font-bold ${netMargin >= 0 ? 'text-[#D4AF37]' : 'text-rose-400'}`}>
                              <span className="block">{(netMargin / 100).toFixed(2)} €</span>
                              {finalPrice && finalPrice > 0 && (
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({Math.round((netMargin / finalPrice) * 100)} %)
                                </span>
                              )}
                            </td>

                            {/* Statut financier */}
                            <td className="p-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider font-mono ${statusBadge.class}`}>
                                {statusBadge.label}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="p-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() =>
                                    setEditFinanceModalItem({
                                      id: rec.id,
                                      lotId: rec.lotId,
                                      reference: rec.reference,
                                      title: rec.title,
                                      acquisitionCostEuros: (acqCost / 100).toFixed(2),
                                      directCostsEuros: (directCosts / 100).toFixed(2),
                                      paymentFeesEuros: (paymentFees / 100).toFixed(2),
                                      notes: rec.notes || '',
                                    })
                                  }
                                  className="bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Ajuster le prix d'achat réel, coûts directs ou frais supportés"
                                >
                                  <Edit className="w-3 h-3" />
                                  <span>Frais</span>
                                </button>

                                <button
                                  onClick={() => setViewFinanceHistoryItem(rec)}
                                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                  title="Consulter le journal chronologique des événements financiers"
                                >
                                  <History className="w-3 h-3" />
                                  <span>Journal</span>
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
            );
          })()}
        </div>
      )}

      {/* 2d. LIVRE DE POLICE (RÉGLEMENTATION LÉGALE ART. 321-7 CODE PÉNAL) */}
      {adminTab === 'police' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-amber-950 text-amber-300 border border-amber-600/50 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                  OBLIGATION LÉGALE — CODE PÉNAL ART. 321-7 & R. 321-1
                </span>
                <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Registre conforme
                </span>
              </div>
              <h2 className="text-xl font-serif font-bold text-amber-200 mt-1">
                Livre de Police — Registre des Objets Mobiliers ({policeRegister.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Tenue séquentielle continue sans blanc ni rature des acquisitions, descriptions d'objets d'art, provenances et acquéreurs finaux.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExportPoliceCSV}
                className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-lg transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Exporter le registre (CSV Conforme)</span>
              </button>
              <button
                onClick={() => window.print()}
                className="bg-slate-800 hover:bg-slate-700 text-amber-200 border border-slate-700 font-semibold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer</span>
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="bg-[#1C2541]/80 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between gap-3 text-xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher par référence, désignation, provenance ou acquéreur..."
                value={policeSearch}
                onChange={(e) => setPoliceSearch(e.target.value)}
                className="w-full bg-[#0B132B] border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-slate-200 focus:outline-none focus:border-amber-400"
              />
            </div>
            <span className="text-xs font-mono text-slate-400 hidden sm:inline">
              Numérotation continue 1 à {policeRegister.length}
            </span>
          </div>

          {/* Legal Register Table */}
          {(() => {
            const filteredPolice = policeRegister.filter((entry) => {
              if (!policeSearch) return true;
              const s = policeSearch.toLowerCase();
              return (
                entry.reference.toLowerCase().includes(s) ||
                (entry.title && entry.title.toLowerCase().includes(s)) ||
                (entry.description && entry.description.toLowerCase().includes(s)) ||
                (entry.source && entry.source.toLowerCase().includes(s)) ||
                (entry.buyerIdentity && entry.buyerIdentity.toLowerCase().includes(s))
              );
            });

            return (
              <div className="bg-[#1C2541]/70 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-serif">
                    <thead className="bg-[#070B19] text-amber-400/90 uppercase text-[10px] font-sans font-semibold border-b border-slate-800 tracking-wider">
                      <tr>
                        <th className="p-3 w-12 text-center">N° Ordre</th>
                        <th className="p-3">Date Entrée</th>
                        <th className="p-3">Réf. Lot</th>
                        <th className="p-3 max-w-xs">Désignation précise & Caractéristiques</th>
                        <th className="p-3">Provenance / Cédant</th>
                        <th className="p-3 text-right">Coût achat / Est.</th>
                        <th className="p-3">Date Sortie</th>
                        <th className="p-3">Identité de l'Acquéreur</th>
                        <th className="p-3 text-right">Prix Adjudication</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-slate-300 text-[11px]">
                      {filteredPolice.map((item) => (
                        <tr key={item.lotId} className="hover:bg-slate-800/40">
                          <td className="p-3 font-mono font-bold text-center text-amber-400">
                            #{item.orderIndex}
                          </td>
                          <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                            {item.entryDate ? new Date(item.entryDate).toLocaleDateString('fr-FR') : '—'}
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-200 whitespace-nowrap">
                            {item.reference}
                          </td>
                          <td className="p-3 leading-relaxed">
                            <span className="font-sans font-bold text-slate-100 block">{item.title}</span>
                            <span className="text-slate-400 text-[10px] line-clamp-2">{item.description}</span>
                          </td>
                          <td className="p-3 text-slate-300 italic">
                            {item.source || 'Collection familiale'}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-300">
                            {formatEuro(item.actualCostCents > 0 ? item.actualCostCents : item.targetCostCents || item.startingPriceCents)}
                          </td>
                          <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                            {item.exitDate ? new Date(item.exitDate).toLocaleDateString('fr-FR') : (item.saleDate && item.status === 'SOLD' ? new Date(item.saleDate).toLocaleDateString('fr-FR') : 'En stock')}
                          </td>
                          <td className="p-3">
                            {item.buyerIdentity ? (
                              <div>
                                <span className="font-sans font-semibold text-emerald-300 block">
                                  {item.buyerIdentity}
                                </span>
                                {item.buyerSiretVat && (
                                  <span className="font-mono text-[9px] text-slate-400">
                                    TVA: {item.buyerSiretVat}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500 italic">Non adjugé</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-[#D4AF37]">
                            {item.adjudicationPriceCents ? formatEuro(item.adjudicationPriceCents) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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

          {/* SÉCURITÉ ADMINISTRATEUR — CHANGEMENT DE MOT DE PASSE (Priorité 1) */}
          <div className="border-t border-slate-800 pt-5 mt-5">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound className="w-5 h-5 text-[#D4AF37]" />
              <h3 className="font-serif font-bold text-amber-200 text-sm">
                Sécurité Administrateur & Remplacement du mot de passe
              </h3>
            </div>
            <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
              Le mot de passe initial (<code className="text-amber-300">3030</code>) est temporaire. Vous pouvez le remplacer ici par un mot de passe robuste, qui sera immédiatement chiffré par l'algorithme sécurisé bcrypt côté serveur.
            </p>

            {passwordChangeMessage && (
              <div className="p-3 mb-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{passwordChangeMessage}</span>
              </div>
            )}

            {passwordChangeError && (
              <div className="p-3 mb-3 bg-rose-950/80 border border-rose-500/50 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{passwordChangeError}</span>
              </div>
            )}

            <form onSubmit={handleChangeAdminPassword} className="space-y-3">
              <div>
                <label className="block text-slate-300 text-xs font-semibold mb-1">
                  Mot de passe actuel :
                </label>
                <input
                  type="password"
                  required
                  value={adminPasswordForm.currentPassword}
                  onChange={(e) => setAdminPasswordForm({ ...adminPasswordForm, currentPassword: e.target.value })}
                  placeholder="Saisissez votre mot de passe actuel"
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 text-xs font-semibold mb-1">
                    Nouveau mot de passe :
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={adminPasswordForm.newPassword}
                    onChange={(e) => setAdminPasswordForm({ ...adminPasswordForm, newPassword: e.target.value })}
                    placeholder="Au moins 6 caractères"
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs font-semibold mb-1">
                    Confirmer le nouveau mot de passe :
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={adminPasswordForm.confirmPassword}
                    onChange={(e) => setAdminPasswordForm({ ...adminPasswordForm, confirmPassword: e.target.value })}
                    placeholder="Répétez le nouveau mot de passe"
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-2"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{passwordLoading ? 'Mise à jour en cours...' : 'Mettre à jour mon mot de passe'}</span>
                </button>
              </div>
            </form>
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

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
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
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono text-slate-100"
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
                    Prix d'achat réel (€) [Admin seul] :
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={newLotForm.actualAcquisitionCostCents / 100}
                    onChange={(e) =>
                      setNewLotForm({
                        ...newLotForm,
                        actualAcquisitionCostCents: Math.round(parseFloat(e.target.value || '0') * 100),
                      })
                    }
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono text-emerald-300"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Statut initial :</label>
                  <select
                    value={newLotForm.status}
                    onChange={(e) => setNewLotForm({ ...newLotForm, status: e.target.value as any })}
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 text-slate-200"
                  >
                    <option value="ACTIVE">En vente (Actif)</option>
                    <option value="SCHEDULED">Programmé</option>
                    <option value="DRAFT">Brouillon</option>
                  </select>
                </div>
              </div>

              {/* Calendrier de programmation bi-hebdomadaire (Mardi / Vendredi 10h-22h Europe/Brussels) */}
              <div className="bg-[#0B132B]/80 border border-slate-800 p-3.5 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-amber-300 uppercase tracking-wide">
                      Programmation de la vente (Mardi ou Vendredi)
                    </span>
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
                      Fuseau Europe/Brussels
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Horaires par défaut : 10h00 → 22h00
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Date de début :</label>
                    <input
                      type="date"
                      value={newLotForm.startDate}
                      onChange={(e) => setNewLotForm({ ...newLotForm, startDate: e.target.value })}
                      className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2 text-slate-200 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Heure de début :</label>
                    <input
                      type="time"
                      value={newLotForm.startTime}
                      onChange={(e) => setNewLotForm({ ...newLotForm, startTime: e.target.value })}
                      className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2 text-slate-200 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Date de fin :</label>
                    <input
                      type="date"
                      value={newLotForm.endDate}
                      onChange={(e) => setNewLotForm({ ...newLotForm, endDate: e.target.value })}
                      className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2 text-slate-200 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Heure de fin :</label>
                    <input
                      type="time"
                      value={newLotForm.endTime}
                      onChange={(e) => setNewLotForm({ ...newLotForm, endTime: e.target.value })}
                      className="w-full bg-[#1C2541] border border-slate-700 rounded-lg p-2 text-slate-200 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Gestion des photos avec import depuis l'ordinateur, aperçu, suppression et réordonnancement */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-slate-300 font-semibold">
                    Photographies de l'objet ({newLotForm.images.length}) :
                  </label>
                  <label className="inline-flex items-center gap-1.5 bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors shadow">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Importer des photos depuis mon ordinateur</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0) return;
                        Array.from(files).forEach((file) => {
                          if (!file.type.startsWith('image/')) {
                            alert(`Le fichier ${file.name} n'est pas une image supportée.`);
                            return;
                          }
                          if (file.size > 5 * 1024 * 1024) {
                            alert(`Le fichier ${file.name} dépasse 5 Mo.`);
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const dataUrl = ev.target?.result as string;
                            if (dataUrl) {
                              setNewLotForm((prev) => ({
                                ...prev,
                                images: [...prev.images.filter((x) => !x.includes('photo-1615529328331')), dataUrl],
                              }));
                            }
                          };
                          reader.readAsDataURL(file);
                        });
                      }}
                    />
                  </label>
                </div>

                <textarea
                  rows={2}
                  value={newLotForm.images.join('\n')}
                  onChange={(e) => {
                    const urls = e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    setNewLotForm({
                      ...newLotForm,
                      images: urls.length > 0 ? urls : [],
                    });
                  }}
                  placeholder="Ou collez ici une ou plusieurs URLs d'images (une par ligne)..."
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono text-xs text-amber-200"
                />

                {/* Prévisualisation avec boutons déplacer / supprimer */}
                {newLotForm.images.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 p-3 bg-[#0B132B] rounded-xl border border-slate-800">
                    {newLotForm.images.map((imgUrl, i) => (
                      <div key={i} className="aspect-square rounded-lg overflow-hidden border border-slate-700 relative bg-black/70 group">
                        <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                        <span className="absolute top-1 left-1 text-[9px] font-mono px-1 rounded bg-black/80 text-white font-bold">
                          #{i + 1}
                        </span>
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                          {i > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const arr = [...newLotForm.images];
                                const temp = arr[i - 1];
                                arr[i - 1] = arr[i];
                                arr[i] = temp;
                                setNewLotForm({ ...newLotForm, images: arr });
                              }}
                              className="p-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[10px]"
                              title="Déplacer vers la gauche"
                            >
                              ◀
                            </button>
                          )}
                          {i < newLotForm.images.length - 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const arr = [...newLotForm.images];
                                const temp = arr[i + 1];
                                arr[i + 1] = arr[i];
                                arr[i] = temp;
                                setNewLotForm({ ...newLotForm, images: arr });
                              }}
                              className="p-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[10px]"
                              title="Déplacer vers la droite"
                            >
                              ▶
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setNewLotForm({
                                ...newLotForm,
                                images: newLotForm.images.filter((_, idx) => idx !== i),
                              });
                            }}
                            className="p-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px]"
                            title="Supprimer cette photo"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">
                    Aucune photo importée pour le moment. Cliquez sur « Importer des photos depuis mon ordinateur » ci-dessus.
                  </p>
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

      {/* MODAL: MODIFIER UN LOT EXISTANT */}
      {editLotModalItem && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-3xl bg-[#1C2541] border border-amber-500/40 rounded-2xl p-6 shadow-2xl text-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
              <div>
                <span className="text-[10px] uppercase font-mono font-bold text-[#D4AF37] tracking-wider block">
                  ÉDITION DE L'OBJET — {editLotForm.reference}
                </span>
                <h3 className="font-serif text-lg font-bold text-amber-200">
                  Modifier la fiche du lot
                </h3>
              </div>
              <button onClick={() => setEditLotModalItem(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateLot} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Référence :</label>
                  <input
                    type="text"
                    disabled
                    value={editLotForm.reference}
                    className="w-full bg-[#0B132B]/60 border border-slate-800 rounded-lg p-2 font-mono text-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Catégorie :</label>
                  <input
                    type="text"
                    required
                    value={editLotForm.category}
                    onChange={(e) => setEditLotForm({ ...editLotForm, category: e.target.value })}
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Époque :</label>
                  <input
                    type="text"
                    value={editLotForm.period}
                    onChange={(e) => setEditLotForm({ ...editLotForm, period: e.target.value })}
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-serif text-amber-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Titre de l'objet :</label>
                <input
                  type="text"
                  required
                  value={editLotForm.title}
                  onChange={(e) => setEditLotForm({ ...editLotForm, title: e.target.value })}
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-serif text-amber-100"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description détaillée :</label>
                <textarea
                  rows={3}
                  required
                  value={editLotForm.description}
                  onChange={(e) => setEditLotForm({ ...editLotForm, description: e.target.value })}
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Dimensions :</label>
                  <input
                    type="text"
                    value={editLotForm.dimensions}
                    onChange={(e) => setEditLotForm({ ...editLotForm, dimensions: e.target.value })}
                    placeholder="Ex: H: 45 cm, L: 30 cm"
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Poids du colis (détermine la grille de port) :</label>
                  <input
                    type="text"
                    value={editLotForm.weight}
                    onChange={(e) => setEditLotForm({ ...editLotForm, weight: e.target.value })}
                    placeholder="Ex: 1.8 kg"
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono text-amber-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Rapport d'état & Authenticité :</label>
                  <textarea
                    rows={2}
                    value={editLotForm.conditionReport}
                    onChange={(e) => setEditLotForm({ ...editLotForm, conditionReport: e.target.value })}
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Traces d'usage & Défauts / Poinçons :</label>
                  <textarea
                    rows={2}
                    value={editLotForm.flaws}
                    onChange={(e) => setEditLotForm({ ...editLotForm, flaws: e.target.value })}
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Mise à prix (€) :</label>
                  <input
                    type="number"
                    step="1"
                    required
                    value={editLotForm.startingPriceCents / 100}
                    onChange={(e) =>
                      setEditLotForm({
                        ...editLotForm,
                        startingPriceCents: Math.round(parseFloat(e.target.value || '0') * 100),
                      })
                    }
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Prix de réserve (€) [Secret] :</label>
                  <input
                    type="number"
                    step="1"
                    value={editLotForm.reservePriceCents / 100}
                    onChange={(e) =>
                      setEditLotForm({
                        ...editLotForm,
                        reservePriceCents: Math.round(parseFloat(e.target.value || '0') * 100),
                      })
                    }
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono text-amber-300"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Coût estimé (€) [Interne] :</label>
                  <input
                    type="number"
                    step="1"
                    value={editLotForm.targetAcquisitionCostCents / 100}
                    onChange={(e) =>
                      setEditLotForm({
                        ...editLotForm,
                        targetAcquisitionCostCents: Math.round(parseFloat(e.target.value || '0') * 100),
                      })
                    }
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Vente rattachée :</label>
                  <select
                    value={editLotForm.saleId || ''}
                    onChange={(e) =>
                      setEditLotForm({
                        ...editLotForm,
                        saleId: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 text-slate-200"
                  >
                    <option value="">Non rattaché (En stock)</option>
                    {salesList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.reference} — {s.saleDay === 'VENDREDI' ? 'Vendredi' : 'Mardi'} ({s.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Statut du lot :</label>
                  <select
                    value={editLotForm.status}
                    onChange={(e) => setEditLotForm({ ...editLotForm, status: e.target.value })}
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 text-slate-200"
                  >
                    <option value="ACTIVE">ACTIVE (Enchères ouvertes)</option>
                    <option value="DRAFT">DRAFT (Brouillon)</option>
                    <option value="SCHEDULED">SCHEDULED (Programmé)</option>
                    <option value="SOLD">SOLD (Adjugé / Vendu)</option>
                    <option value="UNSOLD">UNSOLD (Invendu)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-slate-300 font-semibold">
                    Photographies de l'objet ({editLotForm.images.length}) :
                  </label>
                  <label className="inline-flex items-center gap-1.5 bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors shadow">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Ajouter des photos depuis mon ordinateur</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0) return;
                        Array.from(files).forEach((file) => {
                          if (!file.type.startsWith('image/')) {
                            alert(`Le fichier ${file.name} n'est pas une image supportée.`);
                            return;
                          }
                          if (file.size > 5 * 1024 * 1024) {
                            alert(`Le fichier ${file.name} dépasse 5 Mo.`);
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const dataUrl = ev.target?.result as string;
                            if (dataUrl) {
                              setEditLotForm((prev: any) => ({
                                ...prev,
                                images: [...prev.images, dataUrl],
                              }));
                            }
                          };
                          reader.readAsDataURL(file);
                        });
                      }}
                    />
                  </label>
                </div>

                <textarea
                  rows={2}
                  value={editLotForm.images.join('\n')}
                  onChange={(e) => {
                    const urls = e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    setEditLotForm({ ...editLotForm, images: urls });
                  }}
                  placeholder="Ou collez ici une ou plusieurs URLs d'images..."
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono text-xs text-amber-200"
                />

                {/* Prévisualisation des photos avec réordonnancement et suppression */}
                {editLotForm.images.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 p-3 bg-[#0B132B] rounded-xl border border-slate-800">
                    {editLotForm.images.map((imgUrl: string, i: number) => (
                      <div key={i} className="aspect-square rounded-lg overflow-hidden border border-slate-700 relative bg-black/70 group">
                        <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                        <span className="absolute top-1 left-1 text-[9px] font-mono px-1 rounded bg-black/80 text-white font-bold">
                          #{i + 1}
                        </span>
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                          {i > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const arr = [...editLotForm.images];
                                const temp = arr[i - 1];
                                arr[i - 1] = arr[i];
                                arr[i] = temp;
                                setEditLotForm({ ...editLotForm, images: arr });
                              }}
                              className="p-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[10px]"
                              title="Déplacer vers la gauche"
                            >
                              ◀
                            </button>
                          )}
                          {i < editLotForm.images.length - 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const arr = [...editLotForm.images];
                                const temp = arr[i + 1];
                                arr[i + 1] = arr[i];
                                arr[i] = temp;
                                setEditLotForm({ ...editLotForm, images: arr });
                              }}
                              className="p-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[10px]"
                              title="Déplacer vers la droite"
                            >
                              ▶
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditLotForm({
                                ...editLotForm,
                                images: editLotForm.images.filter((_: any, idx: number) => idx !== i),
                              });
                            }}
                            className="p-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px]"
                            title="Supprimer cette photo"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditLotModalItem(null)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-5 py-2 rounded-lg shadow cursor-pointer"
                >
                  Enregistrer les modifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VALIDER MANUELLEMENT UN RÈGLEMENT */}
      {manualPaymentModalItem && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-[#1C2541] border border-emerald-500/40 rounded-2xl p-6 shadow-2xl text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
              <div>
                <span className="text-[10px] uppercase font-mono font-bold text-emerald-400 tracking-wider block">
                  ENCAISSEMENT & CONFIRMATION DE RÈGLEMENT
                </span>
                <h3 className="font-serif text-lg font-bold text-slate-100">
                  Valider le règlement — {manualPaymentModalItem.orderNumber}
                </h3>
              </div>
              <button onClick={() => setManualPaymentModalItem(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="bg-[#0B132B] p-3 rounded-xl border border-slate-800 mb-4 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Objet adjugé :</span>
                <span className="font-semibold text-slate-200">{manualPaymentModalItem.lot?.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Adjudicataire :</span>
                <span className="font-semibold text-slate-200">
                  {manualPaymentModalItem.buyer?.companyName || `${manualPaymentModalItem.buyer?.firstName || ''} ${manualPaymentModalItem.buyer?.lastName || ''}`}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-1">
                <span className="text-slate-400 font-bold">Montant total dû :</span>
                <span className="font-mono font-bold text-amber-300 text-sm">
                  {formatEuro(manualPaymentModalItem.totalCents)}
                </span>
              </div>
            </div>

            <form onSubmit={handleMarkOrderPaid} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Mode de règlement reçu :</label>
                <select
                  value={manualPaymentForm.paymentMethod}
                  onChange={(e) => setManualPaymentForm({ ...manualPaymentForm, paymentMethod: e.target.value })}
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 text-slate-200"
                >
                  <option value="Virement bancaire">Virement bancaire (IBAN)</option>
                  <option value="Chèque professionnel">Chèque professionnel vérifié</option>
                  <option value="Carte bancaire / Terminal">Carte bancaire / Terminal physique</option>
                  <option value="Espèces (Reçu direct)">Espèces (dans la limite légale autorisée)</option>
                  <option value="PayPal Direct">PayPal Direct</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Référence du règlement (N° virement / chèque) :</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: VIR-BNP-8849204"
                  value={manualPaymentForm.paymentReference}
                  onChange={(e) => setManualPaymentForm({ ...manualPaymentForm, paymentReference: e.target.value })}
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2 font-mono text-amber-300"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Note comptable interne (Optionnelle) :</label>
                <input
                  type="text"
                  placeholder="Ex: Fonds crédités sur compte bancaire professionnel"
                  value={manualPaymentForm.notes}
                  onChange={(e) => setManualPaymentForm({ ...manualPaymentForm, notes: e.target.value })}
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg p-2"
                />
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setManualPaymentModalItem(null)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2 rounded-lg shadow cursor-pointer"
                >
                  Confirmer l'encaissement et générer le bordereau
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: BORDEREAU D'ADJUDICATION OFFICIEL (IMPRESSION & CONSULTATION) */}
      {viewBordereauItem && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-[#0B132B] border border-[#D4AF37]/60 rounded-2xl max-w-2xl w-full p-8 shadow-2xl text-slate-200 my-8 space-y-6">
            <div className="flex items-start justify-between border-b border-slate-700 pb-4">
              <div>
                <span className="text-[10px] uppercase font-mono font-bold text-[#D4AF37] tracking-widest block">
                  BORDEREAU D'ADJUDICATION & CONFIRMATION DE TRANSACTION
                </span>
                <h3 className="font-serif text-xl font-bold text-amber-100 mt-1">
                  {viewBordereauItem.orderNumber}
                </h3>
                <span className="text-xs text-slate-400">
                  Émis le {viewBordereauItem.createdAt ? new Date(viewBordereauItem.createdAt).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-slate-800 hover:bg-slate-700 text-amber-200 border border-slate-700 font-semibold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimer</span>
                </button>
                <button
                  onClick={() => setViewBordereauItem(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Parties : Vendeur & Acheteur */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-[#1C2541]/70 p-4 rounded-xl border border-slate-800">
              <div>
                <span className="text-[10px] uppercase text-amber-400 font-mono font-bold block mb-1">
                  VENDEUR
                </span>
                <p className="font-serif font-bold text-slate-100 text-sm">Monsieur De Coster</p>
                <p className="text-slate-300">Vendeur particulier</p>
                <p className="text-[10px] text-slate-400 mt-1 italic">
                  Dispense de TVA (Article 293 B du CGI) — Vente d'objets personnels et de collection.
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase text-amber-400 font-mono font-bold block mb-1">
                  ACQUÉREUR PROFESSIONNEL
                </span>
                <p className="font-bold text-slate-100 text-sm">
                  {viewBordereauItem.buyer?.companyName || `${viewBordereauItem.buyer?.firstName || ''} ${viewBordereauItem.buyer?.lastName || ''}`}
                </p>
                <p className="text-slate-300">{viewBordereauItem.buyer?.email}</p>
                <p className="text-slate-400">{viewBordereauItem.buyer?.addressLine1 || 'Adresse professionnelle'}</p>
                <p className="text-slate-400">{viewBordereauItem.buyer?.postalCode} {viewBordereauItem.buyer?.city} ({viewBordereauItem.buyer?.country || 'France'})</p>
                {viewBordereauItem.buyer?.vatNumber && (
                  <p className="font-mono text-[10px] text-amber-300/80 mt-0.5">N° SIRET/TVA : {viewBordereauItem.buyer.vatNumber}</p>
                )}
              </div>
            </div>

            {/* Détail du lot */}
            <div className="text-xs">
              <span className="text-[10px] uppercase text-slate-400 font-mono font-bold block mb-2">
                DÉSIGNATION DE L'OBJET ADJUGÉ
              </span>
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-[#070B19] text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Réf. Lot</th>
                      <th className="p-3">Description & Spécifications</th>
                      <th className="p-3 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    <tr>
                      <td className="p-3 font-mono font-bold text-amber-400 whitespace-nowrap align-top">
                        {viewBordereauItem.lot?.reference || 'LOT-2026'}
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-slate-100 block">{viewBordereauItem.lot?.title}</span>
                        <span className="text-slate-400 text-[11px] block mt-0.5">{viewBordereauItem.lot?.category} {viewBordereauItem.lot?.period ? `• ${viewBordereauItem.lot.period}` : ''}</span>
                        <span className="text-slate-500 text-[10px] block mt-1">{viewBordereauItem.lot?.dimensions ? `Dimensions : ${viewBordereauItem.lot.dimensions}` : ''}</span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-100 align-top">
                        {formatEuro(viewBordereauItem.finalPriceCents)}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono text-slate-400" colSpan={2}>
                        Frais d'emballage d'art et expédition sécurisée
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {formatEuro(viewBordereauItem.shippingCostCents)}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot className="bg-[#070B19] border-t-2 border-[#D4AF37]/50 font-bold">
                    <tr>
                      <td className="p-3 text-slate-200" colSpan={2}>
                        TOTAL NET À RÉGLER (TTC) :
                      </td>
                      <td className="p-3 text-right font-mono text-lg text-[#D4AF37]">
                        {formatEuro(viewBordereauItem.totalCents)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Règlement statut */}
            <div className="bg-[#1C2541]/70 p-3.5 rounded-xl border border-slate-800 text-xs flex items-center justify-between">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">STATUT DU PAIEMENT :</span>
                <span className="font-bold text-emerald-400">
                  {['PAID', 'SHIPPED', 'DELIVERED', 'PURCHASED', 'RECEIVED', 'READY_TO_SHIP'].includes(viewBordereauItem.status)
                    ? 'ACQUITTÉ / PAYÉ INTÉGRALEMENT'
                    : 'EN ATTENTE DE RÈGLEMENT (DÉLAI 24H)'}
                </span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                Cabinet De Coster — Enchères Privées d'Antiquités
              </span>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setViewBordereauItem(null)}
                className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-5 py-2 rounded-xl text-xs cursor-pointer shadow"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DOSSIER CLIENT PROFESSIONNEL & KYC */}
      {clientDetailModalUser && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-xl bg-[#1C2541] border border-amber-500/40 rounded-2xl p-6 shadow-2xl text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
              <div>
                <span className="text-[10px] uppercase font-mono font-bold text-[#D4AF37] tracking-wider block">
                  DOSSIER PROFESSIONNEL & KYC
                </span>
                <h3 className="font-serif text-lg font-bold text-amber-200">
                  {clientDetailModalUser.companyName || `${clientDetailModalUser.firstName || ''} ${clientDetailModalUser.lastName || ''}`}
                </h3>
              </div>
              <button onClick={() => setClientDetailModalUser(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-[#0B132B] p-3.5 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[10px]">Activité :</span>
                  <span className="font-semibold text-slate-200">{clientDetailModalUser.activity || 'Antiquaire / Brocanteur'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Pays d'exercice :</span>
                  <span className="font-semibold text-slate-200">{clientDetailModalUser.country || 'France'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">N° SIRET / Kbis / TVA :</span>
                  <span className="font-mono text-amber-300 font-bold">{clientDetailModalUser.vatNumber || 'Non renseigné'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Statut actuel :</span>
                  <span className="font-bold text-emerald-400">{clientDetailModalUser.status}</span>
                </div>
              </div>

              <div className="bg-[#0B132B] p-3.5 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Coordonnées de contact :</span>
                <p className="text-slate-300">Email : <span className="font-mono text-amber-200">{clientDetailModalUser.email}</span></p>
                <p className="text-slate-300">Téléphone : <span className="font-mono text-slate-200">{clientDetailModalUser.phone || 'Non renseigné'}</span></p>
                <p className="text-slate-300">
                  Adresse : {clientDetailModalUser.addressLine1 || 'Non renseignée'} {clientDetailModalUser.postalCode} {clientDetailModalUser.city}
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      handleClientStatusChange(clientDetailModalUser.id, 'APPROVED');
                      setClientDetailModalUser(null);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    Agréer (APPROVED)
                  </button>
                  <button
                    onClick={() => {
                      handleClientStatusChange(clientDetailModalUser.id, 'SUSPENDED');
                      setClientDetailModalUser(null);
                    }}
                    className="bg-amber-800 hover:bg-amber-700 text-amber-100 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    Suspendre
                  </button>
                  <button
                    onClick={() => {
                      handleClientStatusChange(clientDetailModalUser.id, 'BLOCKED');
                      setClientDetailModalUser(null);
                    }}
                    className="bg-rose-900 hover:bg-rose-800 text-rose-200 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    Bloquer
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setClientDetailModalUser(null)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AJUSTER LES FRAIS & COÛTS DU REGISTRE FINANCIER (Priorité 2) */}
      {editFinanceModalItem && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-[#1C2541] border border-amber-500/40 rounded-2xl p-6 shadow-2xl text-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-[#D4AF37]" />
                <h3 className="font-serif text-lg font-bold text-amber-200">
                  Ajuster Frais & Coûts — {editFinanceModalItem.reference}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditFinanceModalItem(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Objet : <strong className="text-slate-200">{editFinanceModalItem.title}</strong>. Saisie des frais réels supportés et du prix d'achat réel (confidentiel administrateur).
            </p>

            <form onSubmit={handleSaveFinance} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                  <span>Prix d'Achat Réel (€) :</span>
                  <span className="text-[10px] text-amber-400 flex items-center gap-1 font-mono">
                    <Lock className="w-3 h-3" /> Visible exclusivement admin
                  </span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={editFinanceModalItem.acquisitionCostEuros}
                  onChange={(e) =>
                    setEditFinanceModalItem({ ...editFinanceModalItem, acquisitionCostEuros: e.target.value })
                  }
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-sm focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Coûts directs imputables (€) :
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editFinanceModalItem.directCostsEuros}
                    onChange={(e) =>
                      setEditFinanceModalItem({ ...editFinanceModalItem, directCostsEuros: e.target.value })
                    }
                    placeholder="Restauration, encadrement..."
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-sm focus:outline-none focus:border-[#D4AF37]"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Restauration, expertise, transport amont</span>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Frais de paiement réellement supportés (€) :
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editFinanceModalItem.paymentFeesEuros}
                    onChange={(e) =>
                      setEditFinanceModalItem({ ...editFinanceModalItem, paymentFeesEuros: e.target.value })
                    }
                    placeholder="Commissions bancaires, PayPal..."
                    className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-sm focus:outline-none focus:border-[#D4AF37]"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Commissions PayPal ou virement réelles</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Notes comptables & justificatifs :
                </label>
                <textarea
                  rows={2}
                  value={editFinanceModalItem.notes}
                  onChange={(e) =>
                    setEditFinanceModalItem({ ...editFinanceModalItem, notes: e.target.value })
                  }
                  placeholder="Justification des frais ou provenance de l'acquisition..."
                  className="w-full bg-[#0B132B] border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setEditFinanceModalItem(null)}
                  className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingFinance}
                  className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  {savingFinance ? 'Calcul en cours...' : 'Enregistrer & Recalculer les marges'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: HISTORIQUE CHRONOLOGIQUE DE LA LIGNE FINANCIÈRE */}
      {viewFinanceHistoryItem && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-xl bg-[#1C2541] border border-slate-700 rounded-2xl p-6 shadow-2xl text-slate-200 max-h-[85vh] flex flex-col animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-serif text-lg font-bold text-amber-200">
                    Journal Financier — {viewFinanceHistoryItem.reference}
                  </h3>
                  <span className="text-[11px] text-slate-400">{viewFinanceHistoryItem.title}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewFinanceHistoryItem(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {Array.isArray(viewFinanceHistoryItem.history) && viewFinanceHistoryItem.history.length > 0 ? (
                <div className="relative border-l-2 border-slate-700 ml-3 pl-4 space-y-4">
                  {viewFinanceHistoryItem.history.map((ev: any, idx: number) => {
                    let evBadge = 'bg-slate-800 text-slate-300';
                    if (ev.event === 'ADJUDICATION') evBadge = 'bg-blue-950 text-blue-300 border border-blue-500/50';
                    else if (ev.event === 'CASCADE_TRANSFER') evBadge = 'bg-amber-950 text-amber-300 border border-amber-500/50';
                    else if (ev.event === 'PAYMENT_RECEIVED') evBadge = 'bg-emerald-950 text-emerald-300 border border-emerald-500/50';
                    else if (ev.event === 'CASCADE_EXHAUSTED_UNPAID') evBadge = 'bg-rose-950 text-rose-300 border border-rose-500/50';

                    return (
                      <div key={idx} className="relative">
                        <div className="absolute -left-[23px] top-1 w-2.5 h-2.5 rounded-full bg-[#D4AF37] border-2 border-[#1C2541]" />
                        <div className="bg-[#0B132B] border border-slate-800 rounded-xl p-3 space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span className="font-mono">
                              {ev.timestamp ? new Date(ev.timestamp).toLocaleString('fr-FR') : 'Date non renseignée'}
                            </span>
                            <span className={`px-2 py-0.2 rounded font-mono uppercase font-bold text-[9px] ${evBadge}`}>
                              {ev.event || 'ÉVÉNEMENT'}
                            </span>
                          </div>
                          <p className="text-slate-200 text-xs font-sans leading-relaxed">
                            {ev.notes || ev.details || 'Événement enregistré'}
                          </p>
                          {(ev.adjudicatedPriceCents || ev.newFinalPriceCents || ev.amountCents || ev.collectedAmountCents) && (
                            <div className="pt-1 text-[11px] font-mono text-amber-300 flex items-center gap-3">
                              {ev.adjudicatedPriceCents && <span>Adjugé : {(ev.adjudicatedPriceCents / 100).toFixed(2)} €</span>}
                              {ev.newFinalPriceCents && <span>Nouveau retenu : {(ev.newFinalPriceCents / 100).toFixed(2)} €</span>}
                              {ev.collectedAmountCents && <span className="text-emerald-300">Encaissé : {(ev.collectedAmountCents / 100).toFixed(2)} €</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500 italic">
                  Aucun historique antérieur enregistré pour cette ligne financière.
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-700 flex justify-end">
              <button
                type="button"
                onClick={() => setViewFinanceHistoryItem(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
