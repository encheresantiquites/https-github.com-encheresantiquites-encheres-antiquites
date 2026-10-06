import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { FavoritesProvider } from './context/FavoritesContext.tsx';
import { ChatProvider } from './context/ChatContext.tsx';
import { RealtimeProvider, useRealtime } from './context/RealtimeContext.tsx';
import { NotificationProvider, useNotifications } from './context/NotificationContext.tsx';
import { Navbar } from './components/Navbar.tsx';
import { LotCard } from './components/LotCard.tsx';
import { LotDetailModal } from './components/LotDetailModal.tsx';
import { HowItWorksModal } from './components/HowItWorksModal.tsx';
import { RegistrationModal } from './components/RegistrationModal.tsx';
import { CustomerSpace } from './components/CustomerSpace.tsx';
import { AdminBackoffice } from './components/AdminBackoffice.tsx';
import { LoginModal } from './components/LoginModal.tsx';
import { LiveChatWidget } from './components/LiveChatWidget.tsx';
import { PWAInstallBanner } from './components/PWAInstallBanner.tsx';
import { PWAInstallModal } from './components/PWAInstallModal.tsx';
import { NotificationPreferencesModal } from './components/NotificationPreferencesModal.tsx';
import { Lot } from './types/index.ts';
import {
  Gavel,
  ShieldCheck,
  Sparkles,
  Info,
  Clock,
  CheckCircle2,
  Calendar,
  Archive,
  ArrowLeft,
  Truck,
} from 'lucide-react';

type LotFilter = 'current' | 'ended' | 'upcoming';

