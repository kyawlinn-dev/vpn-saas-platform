export const MINIAPP_SLUG =
  new URLSearchParams(window.location.search).get('slug') ||
  window.Telegram?.WebApp?.initDataUnsafe?.start_param ||
  import.meta.env.VITE_MINIAPP_SLUG ||
  'nexa';
