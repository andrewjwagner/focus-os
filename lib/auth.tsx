"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LOCAL_SESSION_KEY, allowedEmail, emailsMatch } from "./constants";
import { firebaseConfig, isFirebaseConfigured } from "./firebase";

export type Session = {
  email: string;
  source: "local" | "firebase";
};

type AuthState = {
  ready: boolean;
  session: Session | null;
  unauthorized: boolean;
  firebaseEnabled: boolean;
  allowed: string;
  error: string | null;
  signInLocal: (email: string) => void;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function readLocalSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!emailsMatch(parsed.email)) {
      window.localStorage.removeItem(LOCAL_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const firebaseEnabled = isFirebaseConfigured();
  const allowed = allowedEmail();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    async function boot() {
      if (!firebaseEnabled) {
        const local = readLocalSession();
        setSession(local);
        setUnauthorized(false);
        setReady(true);
        return;
      }

      const { initializeApp, getApps, getApp } = await import("firebase/app");
      const { getAuth, onAuthStateChanged } = await import("firebase/auth");
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig());
      const auth = getAuth(app);
      unsub = onAuthStateChanged(auth, (user) => {
        if (!user) {
          setSession(null);
          setUnauthorized(false);
          setReady(true);
          return;
        }
        if (!emailsMatch(user.email) || user.emailVerified === false) {
          setSession(null);
          setUnauthorized(true);
          setReady(true);
          return;
        }
        setUnauthorized(false);
        setSession({ email: user.email!, source: "firebase" });
        setReady(true);
      });
    }

    void boot();
    return () => unsub?.();
  }, [firebaseEnabled]);

  const signInLocal = useCallback((email: string) => {
    setError(null);
    if (!emailsMatch(email)) {
      setUnauthorized(true);
      setSession(null);
      return;
    }
    const next: Session = { email: email.trim().toLowerCase(), source: "local" };
    window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(next));
    setUnauthorized(false);
    setSession(next);
  }, []);

  const signInGoogle = useCallback(async () => {
    setError(null);
    if (!firebaseEnabled) return;
    const { initializeApp, getApps, getApp } = await import("firebase/app");
    const { getAuth, GoogleAuthProvider, signInWithPopup } = await import(
      "firebase/auth"
    );
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig());
    const auth = getAuth(app);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      if (
        !emailsMatch(result.user.email) ||
        result.user.emailVerified === false
      ) {
        await auth.signOut();
        setUnauthorized(true);
        setSession(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    }
  }, [firebaseEnabled]);

  const signOutUser = useCallback(async () => {
    window.localStorage.removeItem(LOCAL_SESSION_KEY);
    setSession(null);
    setUnauthorized(false);
    if (!firebaseEnabled) return;
    const { initializeApp, getApps, getApp } = await import("firebase/app");
    const { getAuth } = await import("firebase/auth");
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig());
    await getAuth(app).signOut();
  }, [firebaseEnabled]);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      unauthorized,
      firebaseEnabled,
      allowed,
      error,
      signInLocal,
      signInGoogle,
      signOut: signOutUser,
    }),
    [
      allowed,
      error,
      firebaseEnabled,
      ready,
      session,
      signInGoogle,
      signInLocal,
      signOutUser,
      unauthorized,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
