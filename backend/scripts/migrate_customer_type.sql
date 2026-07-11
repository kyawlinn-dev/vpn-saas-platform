-- ============================================================
-- migrate_customer_type.sql
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================

-- Step 1: Add customer_type column with a default of 'normal'.
-- The CHECK constraint keeps the values to exactly two options.
ALTER TABLE vpn_customers
  ADD COLUMN IF NOT EXISTS customer_type TEXT NOT NULL DEFAULT 'normal'
  CHECK (customer_type IN ('normal', 'telegram'));

-- Step 2: Backfill existing Telegram customers.
-- Any vpn_customers row that has at least one telegram_links row is a tele user.
UPDATE vpn_customers
SET customer_type = 'telegram'
WHERE id IN (
  SELECT DISTINCT customer_id
  FROM telegram_links
  WHERE customer_id IS NOT NULL
);

-- Step 3: Verify the result — run this SELECT to confirm counts look right.
SELECT customer_type, COUNT(*) AS count
FROM vpn_customers
GROUP BY customer_type
ORDER BY customer_type;