function AppContent() {
  const { user, token } = useAuth();
  const { lastBidEvent, isConnected, activeViewersCount } = useRealtime();
  const { checkLotsAlerts, setIsModalOpen: setIsNotificationModalOpen } = useNotifications();
  const [currentTab, setCurrentTab] = useState<'home' | 'customer' | 'admin'>('home');
  const [lots, setLots] = useState<Lot[]>([]);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loadingLots, setLoadingLots] = useState(true);
  const [pwaModalOpen, setPwaModalOpen] = useState(false);

  // Strictly 3 tabs as requested by the user: "enchère en cours", "enchères terminées", "Prochaine enchères"
  const [lotFilter, setLotFilter] = useState<LotFilter>('current');

  const loadLots = async (filter: LotFilter) => {
    try {
      setLoadingLots(true);
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/lots?filter=${filter}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setLots(data.lots || []);
      }
    } catch (e) {
      console.error('Erreur chargement des lots:', e);
    } finally {
      setLoadingLots(false);
    }
  };

  useEffect(() => {
    loadLots(lotFilter);
  }, [lotFilter, token]);

  // Si l'utilisateur clique sur une notification de lot (/?lotId=...), ouvrir directement la fiche du lot
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lotIdParam = params.get('lotId');
    if (lotIdParam && lots.length > 0) {
      const found = lots.find((l) => l.id === parseInt(lotIdParam));
      if (found) {
        setSelectedLot(found);
      }
    }
  }, [lots]);

  // Vérification périodique des alertes (dernière heure de vente, favoris expirants)
  useEffect(() => {
    if (lots.length > 0) {
      checkLotsAlerts(lots);
      const interval = setInterval(() => {
        checkLotsAlerts(lots);
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [lots, checkLotsAlerts]);

  // Synchronisation multi-utilisateurs instantanée : mise à jour immédiate sur chaque téléphone
  useEffect(() => {
    if (!lastBidEvent) return;
    setLots((prevLots) =>
      prevLots.map((l) => {
        if (l.id === lastBidEvent.lotId) {
          const isWinner = user ? lastBidEvent.winningUserId === user.id : false;
          return {
            ...l,
            currentPriceCents: lastBidEvent.currentPriceCents,
            bidCount: lastBidEvent.bidCount,
            endsAt: lastBidEvent.endsAt,
            isWinning: isWinner,
          };
        }
        return l;
      })
    );
  }, [lastBidEvent, user]);

  return (
    <div className="min-h-screen bg-[#070B19] text-slate-100 flex flex-col font-sans selection:bg-[#D4AF37] selection:text-slate-950">
      {/* Navigation */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onOpenHowItWorks={() => setHowItWorksOpen(true)}
        onOpenLogin={() => setLoginOpen(true)}
        onOpenInstallModal={() => setPwaModalOpen(true)}
        onOpenNotificationsModal={() => setIsNotificationModalOpen(true)}
      />

      {/* Main Tab Views with Return Buttons */}
      {currentTab === 'customer' && (
        <CustomerSpace onBack={() => setCurrentTab('home')} />
      )}

      {currentTab === 'admin' && (
        user?.role === 'ADMIN' ? (
          <AdminBackoffice onBack={() => setCurrentTab('home')} />
        ) : (
          <div className="max-w-md mx-auto my-20 p-8 bg-[#1C2541] rounded-2xl border border-rose-500/40 text-center">
            <h2 className="text-xl font-serif font-bold text-rose-300 mb-2">Accès restreint</h2>
            <p className="text-xs text-slate-300 mb-4">
              Cet espace est strictement réservé à l'administrateur vendeur de la plateforme.
            </p>
            <button
              onClick={() => setCurrentTab('home')}
              className="bg-[#D4AF37] hover:bg-[#E5C158] text-slate-950 px-4 py-2 rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>← Retour aux enchères</span>
            </button>
          </div>
        )
      )}

      {currentTab === 'home' && (
        <main className="flex-1">
          {/* Hero Section */}
          <section className="relative overflow-hidden pt-8 pb-6 md:pt-12 md:pb-8 border-b border-[#D4AF37]/20">
            {/* Background texture */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1C2541]/70 via-[#0B132B]/90 to-[#070B19] -z-10"></div>
            <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none -z-10"></div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="max-w-3xl space-y-4">
                <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-50 leading-[1.15]">
                  Enchère Antiquités
                </h1>

                {/* Seller Presentation (Débute par : Je suis un vendeur particulier disposant...) */}
                <div className="bg-[#1C2541]/70 border-l-4 border-[#D4AF37] p-4 sm:p-5 rounded-r-xl text-slate-200 text-sm sm:text-base leading-relaxed space-y-2">
                  <p className="italic font-serif text-amber-100">
                    « Je suis un vendeur particulier disposant de plusieurs centaines d’objets issus de collections familiales héritées de mes grands-parents et de mes parents, qui étaient collectionneurs.
                  </p>
                  <p className="text-xs sm:text-sm text-slate-300">
                    Je propose progressivement ces pièces authentiques à des professionnels du secteur de l’antiquité et de la brocante en France et en Belgique. »
                  </p>
                  <div className="pt-1 text-xs text-[#D4AF37] font-semibold flex items-center gap-2">
                    <span>— Monsieur De Coster</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-400 font-normal">Vendeur Particulier</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Bannière PWA & Notifications d'alertes */}
          <PWAInstallBanner
            onOpenInstallModal={() => setPwaModalOpen(true)}
            onOpenNotificationsModal={() => setIsNotificationModalOpen(true)}
          />

          {/* Catalog Section with the 3 requested tabs */}
          <section id="catalogue" className="pt-6 pb-12 md:pt-8 md:pb-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Header & The 3 Distinct Tabs */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-slate-800 pb-5">
                <div>
                  <span className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold block">
                    CATALOGUE DES OBJETS
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-serif font-bold text-slate-100 mt-0.5">
                    {lotFilter === 'current'
                      ? 'Enchères en cours'
                      : lotFilter === 'ended'
                      ? 'Enchères terminées'
                      : 'Prochaines enchères'}
                  </h2>
                </div>

                {/* THE 3 EXCLUSIVE TABS REQUESTED:
                    1. Enchères en cours
                    2. Enchères terminées
                    3. Prochaines enchères */}
                <div className="inline-flex p-1 bg-[#1C2541] border border-slate-800 rounded-xl shadow-inner gap-1">
                  <button
                    onClick={() => setLotFilter('current')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      lotFilter === 'current'
                        ? 'bg-[#D4AF37] text-slate-950 shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Gavel className="w-3.5 h-3.5" />
                    <span>Enchères en cours</span>
                  </button>

                  <button
                    onClick={() => setLotFilter('ended')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      lotFilter === 'ended'
                        ? 'bg-[#D4AF37] text-slate-950 shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Enchères terminées</span>
                  </button>

                  <button
                    onClick={() => setLotFilter('upcoming')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      lotFilter === 'upcoming'
                        ? 'bg-[#D4AF37] text-slate-950 shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Prochaines enchères</span>
                  </button>
                </div>
              </div>

              {/* Grid of Lots */}
              {loadingLots ? (
                <div className="text-center py-20">
                  <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-slate-400 text-xs">Chargement des objets d'art...</p>
                </div>
              ) : lots.length === 0 ? (
                <div className="bg-[#1C2541]/50 border border-slate-800 rounded-2xl p-12 text-center my-8">
                  <Gavel className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <h3 className="font-serif font-bold text-slate-200 text-base mb-1">
                    Aucun objet dans cette section pour le moment
                  </h3>
                  <p className="text-xs text-slate-400">
                    Consultez l'onglet « Enchères en cours » pour voir les pièces actives actuellement.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                  {lots.map((lot) => (
                    <LotCard key={lot.id} lot={lot} onSelect={(l) => setSelectedLot(l)} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Heritage Story & Authentic Provenance */}
          <section className="bg-[#0B132B] py-16 border-t border-b border-slate-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="space-y-4">
                  <span className="text-xs uppercase tracking-widest text-[#D4AF37] font-semibold block">
                    TRANSMISSION PATRIMONIALE
                  </span>
                  <h2 className="font-serif text-2xl sm:text-3xl font-bold text-amber-100 leading-snug">
                    L'Origine de nos Collections Familiales
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Constituée avec passion sur plus de six décennies par nos aïeux en région lilloise et en Belgique, cette collection rassemble une grande diversité d’antiquités, d'objets d’art, d'éléments décoratifs et de pièces de collection d’époques variées.
                  </p>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Chaque objet fait l'objet d'un constat d'état minutieux. Les pièces sont expédiées sous emballage protecteur blindé par transporteur spécialisé sécurisé (pas de remise en main propre).
                  </p>

                  <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                    <div className="bg-[#1C2541] p-3 rounded-xl border border-slate-800">
                      <span className="block text-xl font-bold font-serif text-[#D4AF37]">100%</span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                        Succession Directe
                      </span>
                    </div>
                    <div className="bg-[#1C2541] p-3 rounded-xl border border-slate-800 flex flex-col justify-center">
                      <span className="block text-lg sm:text-xl font-bold font-serif text-[#D4AF37]">Semaine</span>
                      <span className="text-[10px] text-amber-200/90 font-medium">
                        (du lundi 12h au dimanche 22h)
                      </span>
                    </div>
                    <div className="bg-[#1C2541] p-3 rounded-xl border border-slate-800">
                      <span className="block text-xl font-bold font-serif text-[#D4AF37]">0 %</span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                        Frais d'adjudication
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* Footer */}
      <footer className="bg-[#050811] border-t border-slate-800 text-slate-400 py-12 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Gavel className="w-5 h-5 text-[#D4AF37]" />
                <span className="font-serif font-bold text-slate-100 text-sm tracking-wider">
                  ENCHÈRES-ANTIQUITÉS
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Plateforme d'enchères d'objets d'art de successions familiales réservée aux professionnels de l'antiquité et de la brocante.
              </p>
              <div className="text-[11px] text-amber-300/90 font-medium">
                Vendeur particulier : Monsieur De Coster
              </div>
            </div>

            <div>
              <h4 className="font-serif font-bold text-slate-200 mb-3 text-xs uppercase tracking-wider">
                Règles des Enchères
              </h4>
              <ul className="space-y-2 text-[11px]">
                <li>• Moteur à montant maximum confidentiel</li>
                <li>• Prolongation Anti-Snipe de 2 minutes</li>
                <li>• Pas d'enchère anonyme (comptes vérifiés)</li>
                <li>• Clôture sécurisée automatique</li>
              </ul>
            </div>

            <div>
              <h4 className="font-serif font-bold text-slate-200 mb-3 text-xs uppercase tracking-wider">
                Cadre Juridique & Paiement
              </h4>
              <ul className="space-y-2 text-[11px]">
                <li>• Règlement direct sécurisé PayPal Business</li>
                <li>• Reçu officiel de confirmation de transaction</li>
                <li>• Vendeur particulier (Non assujetti à TVA)</li>
                <li>• Conforme réglementation européenne</li>
              </ul>
            </div>

            <div>
              <h4 className="font-serif font-bold text-slate-200 mb-3 text-xs uppercase tracking-wider">
                Expédition Sécurisée
              </h4>
              <p className="text-[11px] leading-relaxed mb-2">
                Emballage sous protection renforcée et expédition recommandée par transporteur avec assurance intégrale ad valorem. <strong>Pas de remise en main propre.</strong>
              </p>
              <div className="text-[11px] text-amber-300/90 font-mono">
                Contact : contact@encheres-antiquites.com
              </div>
            </div>
          </div>

          <div className="border-t border-slate-900 pt-6 flex flex-wrap items-center justify-between text-[11px] text-slate-500">
            <div>
              © 2026 Enchères-Antiquités • Monsieur De Coster — Tous droits réservés. Cession entre particulier et professionnels.
            </div>
            <div className="flex gap-4">
              <button onClick={() => setHowItWorksOpen(true)} className="hover:text-slate-300">
                Comment ça marche
              </button>
              <span>•</span>
              <span className="text-slate-500">Conditions de participation v1.0</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Lot Inspection Modal with Return Button */}
      {selectedLot && (
        <LotDetailModal
          lotId={selectedLot.id}
          onClose={() => setSelectedLot(null)}
          onBidSuccess={() => loadLots(lotFilter)}
          onOpenLogin={() => setLoginOpen(true)}
          onSelectLot={(newLot) => setSelectedLot(newLot)}
          allLots={lots}
        />
      )}

      {/* How it Works Modal */}
      {howItWorksOpen && (
        <HowItWorksModal
          onClose={() => setHowItWorksOpen(false)}
          onOpenRegister={() => setRegisterOpen(true)}
        />
      )}

      {/* Login Modal with direct email & password and link to registration */}
      {loginOpen && (
        <LoginModal
          onClose={() => setLoginOpen(false)}
          onOpenRegister={() => {
            setLoginOpen(false);
            setRegisterOpen(true);
          }}
          onLoginSuccess={() => {
            setLoginOpen(false);
            setCurrentTab('customer');
          }}
        />
      )}

      {/* Registration Modal with Captcha & Return Button */}
      {registerOpen && (
        <RegistrationModal
          onClose={() => setRegisterOpen(false)}
          onSuccess={() => {
            setRegisterOpen(false);
            setCurrentTab('customer');
          }}
        />
      )}

      {/* PWA Mobile Installation Modal */}
      <PWAInstallModal
        isOpen={pwaModalOpen}
        onClose={() => setPwaModalOpen(false)}
        onOpenNotifications={() => setIsNotificationModalOpen(true)}
      />

      {/* Notification Preferences Modal */}
      <NotificationPreferencesModal />

      {/* Floating Live Chat Widget (9h - 17h Lun-Ven) */}
      <LiveChatWidget />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FavoritesProvider>
        <NotificationProvider>
          <RealtimeProvider>
            <ChatProvider>
              <AppContent />
            </ChatProvider>
          </RealtimeProvider>
        </NotificationProvider>
      </FavoritesProvider>
    </AuthProvider>
  );
}
