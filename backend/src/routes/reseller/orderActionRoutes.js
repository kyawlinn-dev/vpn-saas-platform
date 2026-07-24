import express from "express";
import { supabase } from "../../lib/supabase.js";
import { ServerAvailabilityError } from "../../services/serverService.js";
import { normalizePaymentStatus } from "../../utils/validators.js";
import {
  OrderLifecycleError,
  activateOrder,
  confirmPayment,
  extendOrder,
  rejectPayment,
  renewOrder,
  stopOrder,
  updatePaymentStatus,
} from "../../services/orderLifecycleService.js";

const router = express.Router();

const TELEGRAM_ACTION_MESSAGE = "This action is not available for Telegram customers";

// Throws OrderLifecycleError(403) if the order belongs to a Telegram customer.
// telegram_links is the source of truth; customer_type/source are fast labels.
async function assertNormalCustomer(orderId, resellerId) {
  const { data, error } = await supabase
    .from("vpn_orders")
    .select("id, customer_id, source, customer:vpn_customers!vpn_orders_customer_id_fkey(customer_type)")
    .eq("id", orderId)
    .eq("reseller_id", resellerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new OrderLifecycleError("Order not found", 404, "ORDER_NOT_FOUND");

  const orderSource = String(data.source || "").toLowerCase();
  const customerType = data.customer?.customer_type;

  if (customerType === "telegram" || orderSource === "miniapp" || orderSource === "bot") {
    throw new OrderLifecycleError(
      TELEGRAM_ACTION_MESSAGE,
      403,
      "TELEGRAM_CUSTOMER_ACTION"
    );
  }

  const { data: telegramLink, error: linkError } = await supabase
    .from("telegram_links")
    .select("id")
    .eq("reseller_id", resellerId)
    .eq("customer_id", data.customer_id)
    .limit(1)
    .maybeSingle();

  if (linkError) throw new Error(linkError.message);

  if (telegramLink) {
    await supabase
      .from("vpn_customers")
      .update({ customer_type: "telegram" })
      .eq("id", data.customer_id)
      .eq("reseller_id", resellerId);

    throw new OrderLifecycleError(
      TELEGRAM_ACTION_MESSAGE,
      403,
      "TELEGRAM_CUSTOMER_ACTION"
    );
  }
}

function sendActionError(res, err, fallbackMessage) {
  if (err instanceof OrderLifecycleError) {
    return res.status(err.status || 400).json({
      success: false,
      error: err.message,
      code: err.code,
    });
  }

  if (err instanceof ServerAvailabilityError) {
    return res.status(409).json({
      success: false,
      error: err.message,
      code: err.code,
    });
  }

  console.error(fallbackMessage, err);
  return res.status(500).json({
    success: false,
    error: err.message || fallbackMessage,
  });
}

router.post("/:orderId/activate", async (req, res) => {
  try {
    await assertNormalCustomer(req.params.orderId, req.reseller.id);
    const result = await activateOrder({
      orderId: req.params.orderId,
      reseller: req.reseller,
    });

    return res.json(result);
  } catch (err) {
    return sendActionError(res, err, "Failed to activate order");
  }
});

router.post("/:orderId/extend", async (req, res) => {
  try {
    await assertNormalCustomer(req.params.orderId, req.reseller.id);
    const result = await extendOrder({
      orderId: req.params.orderId,
      resellerId: req.reseller.id,
      planId: req.body?.plan_id,
      idempotencyKey: req.body?.idempotency_key || req.get("Idempotency-Key") || null,
      source: "dashboard",
    });

    return res.json(result);
  } catch (err) {
    return sendActionError(res, err, "Failed to extend order");
  }
});

router.post("/:orderId/renew", async (req, res) => {
  try {
    await assertNormalCustomer(req.params.orderId, req.reseller.id);
    const result = await renewOrder({
      orderId: req.params.orderId,
      reseller: req.reseller,
      planId: req.body?.plan_id,
      idempotencyKey: req.body?.idempotency_key || req.get("Idempotency-Key") || null,
      source: "dashboard",
    });

    return res.json(result);
  } catch (err) {
    return sendActionError(res, err, "Failed to renew order");
  }
});

router.post("/:orderId/stop", async (req, res) => {
  try {
    await assertNormalCustomer(req.params.orderId, req.reseller.id);
    const result = await stopOrder({
      orderId: req.params.orderId,
      resellerId: req.reseller.id,
    });

    return res.json(result);
  } catch (err) {
    return sendActionError(res, err, "Failed to stop order");
  }
});

router.post("/:orderId/confirm-payment", async (req, res) => {
  try {
    const result = await confirmPayment({
      orderId: req.params.orderId,
      resellerId: req.reseller.id,
    });

    return res.json(result);
  } catch (err) {
    return sendActionError(res, err, "Failed to confirm payment");
  }
});

router.post("/:orderId/reject-payment", async (req, res) => {
  try {
    const result = await rejectPayment({
      orderId: req.params.orderId,
      resellerId: req.reseller.id,
    });

    return res.json(result);
  } catch (err) {
    return sendActionError(res, err, "Failed to reject payment");
  }
});

router.post("/:orderId/payment-status", async (req, res) => {
  try {
    const normalizedStatus = normalizePaymentStatus(req.body?.status);
    if (!normalizedStatus) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment status",
        code: "INVALID_PAYMENT_STATUS",
      });
    }

    const result = await updatePaymentStatus({
      orderId: req.params.orderId,
      resellerId: req.reseller.id,
      paymentStatus: normalizedStatus,
    });

    return res.json(result);
  } catch (err) {
    return sendActionError(res, err, "Failed to update payment status");
  }
});

export default router;
