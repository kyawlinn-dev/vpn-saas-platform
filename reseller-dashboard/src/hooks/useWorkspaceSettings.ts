import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useResellerAuth } from "../providers/ResellerAuthProvider";
import type { PaymentMethod, WorkspaceSettings } from "../types/api";

export interface WorkspaceSettingsPatch {
  brand_name?: string;
  brand_logo_url?: string;
  support_username?: string;
  primary_color?: string;
  trial_enabled?: boolean;
  trial_data_limit_gb?: number | null;
  trial_duration_days?: number | null;
  payment_info?: PaymentMethod[];
  bot_token?: string;
}

export function useWorkspaceSettings() {
  const { isAuthenticated, initializing } = useResellerAuth();
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initializing || !isAuthenticated) return;

    let active = true;

    void (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await api.get("/reseller/workspace");
        if (active) setSettings(res.data ?? null);
      } catch (err: any) {
        if (active) setError(err?.response?.data?.error || "Failed to load workspace settings");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isAuthenticated, initializing]);

  const patch = async (data: WorkspaceSettingsPatch): Promise<Record<string, unknown>> => {
    const res = await api.patch("/reseller/workspace", data);
    return res.data as Record<string, unknown>;
  };

  return { settings, loading, error, patch };
}
