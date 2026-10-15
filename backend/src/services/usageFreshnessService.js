import { supabase } from "../lib/supabase.js";
export function summarizeUsageFreshness(rows, {now = new Date()} = {}) {
  const times = rows.map((r) => Date.parse(r?.last_usage_sync_at));
  if (!times.length || times.some((t) => !Number.isFinite(t) || t > now.getTime())) return {last_synced_at:null,state:"unknown"};
  const oldest = Math.min(...times);
  return {last_synced_at:new Date(oldest).toISOString(),state:now.getTime()-oldest <= 7200000 ? "fresh" : "stale"};
}
export async function loadUsageFreshness(serverIds, {now = new Date()} = {}) {
  const ids = [...new Set(serverIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const {data,error} = await supabase.from("server_health_status").select("server_id,last_usage_sync_at").in("server_id",ids);
  return new Map(ids.map((id) => [id, summarizeUsageFreshness([error ? null : data?.find((r) => r.server_id === id)],{now})]));
}
