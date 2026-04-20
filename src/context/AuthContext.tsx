import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { auth } from "../lib/firebase";
import type { User as DbUser, UserRole } from "../lib/schema";

const JWT_KEY = "nikahpath_jwt";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SyncOptions {
  phone?: string;
  displayName?: string;
  gender?: string;
  age?: number;
  location?: string;
  requiresParentalVetting?: boolean;
}

export type ProfileCompat = DbUser & {
  uid: string;
  displayName?: string;
  gender?: string;
  isIntroCompleted?: boolean;
  photoUrl?: string;
  completedModules?: string[];
};

export interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  dbUser: DbUser | null;
  setDbUser: React.Dispatch<React.SetStateAction<DbUser | null>>;
  loading: boolean;
  /** The stable UID — use this everywhere instead of firebaseUser.uid */
  currentUid: string | null;
  syncUser: (role: UserRole, options?: SyncOptions) => Promise<DbUser | null>;
  /** Call after a successful /api/auth/login or /api/auth/register response */
  loginWithJwt: (token: string, user: DbUser) => void;
  logout: () => void;
  user: FirebaseUser | null;
  profile: ProfileCompat | null;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  dbUser: null,
  setDbUser: () => {},
  loading: true,
  currentUid: null,
  syncUser: async () => null,
  loginWithJwt: () => {},
  logout: () => {},
  user: null,
  profile: null,
});

export const useAuth = () => useContext(AuthContext);

// ─── Provider ──────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, check for a stored JWT (email/password users)
  useEffect(() => {
    const token = localStorage.getItem(JWT_KEY);
    if (token) {
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(user => { if (user) setDbUser(user); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    // Firebase listener handles the rest (Google OAuth users)
  }, []);

  // Firebase auth state — for Google OAuth users
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (!fbUser) {
        // Only set loading=false if no JWT session is active
        if (!localStorage.getItem(JWT_KEY)) setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/users/me?firebaseUid=${encodeURIComponent(fbUser.uid)}`);
        if (res.ok) setDbUser(await res.json());
        else setDbUser(null);
      } catch {
        setDbUser(null);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const loginWithJwt = (token: string, user: DbUser) => {
    localStorage.setItem(JWT_KEY, token);
    setDbUser(user);
  };

  const logout = async () => {
    localStorage.removeItem(JWT_KEY);
    setDbUser(null);
    if (firebaseUser) {
      await auth.signOut();
      setFirebaseUser(null);
    }
  };

  /** Syncs a Google OAuth user into Neon after onboarding */
  const syncUser = async (role: UserRole, options?: SyncOptions): Promise<DbUser | null> => {
    const currentUser = auth.currentUser ?? firebaseUser;
    if (!currentUser) return null;
    const email = currentUser.email;
    if (!email) return null;

    try {
      const res = await fetch("/api/users/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firebaseUid: currentUser.uid,
          email,
          role,
          phone: options?.phone,
          displayName: options?.displayName,
          gender: options?.gender,
          age: options?.age,
          location: options?.location,
          requiresParentalVetting: options?.requiresParentalVetting ?? false,
        }),
      });
      if (!res.ok) {
        console.error("[syncUser] error", res.status, await res.text().catch(() => ""));
        return null;
      }
      const user: DbUser = await res.json();
      setDbUser(user);
      return user;
    } catch (err) {
      console.error("[syncUser] fetch failed", err);
      return null;
    }
  };

  // The stable UID to use in all API calls
  const currentUid = dbUser?.firebaseUid ?? firebaseUser?.uid ?? null;

  const profile: ProfileCompat | null =
    dbUser ? { ...dbUser, uid: currentUid ?? "" } : null;

  return (
    <AuthContext.Provider value={{
      firebaseUser,
      dbUser,
      setDbUser,
      loading,
      currentUid,
      syncUser,
      loginWithJwt,
      logout,
      user: firebaseUser,
      profile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

