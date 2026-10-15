import crypto from "node:crypto";
import { supabase } from "../lib/supabase.js";

function failure(message, code, status = 409) { return Object.assign(new Error(message), {code,status}); }
function checkRpc(error, operation) {
  if (!error) return;
  const diagnostic={operation,code:error.code || null,message:error.message || "Unknown database error"};
  console.error("Dashboard purchase database error:", diagnostic);
  const code = ["REQUEST_CONFLICT","CUSTOMER_NOT_FOUND","PURCHASE_UNDER_REVIEW","QUEUED_PACKAGE_EXISTS","TELEGRAM_CUSTOMER_ACTION","PAID_PLAN_REQUIRED"].find((c) => error.message?.includes(c));
  throw failure(code || "Dashboard setup is unavailable. The recorded purchase must be checked before retrying.", code || "SETUP_UNAVAILABLE", code === "TELEGRAM_CUSTOMER_ACTION" ? 403 : code ? 409 : 503);
}
export async function prepareDashboardPurchase({resellerId,requestKey,payload}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestKey || "")) throw failure("A UUID purchase request key is required", "REQUEST_KEY_REQUIRED",400);
  const canonical = Object.fromEntries(Object.keys(payload).sort().map((k) => [k,payload[k] ?? null]));
  const hash = crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  const {data,error} = await supabase.rpc("prepare_dashboard_purchase", {p_reseller_id:resellerId,p_request_key:requestKey,p_request_hash:hash,p_payload:canonical});
  checkRpc(error,"prepare_dashboard_purchase");
  return data;
}
export async function ensureDashboardPurchaseOperation(order) {
  const {data,error} = await supabase.rpc("ensure_dashboard_purchase_operation", {p_reseller_id:order.reseller_id,p_order_id:order.id});
  checkRpc(error,"ensure_dashboard_purchase_operation"); return data;
}
export async function runDashboardPurchaseSetup({order,resellerId,activate}) {
  if (!order || order.reseller_id !== resellerId || !["dashboard","admin"].includes(order.source) || order.order_type !== "purchase") throw failure("Order not found", "ORDER_NOT_FOUND",404);
  const owner = crypto.randomUUID();
  const args = {p_reseller_id:resellerId,p_order_id:order.id,p_owner:owner};
  const {data:claim,error} = await supabase.rpc("claim_dashboard_purchase_setup",args);
  checkRpc(error,"claim_dashboard_purchase_setup");
  if (!claim?.claimed) {
    const outcome = {ready:"active",queued:"queued",awaiting_payment:"awaiting_payment",running:"setup_in_progress"}[claim?.state];
    if (!outcome) throw failure("Setup state is unavailable", "SETUP_UNAVAILABLE",503);
    return {success:true,order_id:order.id,purchase_outcome:outcome,payment_status:order.payment_status,message:outcome === "setup_in_progress" ? "Setup is already in progress. Do not submit another payment." : outcome === "queued" ? "Your next package is queued" : outcome === "awaiting_payment" ? "Awaiting payment" : "Package is active"};
  }
  let result;
  try { result = await activate(claim.plan_snapshot); }
  catch (err) {
    const code = /^[A-Z0-9_]{1,80}$/.test(err?.code || "") ? err.code : "PROVIDER_ERROR";
    const {error:finishError} = await supabase.rpc("finish_dashboard_purchase_setup", {...args,p_state:"failed",p_error_code:code});
    checkRpc(finishError,"finish_dashboard_purchase_setup");
    return {success:true,order_id:order.id,purchase_outcome:"setup_failed",payment_status:order.payment_status,review_status:order.review_status,message:"Payment confirmed. Setup failed; retry setup on this order without paying again."};
  }
  const {error:finishError} = await supabase.rpc("finish_dashboard_purchase_setup", {...args,p_state:"ready",p_error_code:null});
  checkRpc(finishError,"finish_dashboard_purchase_setup");
  return {...result,success:true,order_id:order.id,purchase_outcome:"active"};
}
