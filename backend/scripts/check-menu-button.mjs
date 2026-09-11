// Show what menu button Telegram actually has stored for each configured bot.
// Compare vs what our code intends to set — helps diagnose why clients might
// be showing "Menu" fallback instead of the configured web_app text.

import { createClient } from "@supabase/supabase-js";
const { decrypt } = await import("../src/lib/tokenEncryption.js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: bots } = await supabase
  .from("reseller_miniapps")
  .select("reseller_id, brand_name, miniapp_slug, bot_token_encrypted")
  .eq("is_enabled", true)
  .not("bot_token_encrypted", "is", null);

for (const b of bots || []) {
  const label = `${b.brand_name} (${b.reseller_id.slice(0, 8)})`;
  let token;
  try { token = decrypt(b.bot_token_encrypted); }
  catch { console.log(`\n▸ ${label}: token decrypt failed — SKIP`); continue; }

  console.log(`\n▸ ${label}`);
  try {
    // Bot-level default menu button (no chat_id)
    const res = await fetch(`https://api.telegram.org/bot${token}/getChatMenuButton`);
    const data = await res.json();
    if (data.ok) {
      console.log(`   bot-level default: type=${data.result.type}`);
      if (data.result.type === "web_app") {
        console.log(`      text: "${data.result.text}"`);
        console.log(`      url:  ${data.result.web_app?.url}`);
      } else if (data.result.type === "default") {
        console.log(`      (default = hamburger "Menu" fallback — no custom web_app configured)`);
      }
    } else {
      console.log(`   getChatMenuButton failed:`, data);
    }

    // Also getMe to confirm bot identity
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const me = await meRes.json();
    if (me.ok) console.log(`   bot username: @${me.result.username}`);
  } catch (err) {
    console.log(`   error: ${err.message}`);
  }
}
