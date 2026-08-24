import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useResellerAuth } from "../providers/ResellerAuthProvider";
import type { NotificationEventType, NotificationTemplate } from "../types/api";

export function useNotificationTemplates() {
  const { isAuthenticated, initializing } = useResellerAuth();
  const [templates, setTemplates] = useState<NotificationTemplate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/reseller/notification-templates");
      setTemplates(res.data?.templates ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to load notification templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initializing || !isAuthenticated) return;
    let active = true;
    void (async () => {
      if (active) await load();
    })();
    return () => {
      active = false;
    };
  }, [initializing, isAuthenticated, load]);

  const save = async (eventType: NotificationEventType, text: string) => {
    const res = await api.patch(`/reseller/notification-templates/${eventType}`, { text });
    setTemplates((prev) =>
      prev
        ? prev.map((t) => (t.event_type === eventType ? { ...t, text, is_custom: true } : t))
        : prev
    );
    return res.data;
  };

  const reset = async (eventType: NotificationEventType) => {
    const res = await api.delete(`/reseller/notification-templates/${eventType}`);
    const defaultText = res.data?.text as string | undefined;
    setTemplates((prev) =>
      prev
        ? prev.map((t) =>
            t.event_type === eventType
              ? { ...t, text: defaultText ?? t.default_text, is_custom: false }
              : t
          )
        : prev
    );
    return res.data;
  };

  const preview = async (eventType: NotificationEventType, text: string) => {
    const res = await api.post(`/reseller/notification-templates/${eventType}/preview`, { text });
    return res.data?.preview as string;
  };

  return { templates, loading, error, save, reset, preview, reload: load };
}
