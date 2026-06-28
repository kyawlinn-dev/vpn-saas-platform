import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';

interface AdminUser {
  id: string;
  email: string;
}

interface AdminInfo {
  name: string;
  email: string;
}

interface AdminAuthContextValue {
  isAuthenticated: boolean;
  initializing: boolean;
  user: AdminUser | null;
  admin: AdminInfo | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [admin, setAdmin] = useState<AdminInfo | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const res = await api.get('/admin/auth/me');
      setUser(res.data.user as AdminUser);
      setAdmin(res.data.admin as AdminInfo);
      setIsAuthenticated(true);
    } catch {
      setUser(null);
      setAdmin(null);
      setIsAuthenticated(false);
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post('/admin/auth/login', { email, password });
    setUser(res.data.user as AdminUser);
    setAdmin(res.data.admin as AdminInfo);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/admin/auth/logout');
    } catch {
      // clear local state regardless of network failure
    }
    setUser(null);
    setAdmin(null);
    setIsAuthenticated(false);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, initializing, user, admin, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return ctx;
}
