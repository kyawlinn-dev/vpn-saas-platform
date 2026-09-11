import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "../lib/api";

// localStorage key that tracks the currently-authenticated reseller's Supabase
// user ID. Written on login / session-check; cleared on logout. Listened to via
// the `storage` event so that when ANOTHER browser tab logs in as a different
// reseller, this tab reloads and picks up the new session — preventing stale
// data from the previous account appearing on screen.
const SESSION_UID_KEY = "rnv_uid";

interface AuthContextValue {
  isAuthenticated: boolean;
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function ResellerAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Always holds the Supabase user ID of the session this tab considers active.
  // Using a ref so the storage-event handler always reads the live value without
  // being captured in a stale closure.
  const sessionUidRef = useRef<string | null>(null);

  // Write (or clear) the session UID to both the ref and localStorage.
  const setSessionUid = useCallback((uid: string | null) => {
    sessionUidRef.current = uid;
    try {
      if (uid) {
        localStorage.setItem(SESSION_UID_KEY, uid);
      } else {
        localStorage.removeItem(SESSION_UID_KEY);
      }
    } catch {
      // localStorage may be unavailable (private mode, quota exceeded) — ignore.
    }
  }, []);

  // Cross-tab session-switch detection. When another tab logs in as a different
  // reseller (or logs out), `localStorage[SESSION_UID_KEY]` changes and the
  // `storage` event fires here. Reload so this tab re-checks its session.
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== SESSION_UID_KEY) return;
      if (e.newValue !== sessionUidRef.current) {
        window.location.reload();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Initial session check on mount.
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await api.get("/auth/reseller/me");
        const uid: string | null = res.data?.user?.id ?? null;
        setSessionUid(uid);
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
      } finally {
        setInitializing(false);
      }
    };

    void checkSession();
  }, [setSessionUid]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post("/auth/reseller/login", { email, password });
    const uid: string | null = res.data?.user?.id ?? null;
    setSessionUid(uid);
    setIsAuthenticated(true);
  }, [setSessionUid]);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/reseller/logout");
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setSessionUid(null);
      setIsAuthenticated(false);
    }
  }, [setSessionUid]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      initializing,
      login,
      logout,
    }),
    [isAuthenticated, initializing, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useResellerAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useResellerAuth must be used inside ResellerAuthProvider");
  }
  return context;
}
