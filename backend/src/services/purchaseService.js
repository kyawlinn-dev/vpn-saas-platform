import crypto from "node:crypto";
import { supabase } from "../lib/supabase.js";
import { activatePendingReviewPurchase } from "./orderLifecycleService.js";
import { syncOrderPaymentSummary } from "./paymentLedgerService.js";

export class PurchaseError extends Error {
  constructor(message, code = "PURCHASE_FAILED", status = 409) { super(message); this.code = code; this.status = status; }
}

function rpcError(error) {
  const code = /\b(INACTIVE_CUSTOMER|INACTIVE_RESELLER|INVALID_PLAN|INVALID_CUSTOMER|INVALID_CALLER|PURCHASE_UNDER_REVIEW|QUEUED_PACKAGE_EXISTS|ACTIVE_PACKAGE_EXISTS|PURCHASE_PROCESSING|PURCHASE_RECOVERY_REQUIRED|IDEMPOTENCY_CONFLICT)\b/.exec(error.message || "")?.[1];
  return new PurchaseError(code || "Purchase storage failed", code || "PURCHASE_FAILED", !code ? 500 : code.startsWith("INVALID") ? 400 : 409);
}

export function createPurchaseService(deps) {
  return async function submit(input) {
    const staff = input.actor?.role === "reseller" && input.channel === "dashboard";
    const customer = input.actor?.role === "customer" && ["bot", "miniapp"].includes(input.channel);
    if ((!staff && !customer) || !input.actor?.resellerId || !input.customerId || !input.planId) throw new PurchaseError("Invalid purchase caller", "INVALID_CALLER", 403);
    if (customer && !input.screenshotPath) throw new PurchaseError("Payment screenshot is required", "SCREENSHOT_REQUIRED", 400);
    let command = {
      resellerId: input.actor.resellerId, customerId: input.customerId, planId: input.planId,
      channel: input.channel, policy: staff ? "staff" : "customer",
      protocol: ["shadowsocks", "vless", "hysteria2"].includes(input.protocol) ? input.protocol : "shadowsocks",
      screenshotPath: input.screenshotPath || null, paymentNote: input.paymentNote || null,
      paymentStatus: staff && input.paymentStatus === "paid" ? "paid" : "unpaid",
      requestKey: input.requestKey || (input.screenshotPath ? crypto.createHash("sha256").update(`${input.channel}:${input.customerId}:${input.screenshotPath}`).digest("hex") : crypto.randomUUID()),
    };
    if (customer && deps.resume) {
      const original = await deps.resume(command);
      if (original) {
        if (original.resellerId !== command.resellerId || original.customerId !== command.customerId ||
            original.policy !== "customer" || original.channel !== command.channel ||
            original.planId !== command.planId || original.protocol !== command.protocol) {
          throw new PurchaseError("An unfinished purchase needs support before changing checkout", "PURCHASE_RECOVERY_REQUIRED");
        }
        command = original;
      }
    }
    const prepared = await deps.prepare(command);
    const snapshot = await deps.load(prepared.operationId, command.resellerId);
    if (snapshot.completed) return { ...snapshot, replayed: true, activation: null };
    if (staff || snapshot.isQueued) {
      await deps.complete(prepared.operationId, command.resellerId, null);
      return { ...snapshot, replayed: prepared.replayed, activation: null };
    }
    const owner = crypto.randomUUID();
    if (!await deps.claim(prepared.operationId, command.resellerId, owner)) throw new PurchaseError("Purchase is still processing; please check My VPN", "PURCHASE_PROCESSING");
    try {
      if (await deps.pendingKeys(snapshot.order.id, command.resellerId)) throw new PurchaseError("Purchase needs operator recovery", "PURCHASE_RECOVERY_REQUIRED");
      const activation = await deps.activate({ order: { ...snapshot.order, customer: snapshot.customer }, reseller: snapshot.reseller, plan: snapshot.plan });
      await deps.complete(prepared.operationId, command.resellerId, owner);
      return { ...snapshot, order: { ...snapshot.order, ...(activation.order || {}), customer: snapshot.customer, plan: snapshot.plan, vpn_plans: snapshot.plan }, activation, replayed: prepared.replayed };
    } catch (error) {
      await deps.fail(prepared.operationId, command.resellerId, owner, error.code === "PURCHASE_RECOVERY_REQUIRED").catch(() => {});
      throw error;
    }
  };
}

