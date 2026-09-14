import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { api, ApiError, configureApiAuth } from "../lib/api";
import type { SelfUser } from "../lib/contracts";
import { auth, googleProvider } from "../lib/firebase";

const SESSION_KEY = "nikahpath_session";

type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthContextValue {
  status: AuthStatus;
  user: SelfUser | null;
  /** Shown when the server reports the account as banned or suspended. */
  blockedMessage: string | null;
  loginWithPassword: (email: string, password: string) => Promise<SelfUser>;
  registerWithPassword: (email: string, password: string) => Promise<SelfUser>;
  signInWithGoogle: () => Promise<SelfUser>;
  logout: () => Promise<void>;
  /** Re-validates the session with the server and returns the fresh user. */
  refresh: () => Promise<SelfUser | null>;
  setUser: (user: SelfUser) => void;
  dismissBlocked: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSession(token: string | null): void {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable (private mode); the session lasts for this tab only.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUserState] = useState<SelfUser | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const clearSession = useCallback(async () => {
    writeSession(null);
    if (auth.currentUser) await signOut(auth).catch(() => undefined);
    setUserState(null);
    setStatus("anonymous");
  }, []);

  const handleAuthError = useCallback(
    async (err: unknown) => {
      if (err instanceof ApiError && (err.code === "ACCOUNT_BANNED" || err.code === "ACCOUNT_SUSPENDED")) {
        setBlockedMessage(err.message);
      }
      await clearSession();
    },
    [clearSession],
  );

  useEffect(() => {
    configureApiAuth(
      async () => (auth.currentUser ? auth.currentUser.getIdToken() : readSession()),
      (error) => void handleAuthError(error),
    );

    return onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          writeSession(null);
          const fresh = await api.firebaseSignIn(await firebaseUser.getIdToken());
          setUserState(fresh);
          setStatus("authenticated");
        } else if (readSession()) {
          setUserState(await api.me());
          setStatus("authenticated");
        } else {
          setUserState(null);
          setStatus("anonymous");
        }
      } catch (err) {
        if (err instanceof ApiError && err.status > 0 && err.status < 500) {
          await handleAuthError(err);
        } else {
          // Network/server outage: keep the stored session so a reload can recover.
          setUserState(null);
          setStatus("anonymous");
        }
      }
    });
  }, [handleAuthError]);

  const loginWithPassword = useCallback(async (identifier: string, password: string) => {
    const { token, user: fresh } = await api.login({ identifier, password });
    if (auth.currentUser) await signOut(auth);
    writeSession(token);
    setBlockedMessage(null);
    setUserState(fresh);
    setStatus("authenticated");
    return fresh;
  }, []);

  const registerWithPassword = useCallback(async (email: string, password: string) => {
    const { token, user: fresh } = await api.register({ email, password });
    if (auth.currentUser) await signOut(auth);
    writeSession(token);
    setUserState(fresh);
    setStatus("authenticated");
    return fresh;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const credential = await signInWithPopup(auth, googleProvider);
    writeSession(null);
    try {
      const fresh = await api.firebaseSignIn(await credential.user.getIdToken());
      setBlockedMessage(null);
      setUserState(fresh);
      setStatus("authenticated");
      return fresh;
    } catch (err) {
      await signOut(auth).catch(() => undefined);
      throw err;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const fresh = await api.me();
      setUserState(fresh);
      setStatus("authenticated");
      return fresh;
    } catch (err) {
      if (err instanceof ApiError && err.status > 0 && err.status < 500) await handleAuthError(err);
      return null;
    }
  }, [handleAuthError]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      blockedMessage,
      loginWithPassword,
      registerWithPassword,
      signInWithGoogle,
      logout: clearSession,
      refresh,
      setUser: setUserState,
      dismissBlocked: () => setBlockedMessage(null),
    }),
    [status, user, blockedMessage, loginWithPassword, registerWithPassword, signInWithGoogle, clearSession, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** For components rendered only inside authenticated routes. */
export function useCurrentUser(): SelfUser {
  const { user } = useAuth();
  if (!user) throw new Error("useCurrentUser requires an authenticated route");
  return user;
}
