export function getTelegramWebApp() {
  return window.Telegram?.WebApp || null;
}

export function getTelegramInitData() {
  return getTelegramWebApp()?.initData || "";
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