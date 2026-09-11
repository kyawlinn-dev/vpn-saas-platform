import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useResellerAuth } from "../providers/ResellerAuthProvider";

export interface ResellerProfile {
  id: string;
  name: string;
  email: string;
  supabase_user_id?: string;
  commission_percent?: number;
  status?: string;
  has_miniapp?: boolean;
}

export function useResellerProfile() {
  const { isAuthenticated, initializing, logout } = useResellerAuth();
  const [profile, setProfile] = useState<ResellerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initializing) return;

    if (!isAuthenticated) {
      setProfile(null);
      setLoading(false);
      setError("");
      return;
    }

    let active = true;

    const loadProfile = async () => {
      try {
        setLoading(true);
        setError("");

        const res = await api.get("/reseller/me");

        if (!active) return;
        setProfile(res.data ?? null);
      } catch (err: any) {
        if (!active) return;

        setError(
          err?.response?.data?.error || "Failed to load reseller profile"
        );

        // 401 = session gone → log out. 403 = authenticated but forbidden
        // (e.g. account disabled) → log out too. Pending resellers get 200
        // from /reseller/me so they are never affected by this branch.
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          await logout();
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, [isAuthenticated, initializing, logout]);

  return { profile, loading, error };
}