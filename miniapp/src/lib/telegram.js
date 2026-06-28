export function getTelegramWebApp() {
  return window.Telegram?.WebApp || null;
}

export function getTelegramInitData() {
  return getTelegramWebApp()?.initData || "";
}

export function prepareTelegramWebApp() {
  const webApp = getTelegramWebApp();

  if (!webApp) return;

  webApp.ready();
  webApp.expand?.();
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