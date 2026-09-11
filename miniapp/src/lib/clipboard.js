/**
 * copyText — cross-context clipboard helper.
 *
 * Telegram WebView (both Android and iOS) often blocks navigator.clipboard.writeText
 * because the document isn't considered focused or the permission isn't granted.
 * Falls back to the legacy document.execCommand("copy") approach, which works
 * in all WebView contexts as long as there is a user gesture on the call stack.
 *
 * @param {string} value  Text to copy.
 * @returns {Promise<boolean>}  true if copy succeeded, false otherwise.
 */
export async function copyText(value) {
  if (!value) return false;

  // 1. Modern Clipboard API (requires HTTPS + user-gesture + permission)
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through to execCommand
    }
  }

  // 2. execCommand fallback — works in Telegram WebView and older browsers
  try {
    const el = document.createElement("textarea");
    el.value = value;
    // Keep it off-screen but in the DOM so selection works
    el.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
