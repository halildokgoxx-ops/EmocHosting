import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { apiRequest } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [bootstrap, setBootstrap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  const refreshBootstrap = useCallback(async () => {
    try {
      const data = await apiRequest('/api/public/bootstrap');
      setBootstrap(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setProfile(null);
      return null;
    }
    try {
      const data = await apiRequest('/api/auth/me');
      setProfile(data);
      setAuthError('');
      return data;
    } catch (err) {
      setAuthError(err.message);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshBootstrap();
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await refreshProfile();
        const pendingRef = localStorage.getItem('emoc_ref_code');
        if (pendingRef) {
          try {
            await apiRequest('/api/auth/claim-invite', { method: 'POST', body: { code: pendingRef } });
            await refreshProfile();
          } catch {}
          localStorage.removeItem('emoc_ref_code');
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [refreshBootstrap, refreshProfile]);

  async function login(email, password) {
    setAuthError('');
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await refreshProfile();
    return cred.user;
  }

  async function register({ email, password, displayName, referralCode, acceptedTerms, acceptedKvkk }) {
    if (!acceptedTerms || !acceptedKvkk) {
      throw new Error('Kayıt olabilmek için Hizmet Kullanım Şartları ve KVKK Aydınlatma Metnini onaylamanız zorunludur.');
    }
    setAuthError('');
    if (referralCode) {
      localStorage.setItem('emoc_ref_code', referralCode.trim().toUpperCase());
    }
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }
    await refreshProfile();
    await apiRequest('/api/auth/accept-legal', {
      method: 'POST',
      body: { acceptedTerms: true, acceptedKvkk: true },
    }).catch(() => {});
    if (referralCode) {
      try {
        await apiRequest('/api/auth/claim-invite', { method: 'POST', body: { code: referralCode } });
        localStorage.removeItem('emoc_ref_code');
      } catch {}
    }
    await refreshProfile();
    return cred.user;
  }

  async function loginWithGoogle({ acceptedLegal = false } = {}) {
    setAuthError('');
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const data = await refreshProfile();
    if (acceptedLegal || !data?.user?.acceptedTermsAt) {
      await apiRequest('/api/auth/accept-legal', {
        method: 'POST',
        body: { acceptedTerms: true, acceptedKvkk: true },
      }).catch(() => {});
      await refreshProfile();
    }
    return cred.user;
  }

  async function logout() {
    await signOut(auth);
    setProfile(null);
  }

  async function resetPassword(email) {
    await sendPasswordResetEmail(auth, email);
  }

  const user = profile?.user || null;
  const isAdmin = Boolean(user?.isAdmin);
  const isOwner = Boolean(user?.isOwner);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        user,
        profileData: profile,
        bootstrap,
        loading,
        authError,
        isAdmin,
        isOwner,
        login,
        register,
        loginWithGoogle,
        logout,
        resetPassword,
        refreshProfile,
        refreshBootstrap,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
