-- Migration 0018: add admin_telegram_user_id to reseller_miniapps
-- Stores the reseller's own Telegram user ID so the bot can send them
-- payment-screenshot notifications with Confirm / Reject inline buttons.
-- Set via /register_admin in the bot or (future) from the admin dashboard.

ALTER TABLE reseller_miniapps
  ADD COLUMN IF NOT EXISTS admin_telegram_user_id bigint;
