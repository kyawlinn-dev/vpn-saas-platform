-- Platform-level settings (singleton) for the reseller SaaS.
--
-- The trust core of postpaid settlement: resellers need to know WHERE and HOW
-- to pay the platform. This holds the platform owner's payout accounts + a
-- short instruction, editable by admin and shown to resellers on the
-- accounting/settlement screen.

create table if not exists platform_settings (
  id                      boolean     primary key default true,
  -- Array of { method, account_name, account_number, note } objects.
  payment_accounts        jsonb       not null default '[]'::jsonb,
  -- Optional free-text instruction shown above the accounts.
  settlement_instructions text,
  updated_at              timestamptz not null default now(),
  -- Enforce a single row.
  constraint platform_settings_singleton check (id = true)
);

insert into platform_settings (id) values (true)
  on conflict (id) do nothing;
