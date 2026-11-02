import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useResellerAuth } from "../providers/ResellerAuthProvider";
import type { BotContentItem, BotContentListResponse, BotContentMutationResponse } from "../types/api";

export function botContentError(error: unknown): string {
  const value = error as { response?: { data?: { error?: string } }; message?: string };
  return value?.response?.data?.error || value?.message || "Request failed";
}

export function useBotContent() {
  const { isAuthenticated, initializing, sessionId } = useResellerAuth();
  const [items, setItems] = useState<BotContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const activeSession = useRef({ sessionId, ready: isAuthenticated && !initializing });

  // Invalidate before paint, including same-tab account switches and unmounts.
  useLayoutEffect(() => {
    generation.current++;
    activeSession.current = { sessionId, ready: isAuthenticated && !initializing };
    setItems([]);
    setError("");
    setLoading(isAuthenticated && !initializing);
    const onSessionStorage = (event: StorageEvent) => {
      if (event.key !== "rnv_uid" || event.newValue === sessionId) return;
      // The auth provider reloads on a cross-tab switch. Invalidate here too
      // because an unsaved-change prompt can delay that document reload.
      generation.current++;
      activeSession.current.ready = false;
      setItems([]);
      setLoading(false);
      setError("Session changed. Reload content before editing.");
    };
    window.addEventListener("storage", onSessionStorage);
    return () => {
      window.removeEventListener("storage", onSessionStorage);
      generation.current++;
      activeSession.current.ready = false;
    };
  }, [sessionId, isAuthenticated, initializing]);

  const reload = useCallback(async () => {
    if (!isAuthenticated || initializing || !activeSession.current.ready || activeSession.current.sessionId !== sessionId) return;
    const request = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<BotContentListResponse>("/reseller/bot-content");
      if (generation.current !== request) return;
      setItems(data.items);
    } catch (err) {
      if (generation.current === request) setError(botContentError(err));
    } finally {
      if (generation.current === request) setLoading(false);
    }
  }, [sessionId, isAuthenticated, initializing]);

  useEffect(() => {
    if (initializing || !isAuthenticated) return;
    void reload();
  }, [initializing, isAuthenticated, reload]);

  const assertCurrent = (request: number) => {
    if (request !== generation.current || !isAuthenticated || initializing
      || !activeSession.current.ready || activeSession.current.sessionId !== sessionId) {
      throw new Error("Session changed. Reload content before editing.");
    }
  };

  const apply = (data: BotContentMutationResponse) => {
    setItems(previous => previous.map(item => item.key === data.item.key ? data.item : item));
    return data.item;
  };
  const endpoint = (key: string) => `/reseller/bot-content/${encodeURIComponent(key)}`;
  const save = async (key: string, text: string) => {
    const request = generation.current;
    assertCurrent(request);
    try {
      const { data } = await api.patch<BotContentMutationResponse>(endpoint(key), { text });
      assertCurrent(request);
      return apply(data);
    } catch (err) { assertCurrent(request); throw err; }
  };
  const reset = async (key: string) => {
    const request = generation.current;
    assertCurrent(request);
    try {
      const { data } = await api.delete<BotContentMutationResponse>(endpoint(key));
      assertCurrent(request);
      return apply(data);
    } catch (err) { assertCurrent(request); throw err; }
  };
  return { items, loading, error, reload, save, reset };
}
