// Check what Telegram thinks the current webhook URL and secret hash are.
import { createClient } from "@supabase/supabase-js";

const RESELLER_ID = "e51b3a9f-dca4-450a-aeb4-147064420a88";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Need decryption. Use the same helper as manager.js.
const { decrypt } = await import("../src/lib/tokenEncryption.js");

const { data, error } = await supabase
  .from("reseller_miniapps")
  .select("bot_token_encrypted")
  .eq("reseller_id", RESELLER_ID)
  .single();

if (error || !data?.bot_token_encrypted) {
  console.error("no token:", error?.message);
  process.exit(1);
}

const token = decrypt(data.bot_token_encrypted);
const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
const info = await res.json();

console.log(JSON.stringify(info, null, 2));
