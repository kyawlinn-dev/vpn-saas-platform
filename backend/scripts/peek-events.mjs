import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { count } = await supabase
  .from("app_events")
  .select("*", { count: "exact", head: true });

const { data: recent, error } = await supabase
  .from("app_events")
  .select("id, event_name, event_source, status, reseller_id, customer_id, telegram_user_id, session_id, page, created_at, metadata")
  .order("created_at", { ascending: false })
  .limit(10);

if (error) { console.error(error); process.exit(1); }
console.log("TOTAL:", count);
console.log("RECENT:", JSON.stringify(recent, null, 2));
