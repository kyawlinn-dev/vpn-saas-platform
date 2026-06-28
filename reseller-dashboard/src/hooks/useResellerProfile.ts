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