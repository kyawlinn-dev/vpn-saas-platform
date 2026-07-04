export function getMiniAppSlug() {
  return String(
    new URLSearchParams(window.location.search).get("slug") ||
      window.Telegram?.WebApp?.initDataUnsafe?.start_param ||
      import.meta.env.VITE_MINIAPP_SLUG ||
      ""
  ).trim();
}

export const MINIAPP_SLUG = getMiniAppSlug();
