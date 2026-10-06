import React from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useRealtime } from '../context/RealtimeContext.tsx';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import {
  Gavel,
  ShieldCheck,
  User,
  LogOut,
  Building,
  KeyRound,
  Info,
  Clock,
  Sparkles,
  Bell,
  Smartphone,
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: 'home' | 'customer' | 'admin') => void;
  onOpenHowItWorks: () => void;
  onOpenLogin: () => void;
  onOpenInstallModal?: () => void;
  onOpenNotificationsModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  onOpenHowItWorks,
  onOpenLogin,
  onOpenInstallModal,
  onOpenNotificationsModal,
}) => {
  const { user, logout } = useAuth();
  const { isConnected, activeViewersCount } = useRealtime();
  const { isInstalled } = usePWAInstall();

  const getStatusBadge = () => {
    if (!user) return null;
    if (user.role === 'ADMIN') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-900/60 text-amber-200 border border-amber-600/40">
          <KeyRound className="w-3 h-3 text-amber-400" />
          Administrateur / Vendeur
        </span>
      );
    }
    if (user.status === 'APPROVED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-600/40">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          Pro Validé
        </span>
      );
    }
    if (user.status === 'PENDING') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-950/80 text-amber-300 border border-amber-600/40">
          <Clock className="w-3 h-3 text-amber-400" />
          En attente de validation
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-950/80 text-rose-300 border border-rose-600/40">
        Compte restreint
      </span>
    );
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0B132B]/95 backdrop-blur-md border-b border-[#D4AF37]/20 text-slate-100 shadow-xl">
      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand without subtitle */}
        <div
          onClick={() => setCurrentTab('home')}
          className="cursor-pointer flex items-center gap-3 group"
        >
          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#D4AF37] to-[#996515] p-0.5 shadow-lg group-hover:shadow-amber-500/20 transition-all">
            <div className="w-full h-full bg-[#0B132B] rounded-[7px] flex items-center justify-center">
              <Gavel className="w-6 h-6 text-[#D4AF37]" />
            </div>
          </div>
          <div>
            <span className="block font-serif text-xl sm:text-2xl font-bold tracking-wider text-amber-100 group-hover:text-amber-200 transition-colors">
              Enchères-Antiquités
            </span>
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span>En direct multi-utilisateurs ({activeViewersCount} connectés)</span>
            </div>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="hidden md:flex items-center gap-4 text-sm font-medium">
          {currentTab !== 'home' && (
            <button
              onClick={() => setCurrentTab('home')}
              className="text-amber-300 hover:text-white flex items-center gap-1.5 transition-colors font-semibold bg-slate-800/80 px-3 py-1.5 rounded-lg border border-amber-500/30 cursor-pointer"
            >
              <span>← Retour aux enchères</span>
            </button>
          )}

          {/* Bouton avec le marteau : Consulter les enchères */}
          <button
            onClick={() => {
              if (currentTab !== 'home') setCurrentTab('home');
              setTimeout(() => {
                const el = document.getElementById('catalogue');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 50);
            }}
            className="flex items-center gap-2 bg-[#1C2541] hover:bg-slate-800 text-amber-200 hover:text-white font-medium px-3.5 py-2 rounded-lg text-sm border border-[#D4AF37]/40 shadow-md transition-all font-sans cursor-pointer"
          >
            <Gavel className="w-4 h-4 text-[#D4AF37]" />
            <span>Consulter les enchères</span>
          </button>

          {/* "Comment ça marche" dans une case comme Connexion Professionnelle */}
          <button
            onClick={onOpenHowItWorks}
            className="flex items-center gap-2 bg-[#1C2541] hover:bg-slate-800 text-amber-200 hover:text-white font-medium px-3.5 py-2 rounded-lg text-sm border border-[#D4AF37]/40 shadow-md transition-all font-sans cursor-pointer"
          >
            <Info className="w-4 h-4 text-[#D4AF37]" />
            <span>Comment ça marche</span>
          </button>

          {user && (
            <button
              onClick={() => setCurrentTab('customer')}
              className={`transition-colors py-2 px-1 border-b-2 flex items-center gap-1.5 cursor-pointer ${
                currentTab === 'customer'
                  ? 'border-[#D4AF37] text-amber-200 font-semibold'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              <Building className="w-4 h-4 text-amber-400" />
              Espace Pro
            </button>
          )}

          {user?.role === 'ADMIN' && (
            <button
              onClick={() => setCurrentTab('admin')}
              className={`transition-colors py-2 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 shadow cursor-pointer ${
                currentTab === 'admin'
                  ? 'bg-[#D4AF37] text-slate-950 shadow-amber-500/20'
                  : 'bg-amber-950/80 text-amber-200 border border-amber-600/40 hover:bg-amber-900/90'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              Administration
            </button>
          )}
        </nav>

        {/* User / Authentication actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Bouton Cloche / Notifications */}
          {onOpenNotificationsModal && (
            <button
              type="button"
              onClick={onOpenNotificationsModal}
              className="p-2 rounded-lg bg-[#1C2541] hover:bg-slate-800 text-amber-300 hover:text-white border border-[#D4AF37]/30 transition-colors cursor-pointer relative"
              title="Régler mes alertes et notifications par objet"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400"></span>
            </button>
          )}

          {/* Bouton Installer l'application */}
          {!isInstalled && onOpenInstallModal && (
            <button
              type="button"
              onClick={onOpenInstallModal}
              className="hidden sm:flex items-center gap-1.5 bg-[#1C2541] hover:bg-[#D4AF37] text-amber-200 hover:text-slate-950 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#D4AF37]/40 shadow transition-all cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Installer l'app</span>
            </button>
          )}

          {/* Visible on mobile if not in desktop nav */}
          <button
            onClick={onOpenHowItWorks}
            className="md:hidden flex items-center gap-1.5 bg-[#1C2541] text-amber-200 px-2.5 py-1.5 rounded-lg text-xs border border-[#D4AF37]/40 font-medium"
          >
            <Info className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Aide</span>
          </button>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-medium text-slate-200">
                  {user.firstName || user.companyName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.companyName : user.email}
                </span>
                <div className="mt-0.5">{getStatusBadge()}</div>
              </div>

              <button
                onClick={() => setCurrentTab(user.role === 'ADMIN' ? 'admin' : 'customer')}
                className="w-10 h-10 rounded-full bg-slate-800 border border-amber-500/40 flex items-center justify-center hover:bg-slate-700 transition-colors cursor-pointer"
                title="Mon profil"
              >
                <User className="w-5 h-5 text-amber-300" />
              </button>

              <button
                onClick={logout}
                className="p-2 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                title="Déconnexion"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenLogin}
              className="flex items-center gap-2 bg-gradient-to-r from-[#D4AF37] to-[#B38728] hover:from-[#E5C158] hover:to-[#C59B3C] text-slate-950 font-medium px-4 py-2 rounded-lg text-sm shadow-md transition-all font-sans cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-slate-950" />
              <span>Connexion Professionnelle</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
