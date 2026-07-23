#!/usr/bin/env node
/**
 * Backfill legacy vpn_orders into the order_payments ledger.
 *
 * Default mode is read-only dry run:
 *   node scripts/backfillLegacyPaymentLedger.js
 *
 * Apply changes:
 *   node scripts/backfillLegacyPaymentLedger.js --apply
 *
 * The script is intentionally idempotent:
 * - it inserts payment rows only for purchase orders that currently have none
 * - it fills missing package snapshots only when null
 * - it syncs order cached totals from ledger rows
 * - it updates/inserts commission_ledger rows from confirmed applied payments
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import "../src/lib/loadEnv.js";

const APPLY = process.argv.includes("--apply");
const NOW = new Date().toISOString();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, "../../audit/backups");

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
}

function percent(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

function commission(amountMmk, commissionPercent) {
  return Math.floor((money(amountMmk) * percent(commissionPercent)) / 100);
}

function platformDue(amountMmk, commissionMmk) {
  return Math.max(0, money(amountMmk) - money(commissionMmk));
}

function iso(value) {
  return value || NOW;
}

function mapById(rows) {
  return new Map(rows.map((row) => [row.id, row]));
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(row);
  }
  return map;
}

async function query(label, builder) {
  const { data, error } = await builder;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data || [];
}

async function mutate(label, builder) {
  const { data, error } = await builder;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data || null;
}

function isConfirmedApplied(payment) {
  return (
    payment.review_status === "confirmed" &&
    String(payment.apply_status || "applied") === "applied"
  );
}

function paymentSummary(payments) {
  const rows = Array.isArray(payments) ? payments : [];
  const confirmed = rows.filter(isConfirmedApplied);
  const pending = rows.filter((row) => row.review_status === "pending_review");
  const rejected = rows.filter((row) => row.review_status === "rejected");

  return {
    confirmed_count: confirmed.length,
    pending_count: pending.length,
    rejected_count: rejected.length,
    confirmed_amount_mmk: confirmed.reduce((sum, row) => sum + money(row.amount_mmk), 0),
    confirmed_commission_mmk: confirmed.reduce((sum, row) => sum + money(row.commission_amount_mmk), 0),
  };
}

function nextReviewStatus(summary) {
  if (summary.pending_count > 0) return "pending_review";
  if (summary.confirmed_count > 0) return "confirmed";
  if (summary.rejected_count > 0) return "rejected";
  return null;
}

function newSsconfToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

function orderCreatedAt(order) {
  return iso(order.created_at || order.activated_at);
}

function buildPaymentRow({ order, plan, reviewStatus }) {
  const amount =
    reviewStatus === "confirmed"
      ? money(order.total_paid_mmk || order.price_mmk)
      : money(order.price_mmk);
  const commissionMmk = commission(amount, order.commission_percent);
  const createdAt = orderCreatedAt(order);
  const applyStatus =
    reviewStatus === "confirmed"
      ? "applied"
      : reviewStatus === "rejected"
        ? "reversed"
        : "pending";

  return {
    order_id: order.id,
    customer_id: order.customer_id,
    reseller_id: order.reseller_id,
    amount_mmk: amount,
    commission_percent: percent(order.commission_percent),
    commission_amount_mmk: commissionMmk,
    platform_due_mmk: platformDue(amount, commissionMmk),
    payment_method: null,
    payment_note: [
      "Legacy aggregate backfill from vpn_orders.",
      money(order.total_paid_mmk) > money(order.price_mmk)
        ? "Original order total appears to include one or more historical extensions."
        : null,
    ]
      .filter(Boolean)
      .join(" "),
    payment_screenshot_url: order.payment_screenshot_url || null,
    review_status: reviewStatus,
    payment_type: "initial",
    apply_status: applyStatus,
    plan_id: order.plan_id || null,
    package_duration_days: plan?.duration_days ?? null,
    package_data_limit_gb: plan?.data_limit_gb ?? null,
    applied_at: applyStatus === "applied" ? iso(order.activated_at || order.created_at) : null,
    apply_error: null,
    idempotency_key: `legacy:${order.id}:initial`,
    source: order.source || "dashboard",
    submitted_at: createdAt,
    reviewed_at: reviewStatus === "pending_review" ? null : createdAt,
    reviewed_by_reseller_id: null,
    reviewed_by_admin_id: null,
    review_note: null,
    created_at: createdAt,
    updated_at: NOW,
  };
}

function summarizeByReseller(rows, resellersById) {
  const buckets = {};
  for (const row of rows) {
    const key = resellersById.get(row.reseller_id)?.name || "Unknown";
    if (!buckets[key]) buckets[key] = { count: 0, gross_mmk: 0, commission_mmk: 0, platform_due_mmk: 0 };
    buckets[key].count += 1;
    buckets[key].gross_mmk += money(row.amount_mmk);
    buckets[key].commission_mmk += money(row.commission_amount_mmk);
    buckets[key].platform_due_mmk += money(row.platform_due_mmk);
  }
  return buckets;
}

function summarizeByMonth(rows) {
  const buckets = {};
  for (const row of rows) {
    const key = String(row.created_at || row.submitted_at || NOW).slice(0, 7);
    if (!buckets[key]) buckets[key] = { count: 0, gross_mmk: 0, commission_mmk: 0, platform_due_mmk: 0 };
    buckets[key].count += 1;
    buckets[key].gross_mmk += money(row.amount_mmk);
    buckets[key].commission_mmk += money(row.commission_amount_mmk);
    buckets[key].platform_due_mmk += money(row.platform_due_mmk);
  }
  return buckets;
}

async function main() {
  const [
    orders,
    payments,
    plans,
    customers,
    resellers,
    commissionLedger,
    monthlySettlements,
  ] = await Promise.all([
    query(
      "vpn_orders",
      db
        .from("vpn_orders")
        .select(
          "id, customer_id, reseller_id, plan_id, status, price_mmk, commission_percent, commission_amount_mmk, total_paid_mmk, start_date, expiry_date, payment_status, payment_note, payment_screenshot_url, activated_at, order_type, review_status, source, created_at, updated_at"
        )
        .range(0, 4999)
    ),
    query(
      "order_payments",
      db.from("order_payments").select("*").range(0, 4999)
    ),
    query("vpn_plans", db.from("vpn_plans").select("*").range(0, 4999)),
    query("vpn_customers", db.from("vpn_customers").select("*").range(0, 4999)),
    query("resellers", db.from("resellers").select("*").range(0, 4999)),
    query("commission_ledger", db.from("commission_ledger").select("*").range(0, 4999)),
    query("monthly_settlements", db.from("monthly_settlements").select("*").range(0, 4999)),
  ]);

  const plansById = mapById(plans);
  const resellersById = mapById(resellers);
  const paymentsByOrder = groupBy(payments, "order_id");
  const ledgerByOrder = groupBy(commissionLedger, "order_id");

  const isTrialOrder = (order) => {
    const plan = plansById.get(order.plan_id);
    return order.order_type === "trial" || plan?.is_trial === true || money(order.price_mmk) === 0;
  };

  const trialOrderUpdates = [];
  const purchaseTypeUpdates = [];
  const paymentRowsToInsert = [];
  const paymentSnapshotUpdates = [];
  const orderSummaryUpdates = [];
  const commissionLedgerInserts = [];
  const commissionLedgerUpdates = [];
  const customerTokenUpdates = [];

  for (const order of orders) {
    const plan = plansById.get(order.plan_id);
    const existingPayments = paymentsByOrder.get(order.id) || [];

    if (isTrialOrder(order)) {
      const patch = {};
      if (order.order_type !== "trial") patch.order_type = "trial";
      if (order.review_status !== "confirmed") patch.review_status = "confirmed";
      if (order.payment_status !== "paid") patch.payment_status = "paid";
      if (money(order.total_paid_mmk) !== 0) patch.total_paid_mmk = 0;
      if (money(order.commission_amount_mmk) !== 0) patch.commission_amount_mmk = 0;
      if (Object.keys(patch).length > 0) {
        patch.updated_at = NOW;
        trialOrderUpdates.push({ id: order.id, patch });
      }
      continue;
    }

    if (order.order_type !== "purchase") {
      purchaseTypeUpdates.push({ id: order.id, patch: { order_type: "purchase", updated_at: NOW } });
    }

    if (existingPayments.length === 0) {
      const assumedReview = String(order.review_status || "confirmed");
      if (
        order.payment_status === "paid" &&
        assumedReview === "confirmed" &&
        money(order.total_paid_mmk || order.price_mmk) > 0
      ) {
        paymentRowsToInsert.push(buildPaymentRow({ order, plan, reviewStatus: "confirmed" }));
      } else if (assumedReview === "pending_review" && money(order.price_mmk) > 0) {
        paymentRowsToInsert.push(buildPaymentRow({ order, plan, reviewStatus: "pending_review" }));
      } else if (assumedReview === "rejected" && money(order.price_mmk) > 0) {
        paymentRowsToInsert.push(buildPaymentRow({ order, plan, reviewStatus: "rejected" }));
      }
    }
  }

  for (const payment of payments) {
    if (money(payment.amount_mmk) <= 0) continue;
    const order = orders.find((row) => row.id === payment.order_id);
    const plan = plansById.get(payment.plan_id || order?.plan_id);
    const patch = {};

    if (!payment.plan_id && order?.plan_id) patch.plan_id = order.plan_id;
    if (payment.package_duration_days == null && plan?.duration_days != null) {
      patch.package_duration_days = plan.duration_days;
    }
    if (payment.package_data_limit_gb == null && plan?.data_limit_gb != null) {
      patch.package_data_limit_gb = plan.data_limit_gb;
    }

    if (Object.keys(patch).length > 0) {
      patch.updated_at = NOW;
      paymentSnapshotUpdates.push({ id: payment.id, patch });
    }
  }

  const projectedPaymentsByOrder = groupBy([...payments, ...paymentRowsToInsert], "order_id");
  for (const order of orders) {
    if (isTrialOrder(order)) continue;
    const summary = paymentSummary(projectedPaymentsByOrder.get(order.id) || []);
    const reviewStatus = nextReviewStatus(summary);
    const patch = {
      total_paid_mmk: summary.confirmed_amount_mmk,
      commission_amount_mmk: summary.confirmed_commission_mmk,
      payment_status: summary.confirmed_amount_mmk > 0 ? "paid" : "unpaid",
      updated_at: NOW,
    };
    if (reviewStatus) patch.review_status = reviewStatus;

    if (
      money(order.total_paid_mmk) !== patch.total_paid_mmk ||
      money(order.commission_amount_mmk) !== patch.commission_amount_mmk ||
      order.payment_status !== patch.payment_status ||
      (reviewStatus && order.review_status !== reviewStatus)
    ) {
      orderSummaryUpdates.push({ id: order.id, patch });
    }
  }

  for (const order of orders) {
    if (isTrialOrder(order)) continue;
    const summary = paymentSummary(projectedPaymentsByOrder.get(order.id) || []);
    const expectedCommission = summary.confirmed_commission_mmk;
    if (expectedCommission <= 0) continue;

    const ledgerRows = ledgerByOrder.get(order.id) || [];
    if (ledgerRows.length === 0) {
      commissionLedgerInserts.push({
        order_id: order.id,
        reseller_id: order.reseller_id,
        amount_mmk: expectedCommission,
        status: "pending",
        created_at: orderCreatedAt(order),
        updated_at: NOW,
      });
    } else {
      const primary = ledgerRows[0];
      if (money(primary.amount_mmk) !== expectedCommission || primary.reseller_id !== order.reseller_id) {
        commissionLedgerUpdates.push({
          id: primary.id,
          patch: {
            reseller_id: order.reseller_id,
            amount_mmk: expectedCommission,
            updated_at: NOW,
          },
        });
      }
    }
  }

  for (const customer of customers) {
    if (!customer.ssconf_token) {
      customerTokenUpdates.push({ id: customer.id, patch: { ssconf_token: newSsconfToken(), updated_at: NOW } });
    }
  }

  const backup = {
    generated_at: NOW,
    mode: APPLY ? "apply" : "dry-run",
    source_project: SUPABASE_URL,
    tables: {
      vpn_orders: orders,
      order_payments: payments,
      vpn_customers: customers,
      vpn_plans: plans,
      resellers,
      commission_ledger: commissionLedger,
      monthly_settlements: monthlySettlements,
    },
    planned: {
      payment_rows_to_insert: paymentRowsToInsert,
      payment_snapshot_updates: paymentSnapshotUpdates,
      trial_order_updates: trialOrderUpdates,
      purchase_type_updates: purchaseTypeUpdates,
      order_summary_updates: orderSummaryUpdates,
      commission_ledger_inserts: commissionLedgerInserts,
      commission_ledger_updates: commissionLedgerUpdates,
      customer_token_updates: customerTokenUpdates,
    },
  };

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(
    BACKUP_DIR,
    `legacy-payment-ledger-backfill-${NOW.replaceAll(":", "-")}${APPLY ? "-apply" : "-dry-run"}.json`
  );
  await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));

  const confirmedRows = paymentRowsToInsert.filter((row) => row.review_status === "confirmed");
  const pendingRows = paymentRowsToInsert.filter((row) => row.review_status === "pending_review");
  const rejectedRows = paymentRowsToInsert.filter((row) => row.review_status === "rejected");
  const summary = {
    mode: APPLY ? "APPLY" : "DRY_RUN",
    backup_path: backupPath,
    planned_counts: {
      payment_rows_to_insert: paymentRowsToInsert.length,
      confirmed_payment_rows: confirmedRows.length,
      pending_payment_rows: pendingRows.length,
      rejected_payment_rows: rejectedRows.length,
      payment_snapshot_updates: paymentSnapshotUpdates.length,
      trial_order_updates: trialOrderUpdates.length,
      purchase_type_updates: purchaseTypeUpdates.length,
      order_summary_updates: orderSummaryUpdates.length,
      commission_ledger_inserts: commissionLedgerInserts.length,
      commission_ledger_updates: commissionLedgerUpdates.length,
      customer_token_updates: customerTokenUpdates.length,
    },
    money: {
      confirmed_backfill_gross_mmk: confirmedRows.reduce((sum, row) => sum + money(row.amount_mmk), 0),
      confirmed_backfill_commission_mmk: confirmedRows.reduce((sum, row) => sum + money(row.commission_amount_mmk), 0),
      confirmed_backfill_platform_due_mmk: confirmedRows.reduce((sum, row) => sum + money(row.platform_due_mmk), 0),
    },
    confirmed_backfill_by_reseller: summarizeByReseller(confirmedRows, resellersById),
    confirmed_backfill_by_month: summarizeByMonth(confirmedRows),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to make changes.");
    return;
  }

  for (const item of [...trialOrderUpdates, ...purchaseTypeUpdates]) {
    await mutate(`update vpn_orders ${item.id}`, db.from("vpn_orders").update(item.patch).eq("id", item.id));
  }

  if (paymentRowsToInsert.length > 0) {
    await mutate(
      "insert order_payments",
      db.from("order_payments").insert(paymentRowsToInsert).select("id")
    );
  }

  for (const item of paymentSnapshotUpdates) {
    await mutate(`update order_payments ${item.id}`, db.from("order_payments").update(item.patch).eq("id", item.id));
  }

  for (const item of orderSummaryUpdates) {
    await mutate(`update vpn_orders ${item.id}`, db.from("vpn_orders").update(item.patch).eq("id", item.id));
  }

  if (commissionLedgerInserts.length > 0) {
    await mutate(
      "insert commission_ledger",
      db.from("commission_ledger").insert(commissionLedgerInserts).select("id")
    );
  }

  for (const item of commissionLedgerUpdates) {
    await mutate(
      `update commission_ledger ${item.id}`,
      db.from("commission_ledger").update(item.patch).eq("id", item.id)
    );
  }

  for (const item of customerTokenUpdates) {
    await mutate(`update vpn_customers ${item.id}`, db.from("vpn_customers").update(item.patch).eq("id", item.id));
  }

  console.log("Applied legacy payment ledger backfill.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
