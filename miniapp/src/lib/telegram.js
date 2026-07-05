const TELEGRAM_INIT_DATA_SESSION_KEY = "novanet.telegram.initData";

let cachedTelegramInitData = "";

function readStoredTelegramInitData() {
  if (typeof window === "undefined") return "";

  try {
    return window.sessionStorage?.getItem(TELEGRAM_INIT_DATA_SESSION_KEY) || "";
  } catch {
    return "";
  }
}

export function rememberTelegramInitData(initData) {
  const value = typeof initData === "string" ? initData : "";
  if (!value) return "";

  cachedTelegramInitData = value;

  try {
    window.sessionStorage?.setItem(TELEGRAM_INIT_DATA_SESSION_KEY, value);
  } catch {}

  return value;
}

export function getTelegramWebApp() {
  return window.Telegram?.WebApp || null;
}

export function getTelegramInitData() {
  // Persisted values first: the live WebApp.initData is blanked by Telegram Web A
  // after launch, so reading it first would bypass a valid cached value.
  if (cachedTelegramInitData) return cachedTelegramInitData;

  const storedInitData = readStoredTelegramInitData();
  if (storedInitData) {
    cachedTelegramInitData = storedInitData;
    return storedInitData;
  }

  // Live value as last resort (only reliable during the brief launch window).
  const liveInitData = getTelegramWebApp()?.initData || "";
  if (liveInitData) return rememberTelegramInitData(liveInitData);

  return "";
}

export function getTelegramInitDataStatus() {
  const webApp = getTelegramWebApp();
  const initData = getTelegramInitData();

  return {
    hasTelegramBridge: Boolean(webApp),
    hasInitData: Boolean(initData),
    initData,
    platform: webApp?.platform || "unknown",
    version: webApp?.version || "unknown",
  };
}

export function getTelegramLaunchDebug() {
  const webApp = getTelegramWebApp();
  const params = new URLSearchParams(window.location.search || "");
  const liveInitData = webApp?.initData || "";
  const cachedInitData = getTelegramInitData();
  const startParam = webApp?.initDataUnsafe?.start_param || "";
  const slug = params.get("slug") || startParam || "";

  return {
    entry_source: params.get("source") || (webApp ? "telegram_webapp" : "browser"),
    has_telegram_bridge: Boolean(webApp),
    init_data_present: Boolean(liveInitData || cachedInitData),
    live_init_data_present: Boolean(liveInitData),
    init_data_length: (liveInitData || cachedInitData).length,
    slug,
    start_param: startParam,
    path: window.location.pathname || "/",
    platform: webApp?.platform || "unknown",
    version: webApp?.version || "unknown",
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForTelegramInitData(timeoutMs = 1500) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const status = getTelegramInitDataStatus();
    if (status.hasInitData || !status.hasTelegramBridge) {
      if (status.initData) rememberTelegramInitData(status.initData);
      return status;
    }

    getTelegramWebApp()?.ready?.();
    await wait(100);
  }

  const finalStatus = getTelegramInitDataStatus();
  if (finalStatus.initData) rememberTelegramInitData(finalStatus.initData);
  return finalStatus;
}

function applySafeAreaInsets() {
  const webApp = getTelegramWebApp();
  const sa = webApp?.safeAreaInset || {};
  const csa = webApp?.contentSafeAreaInset || {};

  const top = (sa.top || 0) + (csa.top || 0);
  const bottom = (sa.bottom || 0) + (csa.bottom || 0);

  document.documentElement.style.setProperty("--app-safe-top", `${top}px`);
  document.documentElement.style.setProperty("--app-safe-bottom", `${bottom}px`);
}

export function prepareTelegramWebApp() {
  const webApp = getTelegramWebApp();

  if (!webApp) return;

  webApp.ready();
  webApp.expand?.();

  applySafeAreaInsets();
  webApp.onEvent?.("safeAreaChanged", applySafeAreaInsets);
  webApp.onEvent?.("contentSafeAreaChanged", applySafeAreaInsets);
  webApp.onEvent?.("viewportChanged", applySafeAreaInsets);
}

export function openTelegramNativeLink(url) {
  const webApp = getTelegramWebApp();

  if (webApp?.openTelegramLink) {
    webApp.openTelegramLink(url);
    return;
  }

  window.location.href = url;
}

export function openExternalLink(url) {
  const webApp = getTelegramWebApp();

  if (webApp?.openLink) {
    webApp.openLink(url, { tryInstantView: false });
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export function isTelegramWebBrowser() {
  const host = window.location.hostname || "";
  return host.includes("web.telegram.org");
}

export function openTelegramSharePicker(text) {
  const payload = String(text || "").trim();
  if (!payload) return;

  const shareUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(payload)}`;
  openTelegramNativeLink(shareUrl);
}
