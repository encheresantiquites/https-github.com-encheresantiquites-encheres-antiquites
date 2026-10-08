import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { User } from '../types/index.ts';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  token: string | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithCredentials: (email: string, password: string) => Promise<any>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  switchSimulatedUser: (email: string) => Promise<void>;
  isSimulated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('enchere_auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('enchere_auth_token') || null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [isSimulated, setIsSimulated] = useState(() => {
    try {
      const saved = localStorage.getItem('enchere_auth_token');
      return Boolean(saved && (saved.startsWith('TOKEN_') || saved.startsWith('SIMULATED_')));
    } catch {
      return false;
    }
  });

  // Sync token to API caller
  const fetchDbUser = async (authToken: string) => {
    try {
      const res = await fetch('/api/me', {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        try {
          localStorage.setItem('enchere_auth_user', JSON.stringify(data.user));
        } catch {}
      }
    } catch (err) {
      console.error('Erreur chargement profil utilisateur:', err);
    }
  };

  // Au chargement ou rafraîchissement de page, synchroniser le profil si token présent
  useEffect(() => {
    const savedToken = localStorage.getItem('enchere_auth_token');
    if (savedToken) {
      fetchDbUser(savedToken);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      const savedToken = localStorage.getItem('enchere_auth_token');
      if (savedToken && (savedToken.startsWith('TOKEN_') || savedToken.startsWith('SIMULATED_'))) {
        return;
      }

      if (fbUser) {
        setFirebaseUser(fbUser);
        try {
          const idToken = await fbUser.getIdToken();
          setToken(idToken);
          localStorage.setItem('enchere_auth_token', idToken);
          await fetchDbUser(idToken);
        } catch (e) {
          console.error('Erreur obtention token:', e);
        }
      } else {
        if (!savedToken) {
          setFirebaseUser(null);
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isSimulated]);

  const loginWithGoogle = async () => {
    try {
      setIsSimulated(false);
      setLoading(true);
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      setToken(idToken);
      localStorage.setItem('enchere_auth_token', idToken);
      setFirebaseUser(cred.user);
      await fetchDbUser(idToken);
    } catch (err: any) {
      console.error('Erreur connexion Google:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const loginWithCredentials = async (email: string, password: string) => {
    try {
      setLoading(true);
      const cleanEmail = email.toLowerCase().trim();
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Identifiants invalides');
      }

      setToken(data.token);
      setUser(data.user);
      setIsSimulated(true);
      try {
        localStorage.setItem('enchere_auth_token', data.token);
        localStorage.setItem('enchere_auth_user', JSON.stringify(data.user));
      } catch {}
      return data.user;
    } catch (err: any) {
      console.error('Erreur login credentials:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {}
    setFirebaseUser(null);
    setToken(null);
    setUser(null);
    setIsSimulated(false);
    try {
      localStorage.removeItem('enchere_auth_token');
      localStorage.removeItem('enchere_auth_user');
      localStorage.removeItem('enchere_current_tab');
    } catch {}
  };

  const refreshUser = async () => {
    if (token) {
      await fetchDbUser(token);
    }
  };

  // Permet de basculer de rôle instantanément lors des tests ou de l'évaluation
  const switchSimulatedUser = async (email: string) => {
    if (!email) {
      // Déconnexion visiteur
      setUser(null);
      setToken(null);
      setFirebaseUser(null);
      setIsSimulated(false);
      return;
    }

    try {
      setLoading(true);
      setIsSimulated(true);
      // Récupérer le token de session simulé ou créer une session test
      const res = await fetch(`/api/admin/clients`);
      // Simuler l'authentification directe pour les tests rapides
      // Pour les requêtes API, on associe un token de contournement réservé au dev
      const fakeToken = `SIMULATED_${btoa(email)}`;
      setToken(fakeToken);

      // Charger l'utilisateur correspondant
      const userRes = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${fakeToken}` },
      });
      if (userRes.ok) {
        const data = await userRes.json();
        setUser(data.user);
        try {
          localStorage.setItem('enchere_auth_token', fakeToken);
          localStorage.setItem('enchere_auth_user', JSON.stringify(data.user));
        } catch {}
      }
    } catch (e) {
      console.error('Erreur simulation:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        token,
        loading,
        loginWithGoogle,
        loginWithCredentials,
        logout,
        refreshUser,
        switchSimulatedUser,
        isSimulated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé à l’intérieur d’un AuthProvider');
  }
  return context;
};
