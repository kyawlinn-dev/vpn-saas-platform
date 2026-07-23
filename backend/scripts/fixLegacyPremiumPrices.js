#!/usr/bin/env node
/**
 * Repair legacy Premium Plan prices for selected resellers by actual service duration.
 *
 * Current Premium prices:
 * - Around 30 days: 5,000 MMK
 * - Longer legacy 3-month package: 13,000 MMK
 *
 * Default mode is dry-run:
 *   node scripts/fixLegacyPremiumPrices.js
 *
 * Apply:
 *   node scripts/fixLegacyPremiumPrices.js --apply
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import "../src/lib/loadEnv.js";

const APPLY = process.argv.includes("--apply");
const NOW = new Date().toISOString();
const TARGET_RESELLERS = new Set(["Main Reseller", "Min Thet Khant"]);
const PREMIUM_PLAN_NAME = "Premium Plan";
const THIRTY_DAY_AMOUNT = 5000;
const NINETY_DAY_AMOUNT = 13000;
const THIRTY_DAY_LIMIT = 45;

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

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function durationDays(order) {
  const start = parseDate(order.start_date || order.created_at);
  const end = parseDate(order.expiry_date);
  if (!start || !end || end <= start) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function monthKey(value) {
  const date = parseDate(value);
  if (!date) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function settlementWindow(settlementMonth) {
  const raw = String(settlementMonth || "").slice(0, 10);
  const [year, month] = raw.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function isConfirmedApplied(payment) {
  return payment.review_status === "confirmed" && String(payment.apply_status || "applied") === "applied";
}

function paymentInSettlementMonth(payment, settlementMonth) {
  const { start, end } = settlementWindow(settlementMonth);
  const createdAt = parseDate(payment.created_at);
  return Boolean(createdAt && createdAt >= start && createdAt < end);
}

function classifyPremiumOrder(order, premium30, premium90) {
  const days = durationDays(order);
  if (!days) return null;

  if (days <= THIRTY_DAY_LIMIT) {
    return {
      duration_days: days,
      expected_amount_mmk: THIRTY_DAY_AMOUNT,
      plan: premium30,
      plan_duration_days: 30,
    };
  }

  return {
    duration_days: days,
    expected_amount_mmk: NINETY_DAY_AMOUNT,
    plan: premium90,
    plan_duration_days: 90,
  };
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

function mapById(rows) {
  return new Map(rows.map((row) => [row.id, row]));
}

function groupBy(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(row);
  }
  return grouped;
}

function nextReviewStatus(payments) {
  if (payments.some((row) => row.review_status === "pending_review")) return "pending_review";
  if (payments.some(isConfirmedApplied)) return "confirmed";
  if (payments.some((row) => row.review_status === "rejected")) return "rejected";
  return null;
}

function aggregateConfirmedPayments(payments) {
  const confirmed = payments.filter(isConfirmedApplied);
  return {
    gross_paid_mmk: confirmed.reduce((sum, row) => sum + money(row.amount_mmk), 0),
    reseller_commission_mmk: confirmed.reduce((sum, row) => sum + money(row.commission_amount_mmk), 0),
    platform_due_mmk: confirmed.reduce((sum, row) => sum + money(row.platform_due_mmk), 0),
    confirmed_order_count: confirmed.length,
  };
}

function summarizeRows(rows) {
  return rows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.old_gross_mmk += money(row.before?.amount_mmk ?? row.before?.total_paid_mmk ?? row.before?.price_mmk);
      acc.new_gross_mmk += money(row.after?.amount_mmk ?? row.after?.total_paid_mmk ?? row.after?.price_mmk);
      acc.delta_mmk = acc.new_gross_mmk - acc.old_gross_mmk;
      return acc;
    },
    { count: 0, old_gross_mmk: 0, new_gross_mmk: 0, delta_mmk: 0 }
  );
}

function addSummary(summary, key, beforeAmount, afterAmount) {
  if (!summary[key]) summary[key] = { count: 0, old_gross_mmk: 0, new_gross_mmk: 0, delta_mmk: 0 };
  summary[key].count += 1;
  summary[key].old_gross_mmk += money(beforeAmount);
  summary[key].new_gross_mmk += money(afterAmount);
  summary[key].delta_mmk = summary[key].new_gross_mmk - summary[key].old_gross_mmk;
}

async function main() {
  const [resellers, plans, orders, payments, commissionLedger, settlements] = await Promise.all([
    query("resellers", db.from("resellers").select("*").range(0, 4999)),
    query("vpn_plans", db.from("vpn_plans").select("*").range(0, 4999)),
    query("vpn_orders", db.from("vpn_orders").select("*").range(0, 4999)),
    query("order_payments", db.from("order_payments").select("*").range(0, 4999)),
    query("commission_ledger", db.from("commission_ledger").select("*").range(0, 4999)),
    query("monthly_settlements", db.from("monthly_settlements").select("*").range(0, 4999)),
  ]);

  const targetResellers = resellers.filter((reseller) => TARGET_RESELLERS.has(reseller.name));
  const targetResellerIds = new Set(targetResellers.map((reseller) => reseller.id));
  const resellersById = mapById(resellers);
  const plansById = mapById(plans);
  const premium30 = plans.find((plan) => plan.name === PREMIUM_PLAN_NAME && Number(plan.duration_days) === 30);
  const premium90 = plans.find((plan) => plan.name === PREMIUM_PLAN_NAME && Number(plan.duration_days) === 90);

  if (!premium30 || !premium90) {
    throw new Error("Missing current 30-day or 90-day Premium Plan rows");
  }

  const paymentsByOrder = groupBy(payments, "order_id");
  const ledgerByOrder = groupBy(commissionLedger, "order_id");
  const paymentUpdates = [];
  const orderClassifications = new Map();
  const skippedOrders = [];

  for (const order of orders) {
    if (!targetResellerIds.has(order.reseller_id)) continue;
    const currentPlan = plansById.get(order.plan_id);
    if (!currentPlan || currentPlan.name !== PREMIUM_PLAN_NAME) continue;
    if (order.order_type && order.order_type !== "purchase") continue;

    const classification = classifyPremiumOrder(order, premium30, premium90);
    if (!classification) {
      skippedOrders.push({
        id: order.id,
        reseller: resellersById.get(order.reseller_id)?.name || "Unknown",
        customer_id: order.customer_id,
        reason: "missing_or_invalid_duration",
        start_date: order.start_date,
        created_at: order.created_at,
        expiry_date: order.expiry_date,
      });
      continue;
    }

    const orderPayments = paymentsByOrder.get(order.id) || [];
    const confirmedApplied = orderPayments.filter(isConfirmedApplied);
    if (confirmedApplied.length > 1) {
      skippedOrders.push({
        id: order.id,
        reseller: resellersById.get(order.reseller_id)?.name || "Unknown",
        customer_id: order.customer_id,
        reason: "multiple_confirmed_payments",
        payment_count: confirmedApplied.length,
      });
      continue;
    }

    orderClassifications.set(order.id, classification);
  }

  for (const payment of payments) {
    const classification = orderClassifications.get(payment.order_id);
    if (!classification) continue;

    const expectedAmount = classification.expected_amount_mmk;
    const expectedCommission = commission(expectedAmount, payment.commission_percent);
    const expectedPlatformDue = platformDue(expectedAmount, expectedCommission);
    const after = {
      amount_mmk: expectedAmount,
      commission_amount_mmk: expectedCommission,
      platform_due_mmk: expectedPlatformDue,
      plan_id: classification.plan.id,
      package_duration_days: classification.plan_duration_days,
      package_data_limit_gb: classification.plan.data_limit_gb,
      updated_at: NOW,
    };

    if (
      money(payment.amount_mmk) !== expectedAmount ||
      money(payment.commission_amount_mmk) !== expectedCommission ||
      money(payment.platform_due_mmk) !== expectedPlatformDue ||
      payment.plan_id !== classification.plan.id ||
      Number(payment.package_duration_days || 0) !== classification.plan_duration_days ||
      money(payment.package_data_limit_gb) !== money(classification.plan.data_limit_gb)
    ) {
      paymentUpdates.push({
        id: payment.id,
        order_id: payment.order_id,
        reseller_id: payment.reseller_id,
        reseller_name: resellersById.get(payment.reseller_id)?.name || "Unknown",
        actual_duration_days: classification.duration_days,
        expected_plan_id: classification.plan.id,
        expected_plan_duration_days: classification.plan_duration_days,
        before: {
          amount_mmk: money(payment.amount_mmk),
          commission_amount_mmk: money(payment.commission_amount_mmk),
          platform_due_mmk: money(payment.platform_due_mmk),
          plan_id: payment.plan_id,
          package_duration_days: payment.package_duration_days,
          package_data_limit_gb: payment.package_data_limit_gb,
        },
        after,
      });
    }
  }

  const projectedPayments = payments.map((payment) => {
    const update = paymentUpdates.find((row) => row.id === payment.id);
    return update ? { ...payment, ...update.after } : payment;
  });
  const projectedPaymentsByOrder = groupBy(projectedPayments, "order_id");

  const orderUpdates = [];
  for (const order of orders) {
    const classification = orderClassifications.get(order.id);
    if (!classification) continue;

    const orderPayments = projectedPaymentsByOrder.get(order.id) || [];
    const confirmed = orderPayments.filter(isConfirmedApplied);
    const totalPaid = confirmed.reduce((sum, row) => sum + money(row.amount_mmk), 0);
    const totalCommission = confirmed.reduce((sum, row) => sum + money(row.commission_amount_mmk), 0);
    const reviewStatus = nextReviewStatus(orderPayments);
    const patch = {
      plan_id: classification.plan.id,
      price_mmk: classification.expected_amount_mmk,
      total_paid_mmk: totalPaid,
      commission_amount_mmk: totalCommission,
      payment_status: totalPaid > 0 ? "paid" : "unpaid",
      updated_at: NOW,
    };
    if (reviewStatus) patch.review_status = reviewStatus;

    if (
      order.plan_id !== patch.plan_id ||
      money(order.price_mmk) !== patch.price_mmk ||
      money(order.total_paid_mmk) !== patch.total_paid_mmk ||
      money(order.commission_amount_mmk) !== patch.commission_amount_mmk ||
      order.payment_status !== patch.payment_status ||
      (reviewStatus && order.review_status !== reviewStatus)
    ) {
      orderUpdates.push({
        id: order.id,
        reseller_id: order.reseller_id,
        reseller_name: resellersById.get(order.reseller_id)?.name || "Unknown",
        actual_duration_days: classification.duration_days,
        before: {
          plan_id: order.plan_id,
          price_mmk: money(order.price_mmk),
          total_paid_mmk: money(order.total_paid_mmk),
          commission_amount_mmk: money(order.commission_amount_mmk),
          payment_status: order.payment_status,
          review_status: order.review_status,
        },
        after: patch,
      });
    }
  }

  const ledgerUpdates = [];
  for (const order of orders) {
    if (!orderClassifications.has(order.id)) continue;
    const expectedCommission = (projectedPaymentsByOrder.get(order.id) || [])
      .filter(isConfirmedApplied)
      .reduce((sum, payment) => sum + money(payment.commission_amount_mmk), 0);
    if (expectedCommission <= 0) continue;

    const rows = ledgerByOrder.get(order.id) || [];
    if (rows.length === 0) continue;

    const primary = rows[0];
    if (money(primary.amount_mmk) !== expectedCommission) {
      ledgerUpdates.push({
        id: primary.id,
        order_id: order.id,
        reseller_id: order.reseller_id,
        reseller_name: resellersById.get(order.reseller_id)?.name || "Unknown",
        before: { amount_mmk: money(primary.amount_mmk) },
        after: { amount_mmk: expectedCommission, updated_at: NOW },
      });
    }
  }

  const settlementUpdates = [];
  for (const settlement of settlements) {
    if (!targetResellerIds.has(settlement.reseller_id)) continue;
    const monthPayments = projectedPayments.filter(
      (payment) =>
        payment.reseller_id === settlement.reseller_id &&
        paymentInSettlementMonth(payment, settlement.settlement_month)
    );
    const aggregate = aggregateConfirmedPayments(monthPayments);
    const patch = {
      gross_paid_mmk: aggregate.gross_paid_mmk,
      reseller_commission_mmk: aggregate.reseller_commission_mmk,
      platform_due_mmk: aggregate.platform_due_mmk,
      confirmed_order_count: aggregate.confirmed_order_count,
      updated_at: NOW,
    };

    if (
      money(settlement.gross_paid_mmk) !== patch.gross_paid_mmk ||
      money(settlement.reseller_commission_mmk) !== patch.reseller_commission_mmk ||
      money(settlement.platform_due_mmk) !== patch.platform_due_mmk ||
      money(settlement.confirmed_order_count) !== patch.confirmed_order_count
    ) {
      settlementUpdates.push({
        id: settlement.id,
        reseller_id: settlement.reseller_id,
        reseller_name: resellersById.get(settlement.reseller_id)?.name || "Unknown",
        settlement_month: settlement.settlement_month,
        before: {
          gross_paid_mmk: money(settlement.gross_paid_mmk),
          reseller_commission_mmk: money(settlement.reseller_commission_mmk),
          platform_due_mmk: money(settlement.platform_due_mmk),
          confirmed_order_count: money(settlement.confirmed_order_count),
        },
        after: patch,
      });
    }
  }

  const backup = {
    generated_at: NOW,
    mode: APPLY ? "apply" : "dry-run",
    target_resellers: [...TARGET_RESELLERS],
    source_project: SUPABASE_URL,
    duration_rule: {
      thirty_day_if_actual_days_lte: THIRTY_DAY_LIMIT,
      thirty_day_amount_mmk: THIRTY_DAY_AMOUNT,
      ninety_day_amount_mmk: NINETY_DAY_AMOUNT,
    },
    tables: {
      resellers,
      vpn_plans: plans,
      vpn_orders: orders,
      order_payments: payments,
      commission_ledger: commissionLedger,
      monthly_settlements: settlements,
    },
    skipped_orders: skippedOrders,
    planned: {
      payment_updates: paymentUpdates,
      order_updates: orderUpdates,
      commission_ledger_updates: ledgerUpdates,
      monthly_settlement_updates: settlementUpdates,
    },
  };

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(
    BACKUP_DIR,
    `legacy-premium-duration-classification-${NOW.replaceAll(":", "-")}${APPLY ? "-apply" : "-dry-run"}.json`
  );
  await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));

  const byReseller = {};
  const byDuration = {};
  const affectedOrders = new Set();
  for (const update of paymentUpdates) {
    affectedOrders.add(update.order_id);
    addSummary(byReseller, update.reseller_name, update.before.amount_mmk, update.after.amount_mmk);
    addSummary(byDuration, `${update.actual_duration_days} actual days`, update.before.amount_mmk, update.after.amount_mmk);
  }

  console.log(JSON.stringify(
    {
      mode: APPLY ? "APPLY" : "DRY_RUN",
      backup_path: backupPath,
      planned_counts: {
        affected_orders: affectedOrders.size,
        payment_updates: paymentUpdates.length,
        order_updates: orderUpdates.length,
        commission_ledger_updates: ledgerUpdates.length,
        monthly_settlement_updates: settlementUpdates.length,
        skipped_orders: skippedOrders.length,
      },
      payment_delta: summarizeRows(paymentUpdates),
      by_reseller: byReseller,
      by_duration: byDuration,
      sample_payment_updates: paymentUpdates.slice(0, 10).map((row) => ({
        order_id: row.order_id,
        reseller: row.reseller_name,
        actual_duration_days: row.actual_duration_days,
        before_amount_mmk: row.before.amount_mmk,
        after_amount_mmk: row.after.amount_mmk,
      })),
      skipped_orders: skippedOrders,
      settlement_updates: settlementUpdates.map((row) => ({
        reseller: row.reseller_name,
        month: monthKey(row.settlement_month) || row.settlement_month,
        before: row.before,
        after: row.after,
      })),
    },
    null,
    2
  ));

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to make changes.");
    return;
  }

  for (const update of paymentUpdates) {
    await mutate(`update order_payments ${update.id}`, db.from("order_payments").update(update.after).eq("id", update.id));
  }
  for (const update of orderUpdates) {
    await mutate(`update vpn_orders ${update.id}`, db.from("vpn_orders").update(update.after).eq("id", update.id));
  }
  for (const update of ledgerUpdates) {
    await mutate(`update commission_ledger ${update.id}`, db.from("commission_ledger").update(update.after).eq("id", update.id));
  }
  for (const update of settlementUpdates) {
    await mutate(`update monthly_settlements ${update.id}`, db.from("monthly_settlements").update(update.after).eq("id", update.id));
  }

  console.log("Applied legacy Premium Plan duration-based price fix.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
