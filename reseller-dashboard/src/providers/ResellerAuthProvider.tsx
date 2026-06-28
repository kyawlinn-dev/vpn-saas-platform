import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../lib/api";

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

  useEffect(() => {
    const checkSession = async () => {
      try {
        await api.get("/auth/reseller/me");
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
      } finally {
        setInitializing(false);
      }
    };

    void checkSession();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await api.post("/auth/reseller/login", {
      email,
      password,
    });

    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/reseller/logout");
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setIsAuthenticated(false);
    }
  }, []);

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