import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { auth } from "../lib/firebase";
import type { User as DbUser, UserRole } from "../lib/schema";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SyncOptions {
  phone?: string;
  displayName?: string;
  gender?: string;
  age?: number;
  location?: string;
  requiresParentalVetting?: boolean;
}

/**
 * DbUser extended with `uid` (= firebaseUid) so existing Firestore-based
 * components that destructure `profile.uid` keep working.
 *
 * The optional legacy fields below existed in the old Firestore schema.
 * They are `undefined` after migrating to Neon and should be removed from
 * each component as it is migrated over.
 */
export type ProfileCompat = DbUser & {
  uid: string;
  // ── Legacy Firestore fields (deprecated — remove per-component as migrated) ──
  displayName?: string;
  gender?: string;
  isIntroCompleted?: boolean;
  photoUrl?: string;
  completedModules?: string[];
};

export interface AuthContextType {
  // ── New canonical API ──────────────────────────────────────────────────
  firebaseUser: FirebaseUser | null;
  /** Full Neon DB row. Null until the user completes onboarding. */
  dbUser: DbUser | null;
  /** Allows components to update the cached dbUser after a profile mutation */
  setDbUser: React.Dispatch<React.SetStateAction<DbUser | null>>;
  loading: boolean;
  /**
   * Call after Firebase auth to upsert the user in Neon.
   * Returns the saved DbUser so callers can immediately route.
   */
  syncUser: (role: UserRole, options?: SyncOptions) => Promise<DbUser | null>;

  // ── Backward-compat shims (for components not yet migrated) ───────────
  /** Alias for firebaseUser */
  user: FirebaseUser | null;
  /**
   * Alias for dbUser, augmented with `uid = firebaseUser.uid`
   * so legacy `profile.uid` reads still resolve to the Firebase UID.
   */
  profile: ProfileCompat | null;
}

const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  dbUser: null,
  setDbUser: () => {},
  loading: true,
  syncUser: async () => null,
  user: null,
  profile: null,
});

export const useAuth = () => useContext(AuthContext);

// ─── Provider ──────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen to Firebase auth state; whenever a user is present, fetch their
  // Neon profile so the rest of the app knows their role immediately.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (!fbUser) {
        setDbUser(null);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/users/me?firebaseUid=${encodeURIComponent(fbUser.uid)}`
        );
        if (res.ok) {
          setDbUser(await res.json());
        } else {
          // 404 = user authenticated with Firebase but hasn't completed onboarding
          setDbUser(null);
        }
      } catch {
        setDbUser(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  /**
   * Upsert the current Firebase user into Neon.
   * Call this at the end of the onboarding form submission.
   */
  const syncUser = async (
    role: UserRole,
    options?: SyncOptions
  ): Promise<DbUser | null> => {
    // Use auth.currentUser as the authoritative source to avoid React state timing issues
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
        console.error("[syncUser] server error", res.status, await res.text().catch(() => ''));
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

  // Build the backward-compat profile shim
  const profile: ProfileCompat | null =
    dbUser && firebaseUser ? { ...dbUser, uid: firebaseUser.uid } : null;

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        dbUser,
        setDbUser,
        loading,
        syncUser,
        user: firebaseUser,
        profile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
