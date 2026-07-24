import express from "express";
import { supabase } from "../../lib/supabase.js";
import { parsePagination, sanitizeSearchTerm } from "../../utils/pagination.js";
import { enrichCustomer } from "../../services/customerOrderEnrichmentService.js";

const router = express.Router();

const ORDER_SELECT_FOR_CUSTOMERS = `
  *,
  plan:vpn_plans(id, name, price_mmk, duration_days, data_limit_gb, max_devices, allowed_regions),
  payments:order_payments(
    id, order_id, customer_id, reseller_id, amount_mmk, commission_percent,
    commission_amount_mmk, platform_due_mmk, review_status, payment_type,
    apply_status, source, payment_method, payment_note, created_at, submitted_at,
    reviewed_at, review_note, package_duration_days, package_data_limit_gb
  ),
  keys:vpn_keys!vpn_keys_order_tenant_fk(
    id, order_id, customer_id, reseller_id, server_id, outline_key_id,
    key_name, access_url, data_limit_bytes, used_bytes, status, created_at,
    deleted_at
  )
`;

function isExpiringSoon(expiryDate, days = 7) {
  if (!expiryDate) return false;
  const expiry = new Date(expiryDate).getTime();
  if (Number.isNaN(expiry)) return false;
  const diffDays = (expiry - Date.now()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= days;
}

// GET /api/reseller/customers
// Paginated, reseller-scoped customer list. Mirrors /api/admin/customers'
// batch-fetch shape, reusing the same enrichCustomer helper so both surfaces
// agree on what "telegram" customer_type and "active order" mean.
router.get("/", async (req, res) => {
  try {
    const reseller = req.reseller;
    const { page, limit, offset } = parsePagination(req.query);
    const { search, customer_type, status } = req.query;

    const { data: miniapp } = await supabase
      .from("reseller_miniapps")
      .select("brand_name")
      .eq("reseller_id", reseller.id)
      .maybeSingle();
    const accessLabel = miniapp?.brand_name || reseller.name || "NovaNet MM";

    // Filters that depend on data outside the vpn_customers row itself
    // (telegram linkage, active-order status) are resolved into an id set
    // first, then intersected and applied as a single .in("id", ids) so the
    // main query still does real server-side pagination.
    let allowedIds = null;
    const intersect = (ids) => {
      const next = new Set(ids);
      allowedIds = allowedIds === null ? next : new Set([...allowedIds].filter((id) => next.has(id)));
    };

    if (customer_type === "telegram" || customer_type === "normal") {
      const { data: links, error } = await supabase
        .from("telegram_links")
        .select("customer_id")
        .eq("reseller_id", reseller.id);

      if (error) {
        console.error("GET /api/reseller/customers telegram_links error:", error);
        return res.status(500).json({ error: "Failed to load customers" });
      }

      const telegramIds = new Set((links ?? []).map((link) => link.customer_id));

      if (customer_type === "telegram") {
        intersect(telegramIds);
      } else {
        const { data: allIds, error: idsError } = await supabase
          .from("vpn_customers")
          .select("id")
          .eq("reseller_id", reseller.id);

        if (idsError) {
          console.error("GET /api/reseller/customers id list error:", idsError);
          return res.status(500).json({ error: "Failed to load customers" });
        }

        intersect((allIds ?? []).map((row) => row.id).filter((id) => !telegramIds.has(id)));
      }
    }

    if (status && status !== "all") {
      const { data: activeOrders, error } = await supabase
        .from("vpn_orders")
        .select("customer_id, expiry_date")
        .eq("reseller_id", reseller.id)
        .eq("status", "active");

      if (error) {
        console.error("GET /api/reseller/customers active orders error:", error);
        return res.status(500).json({ error: "Failed to load customers" });
      }

      const activeIds = new Set();
      const expiringIds = new Set();
      for (const order of activeOrders ?? []) {
        activeIds.add(order.customer_id);
        if (isExpiringSoon(order.expiry_date)) expiringIds.add(order.customer_id);
      }

      if (status === "active") {
        intersect([...activeIds].filter((id) => !expiringIds.has(id)));
      } else if (status === "expiring") {
        intersect(expiringIds);
      } else if (status === "inactive") {
        const { data: allIds, error: idsError } = await supabase
          .from("vpn_customers")
          .select("id")
          .eq("reseller_id", reseller.id);

        if (idsError) {
          console.error("GET /api/reseller/customers id list error:", idsError);
          return res.status(500).json({ error: "Failed to load customers" });
        }

        intersect((allIds ?? []).map((row) => row.id).filter((id) => !activeIds.has(id)));
      }
    }

    if (allowedIds !== null && allowedIds.size === 0) {
      return res.json({ data: [], total: 0, page, limit });
    }

    let query = supabase
      .from("vpn_customers")
      .select("*", { count: "exact" })
      .eq("reseller_id", reseller.id);

    if (allowedIds !== null) {
      query = query.in("id", [...allowedIds]);
    }

    const searchTerm = sanitizeSearchTerm(search);
    if (searchTerm) {
      const pattern = `*${searchTerm}*`;
      query = query.or(
        `full_name.ilike.${pattern},telegram_username.ilike.${pattern},phone.ilike.${pattern}`
      );
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: customers, count, error } = await query;

    if (error) {
      console.error("GET /api/reseller/customers query error:", error);
      return res.status(500).json({ error: "Failed to load customers" });
    }

    const customerList = customers ?? [];
    const customerIds = customerList.map((customer) => customer.id);

    let ordersByCustomerId = new Map();
    let telegramByCustomerId = new Map();

    if (customerIds.length > 0) {
      const [{ data: orders, error: ordersError }, { data: telegramLinks, error: telegramError }] =
        await Promise.all([
          supabase
            .from("vpn_orders")
            .select(ORDER_SELECT_FOR_CUSTOMERS)
            .in("customer_id", customerIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("telegram_links")
            .select(
              "id, telegram_user_id, telegram_username, customer_id, reseller_id, trial_used_at, trial_order_id, created_at"
            )
            .in("customer_id", customerIds),
        ]);

      if (ordersError) {
        console.error("GET /api/reseller/customers orders error:", ordersError);
        return res.status(500).json({ error: "Failed to load customers" });
      }
      if (telegramError) {
        console.error("GET /api/reseller/customers telegram error:", telegramError);
        return res.status(500).json({ error: "Failed to load customers" });
      }

      for (const order of orders ?? []) {
        const list = ordersByCustomerId.get(order.customer_id) ?? [];
        list.push(order);
        ordersByCustomerId.set(order.customer_id, list);
      }
      for (const link of telegramLinks ?? []) {
        telegramByCustomerId.set(link.customer_id, link);
      }
    }

    return res.json({
      data: customerList.map((customer) =>
        enrichCustomer(
          { ...customer, reseller: { name: accessLabel } },
          {
            orders: ordersByCustomerId.get(customer.id) ?? [],
            telegramLink: telegramByCustomerId.get(customer.id) ?? null,
            req,
          }
        )
      ),
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("GET /api/reseller/customers crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/reseller/customers/counts
// Filter-tab counts in 3 queries instead of running the full customer list
// 6 times (once per tab) — the repeated round trips were saturating the
// connection pool under real usage even though each one was individually
// fast.
router.get("/counts", async (req, res) => {
  try {
    const reseller = req.reseller;

    const [
      { data: allCustomers, error: allError },
      { data: telegramLinks, error: linksError },
      { data: activeOrders, error: ordersError },
    ] = await Promise.all([
      supabase.from("vpn_customers").select("id").eq("reseller_id", reseller.id),
      supabase.from("telegram_links").select("customer_id").eq("reseller_id", reseller.id),
      supabase
        .from("vpn_orders")
        .select("customer_id, expiry_date")
        .eq("reseller_id", reseller.id)
        .eq("status", "active"),
    ]);

    if (allError || linksError || ordersError) {
      console.error("GET /api/reseller/customers/counts query error:", { allError, linksError, ordersError });
      return res.status(500).json({ error: "Failed to load customer counts" });
    }

    const telegramIds = new Set((telegramLinks ?? []).map((link) => link.customer_id));
    const activeIds = new Set();
    const expiringIds = new Set();
    for (const order of activeOrders ?? []) {
      activeIds.add(order.customer_id);
      if (isExpiringSoon(order.expiry_date)) expiringIds.add(order.customer_id);
    }

    const total = (allCustomers ?? []).length;
    const telegram = (allCustomers ?? []).filter((customer) => telegramIds.has(customer.id)).length;

    return res.json({
      total,
      normal: total - telegram,
      telegram,
      active: [...activeIds].filter((id) => !expiringIds.has(id)).length,
      expiring: expiringIds.size,
      inactive: total - activeIds.size,
    });
  } catch (err) {
    console.error("GET /api/reseller/customers/counts crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
