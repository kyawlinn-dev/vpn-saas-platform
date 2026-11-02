-- Telegram content only. No bot credentials, customer data or business rules.
begin;
create table if not exists public.reseller_bot_content (
  reseller_id uuid not null references public.resellers(id) on delete cascade,
  content_key text not null check (char_length(content_key) between 1 and 160 and content_key ~ '^[A-Za-z][A-Za-z0-9_.]*$'),
  custom_text text not null check (char_length(custom_text) <= 3000),
  updated_at timestamptz not null default now(),
  primary key (reseller_id, content_key)
);
alter table public.reseller_bot_content enable row level security;
revoke all on table public.reseller_bot_content from public, anon, authenticated;
grant select, insert, update, delete on table public.reseller_bot_content to service_role;
comment on table public.reseller_bot_content is 'Backend-only, reseller-scoped Telegram presentation overrides; code owns allowed keys, actions and defaults.';
notify pgrst, 'reload schema';
commit;