async function checked(result) { if (result.error) throw rpcError(result.error); return result.data; }

const repository = {
  async resume(c) {
    const rows = await checked(await supabase.from("purchase_operations")
      .select("request_key,command").eq("reseller_id", c.resellerId).eq("customer_id", c.customerId)
      .eq("policy", "customer").neq("status", "completed").order("created_at").limit(2));
    if (rows.length > 1) throw new PurchaseError("Multiple unfinished purchases need support", "PURCHASE_RECOVERY_REQUIRED");
    if (!rows.length) return null;
    const saved = rows[0].command;
    return { resellerId: c.resellerId, customerId: saved.customer, planId: saved.plan,
      channel: saved.channel, policy: saved.policy, protocol: saved.protocol,
      screenshotPath: saved.screenshot, paymentNote: saved.note, paymentStatus: saved.payment,
      requestKey: rows[0].request_key };
  },
  async prepare(c) {
    const data = await checked(await supabase.rpc("submit_purchase", {
      p_reseller_id: c.resellerId, p_customer_id: c.customerId, p_plan_id: c.planId,
      p_channel: c.channel, p_policy: c.policy, p_protocol: c.protocol,
      p_screenshot: c.screenshotPath, p_note: c.paymentNote, p_payment_status: c.paymentStatus, p_request_key: c.requestKey,
    }));
    return { operationId: data.operation_id, replayed: data.replayed };
  },
  async load(id, resellerId) {
    const op = await checked(await supabase.from("purchase_operations").select("*").eq("id", id).eq("reseller_id", resellerId).single());
    if (!op.order_id) throw new PurchaseError("This purchase was cancelled; start a new checkout", "PURCHASE_CANCELLED");
    const order = await checked(await supabase.from("vpn_orders").select("*, customer:vpn_customers!vpn_orders_customer_id_fkey(*), plan:vpn_plans(*)").eq("id", op.order_id).eq("reseller_id", resellerId).single());
    const reseller = await checked(await supabase.from("resellers").select("*").eq("id", resellerId).single());
    const payments = await checked(await supabase.from("order_payments").select("*").eq("order_id", order.id).eq("reseller_id", resellerId).order("created_at").limit(1));
    if (op.status === "recovery_required") throw new PurchaseError("Purchase needs operator recovery", "PURCHASE_RECOVERY_REQUIRED");
    if (op.policy === "staff" && order.payment_status === "paid" && order.order_type === "purchase") {
      const synced = await syncOrderPaymentSummary(order.id);
      Object.assign(order, synced.order);
    }
    return { order: { ...order, vpn_plans: order.plan }, customer: order.customer, plan: order.plan, reseller, payment: payments?.[0] || null, isQueued: op.is_queued, completed: op.status === "completed" };
  },
  async claim(id, resellerId, owner) { return checked(await supabase.rpc("claim_purchase_execution", { p_id: id, p_reseller_id: resellerId, p_owner: owner })); },
  async pendingKeys(orderId, resellerId) {
    const rows = await checked(await supabase.from("vpn_keys").select("id").eq("order_id", orderId).eq("reseller_id", resellerId).eq("status", "pending").limit(1));
    return rows.length > 0;
  },
  activate: activatePendingReviewPurchase,
  async complete(id, resellerId, owner) { await checked(await supabase.rpc("finish_purchase_execution", { p_id: id, p_reseller_id: resellerId, p_owner: owner, p_status: "completed" })); },
  async fail(id, resellerId, owner, recovery) { await checked(await supabase.rpc("finish_purchase_execution", { p_id: id, p_reseller_id: resellerId, p_owner: owner, p_status: recovery ? "recovery_required" : "created" })); },
};

export const submitPurchase = createPurchaseService(repository);
