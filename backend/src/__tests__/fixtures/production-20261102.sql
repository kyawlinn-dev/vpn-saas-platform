-- Schema-only production metadata snapshot, 2026-11-02. No customer rows or secrets.
-- auth.users is a minimal FK stub; Supabase auth/control-plane behavior is not simulated.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
grant usage on schema public to anon,authenticated,service_role;
create table public."access_tokens"(
"id" uuid default gen_random_uuid() not null,
"customer_id" uuid not null,
"reseller_id" uuid not null,
"order_id" uuid,
"token" text not null,
"status" text not null,
"expires_at" timestamp with time zone,
"last_used_at" timestamp with time zone,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null
);
create table public."admins"(
"id" uuid default gen_random_uuid() not null,
"supabase_user_id" uuid not null,
"full_name" text,
"email" text,
"status" text not null,
"created_at" timestamp with time zone default now() not null
);
create table public."app_events"(
"id" uuid default gen_random_uuid() not null,
"event_name" text not null,
"event_source" text default 'backend'::text not null,
"actor_type" text,
"reseller_id" uuid,
"customer_id" uuid,
"admin_id" uuid,
"telegram_user_id" bigint,
"order_id" uuid,
"payment_id" uuid,
"server_id" uuid,
"plan_id" uuid,
"page" text,
"route" text,
"status" text default 'info'::text not null,
"metadata" jsonb default '{}'::jsonb not null,
"session_id" text,
"user_agent" text,
"ip_hash" text,
"created_at" timestamp with time zone default now() not null
);
create table public."commission_ledger"(
"id" uuid default gen_random_uuid() not null,
"order_id" uuid not null,
"reseller_id" uuid not null,
"amount_mmk" integer not null,
"status" text not null,
"created_at" timestamp with time zone default now() not null,
"paid_at" timestamp with time zone,
"updated_at" timestamp with time zone default now() not null
);
create table public."dashboard_purchase_operations"(
"id" uuid default gen_random_uuid() not null,
"reseller_id" uuid not null,
"request_key" uuid not null,
"request_hash" text not null,
"customer_id" uuid not null,
"order_id" uuid not null,
"plan_snapshot" jsonb not null,
"state" text not null,
"setup_owner" uuid,
"claimed_at" timestamp with time zone,
"last_error_code" text,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null
);
create table public."monthly_settlements"(
"id" uuid default gen_random_uuid() not null,
"reseller_id" uuid not null,
"settlement_month" date not null,
"status" text default 'draft'::text not null,
"gross_paid_mmk" integer default 0 not null,
"reseller_commission_mmk" integer default 0 not null,
"platform_due_mmk" integer default 0 not null,
"pending_review_mmk" integer default 0 not null,
"unpaid_mmk" integer default 0 not null,
"rejected_mmk" integer default 0 not null,
"confirmed_order_count" integer default 0 not null,
"pending_review_count" integer default 0 not null,
"unpaid_order_count" integer default 0 not null,
"rejected_order_count" integer default 0 not null,
"total_order_count" integer default 0 not null,
"transfer_note" text,
"transfer_reference" text,
"transfer_proof_url" text,
"submitted_at" timestamp with time zone,
"confirmed_at" timestamp with time zone,
"confirmed_by_admin_id" uuid,
"reopened_at" timestamp with time zone,
"admin_note" text,
"snapshot_basis" jsonb default '{}'::jsonb not null,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null
);
create table public."notifications_sent"(
"id" uuid default gen_random_uuid() not null,
"customer_id" uuid not null,
"event_type" text not null,
"order_id" uuid,
"channel" text default 'telegram'::text not null,
"sent_at" timestamp with time zone default now() not null
);
create table public."order_payments"(
"id" uuid default gen_random_uuid() not null,
"order_id" uuid not null,
"customer_id" uuid not null,
"reseller_id" uuid not null,
"amount_mmk" integer not null,
"commission_percent" numeric not null,
"commission_amount_mmk" integer default 0 not null,
"platform_due_mmk" integer default 0 not null,
"payment_method" text,
"payment_note" text,
"payment_screenshot_url" text,
"review_status" text default 'pending_review'::text not null,
"source" text,
"submitted_at" timestamp with time zone default now() not null,
"reviewed_at" timestamp with time zone,
"reviewed_by_reseller_id" uuid,
"reviewed_by_admin_id" uuid,
"review_note" text,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null,
"payment_type" text default 'initial'::text not null,
"apply_status" text default 'applied'::text not null,
"plan_id" uuid,
"package_duration_days" integer,
"package_data_limit_gb" numeric,
"applied_at" timestamp with time zone,
"apply_error" text,
"idempotency_key" text
);
create table public."platform_settings"(
"id" boolean default true not null,
"payment_accounts" jsonb default '[]'::jsonb not null,
"settlement_instructions" text,
"updated_at" timestamp with time zone default now() not null
);
create table public."reseller_miniapps"(
"id" uuid default gen_random_uuid() not null,
"reseller_id" uuid not null,
"miniapp_slug" text not null,
"bot_token_encrypted" text,
"bot_username" text,
"bot_id" bigint,
"bot_connected" boolean default false not null,
"brand_name" text not null,
"brand_logo_url" text,
"support_username" text,
"primary_color" text default '#2f7bff'::text not null,
"trial_enabled" boolean default false not null,
"trial_data_limit_gb" integer default 5 not null,
"trial_duration_days" integer default 7 not null,
"is_enabled" boolean default true not null,
"payment_info" jsonb default '[]'::jsonb,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null,
"trial_protocol" text default 'shadowsocks'::text not null,
"admin_telegram_user_id" bigint
);
create table public."reseller_notification_templates"(
"id" uuid default gen_random_uuid() not null,
"reseller_id" uuid not null,
"event_type" text not null,
"custom_text" text not null,
"updated_at" timestamp with time zone default now() not null
);
create table public."resellers"(
"id" uuid default gen_random_uuid() not null,
"name" text not null,
"email" text,
"telegram_username" text,
"phone" text,
"commission_percent" numeric not null,
"status" text not null,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null,
"supabase_user_id" uuid,
"notifications_paused" boolean default false not null
);
create table public."server_health_status"(
"server_id" uuid not null,
"outline_api_status" text default 'unknown'::text not null,
"last_checked_at" timestamp with time zone,
"last_success_at" timestamp with time zone,
"last_usage_sync_at" timestamp with time zone,
"last_error" text,
"response_ms" integer,
"active_key_count_seen" integer,
"consecutive_failures" integer default 0 not null,
"updated_at" timestamp with time zone default now() not null
);
create table public."system_job_runs"(
"job_name" text not null,
"status" text default 'idle'::text not null,
"last_started_at" timestamp with time zone,
"last_finished_at" timestamp with time zone,
"last_success_at" timestamp with time zone,
"last_error" text,
"consecutive_failures" integer default 0 not null,
"run_count" integer default 0 not null,
"updated_at" timestamp with time zone default now() not null
);
create table public."telegram_links"(
"id" uuid default gen_random_uuid() not null,
"telegram_user_id" bigint not null,
"telegram_username" text,
"customer_id" uuid not null,
"reseller_id" uuid not null,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null,
"trial_used_at" timestamp with time zone,
"trial_order_id" uuid
);
create table public."token_server_assignments"(
"id" uuid default gen_random_uuid() not null,
"token_id" uuid not null,
"server_id" uuid not null,
"vpn_key_id" uuid,
"is_active" boolean not null,
"created_at" timestamp with time zone default now() not null
);
create table public."vpn_customers"(
"id" uuid default gen_random_uuid() not null,
"reseller_id" uuid,
"full_name" text not null,
"telegram_username" text,
"phone" text,
"notes" text,
"status" text not null,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null,
"ssconf_token" text,
"customer_type" text default 'normal'::text not null,
"protocol_preference" text default 'shadowsocks'::text not null
);
create table public."vpn_keys"(
"id" uuid default gen_random_uuid() not null,
"order_id" uuid,
"customer_id" uuid,
"reseller_id" uuid,
"server_id" uuid,
"outline_key_id" text,
"key_name" text not null,
"access_url" text,
"data_limit_bytes" bigint,
"used_bytes" bigint not null,
"status" text not null,
"is_used" boolean,
"used_at" timestamp with time zone,
"ssconf_token" text,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null,
"deleted_at" timestamp with time zone,
"protocol" text default 'shadowsocks'::text not null,
"key_credentials" jsonb
);
create table public."vpn_orders"(
"id" uuid default gen_random_uuid() not null,
"customer_id" uuid not null,
"reseller_id" uuid,
"plan_id" uuid not null,
"status" text not null,
"price_mmk" integer not null,
"commission_percent" numeric not null,
"commission_amount_mmk" integer not null,
"total_paid_mmk" integer not null,
"start_date" date,
"expiry_date" date,
"payment_status" text not null,
"payment_note" text,
"payment_screenshot_url" text,
"activated_at" timestamp with time zone,
"stopped_at" timestamp with time zone,
"order_type" text,
"review_status" text,
"source" text,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null,
"usage_baseline_bytes" bigint default 0 not null,
"quota_limit_bytes" bigint
);
create table public."vpn_plans"(
"id" uuid default gen_random_uuid() not null,
"name" text not null,
"price_mmk" integer not null,
"data_limit_gb" integer not null,
"duration_days" integer not null,
"max_devices" integer not null,
"is_active" boolean not null,
"is_trial" boolean not null,
"features" jsonb default '{}'::jsonb not null,
"sort_order" integer not null,
"allowed_regions" text[],
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null
);
create table public."vpn_servers"(
"id" uuid default gen_random_uuid() not null,
"name" text not null,
"provider" text not null,
"region" text not null,
"region_code" text,
"droplet_id" bigint,
"host_ip" text,
"outline_api_url" text,
"outline_cert_sha256" text,
"status" text not null,
"is_active" boolean,
"is_default" boolean not null,
"max_active_keys" integer not null,
"current_active_keys" integer not null,
"last_error" text,
"display_country" text,
"display_city" text,
"flag_emoji" text,
"server_number" integer,
"sort_order" integer not null,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone,
"server_tier" text default 'premium'::text not null,
"panel_type" text default 'outline'::text not null,
"panel_url" text,
"panel_public_url" text,
"panel_username" text,
"panel_password_encrypted" text,
"marzneshin_service_ids" integer[] default '{}'::integer[],
"marzneshin_vless_service_ids" integer[] default '{}'::integer[],
"marzneshin_vless_trial_service_ids" integer[] default '{}'::integer[]
);
alter table public."access_tokens" add constraint "access_tokens_pkey" PRIMARY KEY (id);
alter table public."admins" add constraint "admins_pkey" PRIMARY KEY (id);
alter table public."app_events" add constraint "app_events_pkey" PRIMARY KEY (id);
alter table public."app_events" add constraint "app_events_status_check" CHECK ((status = ANY (ARRAY['info'::text, 'success'::text, 'blocked'::text, 'failed'::text])));
alter table public."commission_ledger" add constraint "commission_ledger_pkey" PRIMARY KEY (id);
alter table public."dashboard_purchase_operations" add constraint "dashboard_purchase_operations_check" CHECK (((state = 'running'::text) = (setup_owner IS NOT NULL)));
alter table public."dashboard_purchase_operations" add constraint "dashboard_purchase_operations_order_id_key" UNIQUE (order_id);
alter table public."dashboard_purchase_operations" add constraint "dashboard_purchase_operations_pkey" PRIMARY KEY (id);
alter table public."dashboard_purchase_operations" add constraint "dashboard_purchase_operations_reseller_id_request_key_key" UNIQUE (reseller_id, request_key);
alter table public."dashboard_purchase_operations" add constraint "dashboard_purchase_operations_state_check" CHECK ((state = ANY (ARRAY['not_started'::text, 'awaiting_payment'::text, 'queued'::text, 'ready'::text, 'failed'::text, 'running'::text])));
alter table public."monthly_settlements" add constraint "monthly_settlements_pkey" PRIMARY KEY (id);
alter table public."monthly_settlements" add constraint "monthly_settlements_reseller_id_settlement_month_key" UNIQUE (reseller_id, settlement_month);
alter table public."monthly_settlements" add constraint "monthly_settlements_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'confirmed'::text, 'reopened'::text]))) NOT VALID;
alter table public."notifications_sent" add constraint "notifications_sent_channel_check" CHECK ((channel = 'telegram'::text));
alter table public."notifications_sent" add constraint "notifications_sent_event_type_check" CHECK ((event_type = ANY (ARRAY['trial_ending_24h'::text, 'trial_expired'::text, 'subscription_expiring_3d'::text, 'subscription_expired'::text, 'payment_confirmed'::text, 'payment_rejected'::text, 'data_limit_reached'::text, 'data_limit_warning'::text])));
alter table public."notifications_sent" add constraint "notifications_sent_pkey" PRIMARY KEY (id);
alter table public."notifications_sent" add constraint "notifications_sent_unique" UNIQUE (customer_id, event_type, order_id);
alter table public."order_payments" add constraint "order_payments_apply_status_check" CHECK ((apply_status = ANY (ARRAY['pending'::text, 'applied'::text, 'failed'::text, 'reversed'::text]))) NOT VALID;
alter table public."order_payments" add constraint "order_payments_money_check" CHECK (((amount_mmk >= 0) AND (commission_amount_mmk >= 0) AND (platform_due_mmk >= 0) AND (commission_percent >= (0)::numeric) AND (commission_percent <= (100)::numeric) AND (amount_mmk = (commission_amount_mmk + platform_due_mmk)))) NOT VALID;
alter table public."order_payments" add constraint "order_payments_pkey" PRIMARY KEY (id);
alter table public."order_payments" add constraint "order_payments_review_status_check" CHECK ((review_status = ANY (ARRAY['pending_review'::text, 'confirmed'::text, 'rejected'::text]))) NOT VALID;
alter table public."order_payments" add constraint "order_payments_type_check" CHECK ((payment_type = ANY (ARRAY['initial'::text, 'extend'::text, 'renew'::text, 'adjustment'::text]))) NOT VALID;
alter table public."platform_settings" add constraint "platform_settings_pkey" PRIMARY KEY (id);
alter table public."platform_settings" add constraint "platform_settings_singleton" CHECK ((id = true));
alter table public."reseller_miniapps" add constraint "reseller_miniapps_miniapp_slug_key" UNIQUE (miniapp_slug);
alter table public."reseller_miniapps" add constraint "reseller_miniapps_pkey" PRIMARY KEY (id);
alter table public."reseller_miniapps" add constraint "reseller_miniapps_reseller_id_key" UNIQUE (reseller_id);
alter table public."reseller_miniapps" add constraint "reseller_miniapps_trial_protocol_check" CHECK ((trial_protocol = ANY (ARRAY['shadowsocks'::text, 'vless'::text])));
alter table public."reseller_notification_templates" add constraint "reseller_notification_templates_event_type_check" CHECK ((event_type = ANY (ARRAY['trial_ending_24h'::text, 'trial_expired'::text, 'subscription_expiring_3d'::text, 'subscription_expired'::text, 'payment_confirmed'::text, 'payment_rejected'::text, 'data_limit_reached'::text, 'data_limit_warning'::text])));
alter table public."reseller_notification_templates" add constraint "reseller_notification_templates_pkey" PRIMARY KEY (id);
alter table public."reseller_notification_templates" add constraint "reseller_notification_templates_unique" UNIQUE (reseller_id, event_type);
alter table public."resellers" add constraint "resellers_pkey" PRIMARY KEY (id);
alter table public."resellers" add constraint "resellers_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text, 'pending'::text]))) NOT VALID;
alter table public."server_health_status" add constraint "server_health_status_pkey" PRIMARY KEY (server_id);
alter table public."server_health_status" add constraint "server_health_status_status_check" CHECK ((outline_api_status = ANY (ARRAY['unknown'::text, 'healthy'::text, 'degraded'::text, 'failed'::text, 'stale'::text])));
alter table public."system_job_runs" add constraint "system_job_runs_pkey" PRIMARY KEY (job_name);
alter table public."system_job_runs" add constraint "system_job_runs_status_check" CHECK ((status = ANY (ARRAY['idle'::text, 'running'::text, 'success'::text, 'failed'::text, 'stale'::text])));
alter table public."telegram_links" add constraint "telegram_links_pkey" PRIMARY KEY (id);
alter table public."telegram_links" add constraint "telegram_links_reseller_id_telegram_user_id_key" UNIQUE (reseller_id, telegram_user_id);
alter table public."token_server_assignments" add constraint "token_server_assignments_pkey" PRIMARY KEY (id);
alter table public."vpn_customers" add constraint "vpn_customers_customer_type_check" CHECK ((customer_type = ANY (ARRAY['normal'::text, 'telegram'::text]))) NOT VALID;
alter table public."vpn_customers" add constraint "vpn_customers_pkey" PRIMARY KEY (id);
alter table public."vpn_customers" add constraint "vpn_customers_protocol_preference_check" CHECK ((protocol_preference = ANY (ARRAY['shadowsocks'::text, 'vless'::text, 'hysteria2'::text])));
alter table public."vpn_customers" add constraint "vpn_customers_reseller_required" CHECK ((reseller_id IS NOT NULL)) NOT VALID;
alter table public."vpn_customers" add constraint "vpn_customers_ssconf_token_key" UNIQUE (ssconf_token);
alter table public."vpn_keys" add constraint "vpn_keys_pkey" PRIMARY KEY (id);
alter table public."vpn_keys" add constraint "vpn_keys_protocol_check" CHECK ((protocol = ANY (ARRAY['shadowsocks'::text, 'vless'::text, 'hysteria2'::text])));
alter table public."vpn_keys" add constraint "vpn_keys_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'deleted'::text, 'pending'::text]))) NOT VALID;
alter table public."vpn_keys" add constraint "vpn_keys_tenant_required" CHECK (((reseller_id IS NOT NULL) AND (customer_id IS NOT NULL) AND (order_id IS NOT NULL))) NOT VALID;
alter table public."vpn_keys" add constraint "vpn_keys_usage_nonnegative" CHECK (((used_bytes >= 0) AND ((data_limit_bytes IS NULL) OR (data_limit_bytes >= 0)))) NOT VALID;
alter table public."vpn_orders" add constraint "vpn_orders_money_nonnegative" CHECK (((price_mmk >= 0) AND (total_paid_mmk >= 0) AND (commission_amount_mmk >= 0) AND (commission_percent >= (0)::numeric) AND (commission_percent <= (100)::numeric))) NOT VALID;
alter table public."vpn_orders" add constraint "vpn_orders_pkey" PRIMARY KEY (id);
alter table public."vpn_orders" add constraint "vpn_orders_quota_limit_nonnegative" CHECK (((quota_limit_bytes IS NULL) OR (quota_limit_bytes >= 0))) NOT VALID;
alter table public."vpn_orders" add constraint "vpn_orders_reseller_required" CHECK ((reseller_id IS NOT NULL)) NOT VALID;
alter table public."vpn_orders" add constraint "vpn_orders_review_status_check" CHECK (((review_status IS NOT NULL) AND (review_status = ANY (ARRAY['pending_review'::text, 'confirmed'::text, 'rejected'::text])))) NOT VALID;
alter table public."vpn_orders" add constraint "vpn_orders_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'expired'::text, 'stopped'::text, 'scheduled'::text]))) NOT VALID;
alter table public."vpn_orders" add constraint "vpn_orders_type_check" CHECK (((order_type IS NOT NULL) AND (order_type = ANY (ARRAY['trial'::text, 'purchase'::text])))) NOT VALID;
alter table public."vpn_orders" add constraint "vpn_orders_usage_baseline_nonnegative" CHECK ((usage_baseline_bytes >= 0)) NOT VALID;
alter table public."vpn_plans" add constraint "vpn_plans_pkey" PRIMARY KEY (id);
alter table public."vpn_servers" add constraint "vpn_servers_panel_type_check" CHECK ((panel_type = ANY (ARRAY['outline'::text, 'marzneshin'::text])));
alter table public."vpn_servers" add constraint "vpn_servers_pkey" PRIMARY KEY (id);
alter table public."vpn_servers" add constraint "vpn_servers_server_tier_check" CHECK ((server_tier = ANY (ARRAY['trial'::text, 'premium'::text])));
CREATE INDEX idx_app_events_created_at ON public.app_events USING btree (created_at DESC);
CREATE INDEX idx_app_events_customer_created ON public.app_events USING btree (customer_id, created_at DESC);
CREATE INDEX idx_app_events_failed_recent ON public.app_events USING btree (created_at DESC) WHERE (status = 'failed'::text);
CREATE INDEX idx_app_events_name_created ON public.app_events USING btree (event_name, created_at DESC);
CREATE INDEX idx_app_events_reseller_created ON public.app_events USING btree (reseller_id, created_at DESC);
CREATE INDEX idx_app_events_server_created ON public.app_events USING btree (server_id, created_at DESC) WHERE (server_id IS NOT NULL);
CREATE INDEX idx_app_events_session_created ON public.app_events USING btree (session_id, created_at DESC) WHERE (session_id IS NOT NULL);
CREATE INDEX idx_app_events_status_created ON public.app_events USING btree (status, created_at DESC);
CREATE INDEX idx_app_events_telegram_created ON public.app_events USING btree (telegram_user_id, created_at DESC) WHERE (telegram_user_id IS NOT NULL);
CREATE UNIQUE INDEX dashboard_one_running_customer ON public.dashboard_purchase_operations USING btree (reseller_id, customer_id) WHERE (state = 'running'::text);
CREATE INDEX idx_monthly_settlements_month ON public.monthly_settlements USING btree (settlement_month DESC);
CREATE INDEX idx_monthly_settlements_reseller_month ON public.monthly_settlements USING btree (reseller_id, settlement_month DESC);
CREATE INDEX idx_monthly_settlements_status ON public.monthly_settlements USING btree (status);
CREATE INDEX idx_notifications_sent_customer_sent ON public.notifications_sent USING btree (customer_id, sent_at DESC);
CREATE INDEX idx_notifications_sent_event_sent ON public.notifications_sent USING btree (event_type, sent_at DESC);
CREATE INDEX idx_order_payments_customer ON public.order_payments USING btree (customer_id);
CREATE INDEX idx_order_payments_order ON public.order_payments USING btree (order_id);
CREATE INDEX idx_order_payments_plan ON public.order_payments USING btree (plan_id);
CREATE INDEX idx_order_payments_reseller_created ON public.order_payments USING btree (reseller_id, created_at DESC);
CREATE UNIQUE INDEX idx_order_payments_reseller_idempotency ON public.order_payments USING btree (reseller_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX idx_order_payments_review_status ON public.order_payments USING btree (review_status);
CREATE INDEX idx_order_payments_type_status ON public.order_payments USING btree (payment_type, review_status, apply_status);
CREATE INDEX idx_reseller_notification_templates_reseller ON public.reseller_notification_templates USING btree (reseller_id);
CREATE INDEX idx_server_health_status_status ON public.server_health_status USING btree (outline_api_status, updated_at DESC);
CREATE INDEX idx_server_health_status_usage_sync ON public.server_health_status USING btree (last_usage_sync_at DESC);
CREATE INDEX idx_system_job_runs_status ON public.system_job_runs USING btree (status, updated_at DESC);
CREATE UNIQUE INDEX idx_vpn_customers_id_reseller ON public.vpn_customers USING btree (id, reseller_id);
CREATE UNIQUE INDEX idx_vpn_keys_one_active_order_server ON public.vpn_keys USING btree (order_id, server_id) WHERE ((status = 'active'::text) AND (deleted_at IS NULL) AND (server_id IS NOT NULL));
CREATE UNIQUE INDEX idx_vpn_orders_id_reseller ON public.vpn_orders USING btree (id, reseller_id);
CREATE UNIQUE INDEX idx_vpn_orders_one_active_purchase ON public.vpn_orders USING btree (reseller_id, customer_id) WHERE ((status = 'active'::text) AND (order_type = 'purchase'::text));
CREATE UNIQUE INDEX idx_vpn_orders_one_scheduled_purchase ON public.vpn_orders USING btree (reseller_id, customer_id) WHERE ((status = 'scheduled'::text) AND (order_type = 'purchase'::text));
CREATE INDEX idx_vpn_orders_scheduled_queue ON public.vpn_orders USING btree (customer_id, created_at) WHERE (status = 'scheduled'::text);
CREATE INDEX idx_vpn_servers_tier_status_region ON public.vpn_servers USING btree (server_tier, status, region);
alter table public."access_tokens" add constraint "access_tokens_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES vpn_customers(id);
alter table public."access_tokens" add constraint "access_tokens_order_id_fkey" FOREIGN KEY (order_id) REFERENCES vpn_orders(id);
alter table public."access_tokens" add constraint "access_tokens_reseller_id_fkey" FOREIGN KEY (reseller_id) REFERENCES resellers(id);
alter table public."admins" add constraint "admins_supabase_user_id_fkey" FOREIGN KEY (supabase_user_id) REFERENCES auth.users(id);
alter table public."app_events" add constraint "app_events_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL;
alter table public."app_events" add constraint "app_events_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES vpn_customers(id) ON DELETE SET NULL;
alter table public."app_events" add constraint "app_events_order_id_fkey" FOREIGN KEY (order_id) REFERENCES vpn_orders(id) ON DELETE SET NULL;
alter table public."app_events" add constraint "app_events_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES order_payments(id) ON DELETE SET NULL;
alter table public."app_events" add constraint "app_events_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES vpn_plans(id) ON DELETE SET NULL;
alter table public."app_events" add constraint "app_events_reseller_id_fkey" FOREIGN KEY (reseller_id) REFERENCES resellers(id) ON DELETE SET NULL;
alter table public."app_events" add constraint "app_events_server_id_fkey" FOREIGN KEY (server_id) REFERENCES vpn_servers(id) ON DELETE SET NULL;
alter table public."commission_ledger" add constraint "commission_ledger_order_id_fkey" FOREIGN KEY (order_id) REFERENCES vpn_orders(id);
alter table public."commission_ledger" add constraint "commission_ledger_reseller_id_fkey" FOREIGN KEY (reseller_id) REFERENCES resellers(id);
alter table public."dashboard_purchase_operations" add constraint "dashboard_purchase_operations_customer_id_reseller_id_fkey" FOREIGN KEY (customer_id, reseller_id) REFERENCES vpn_customers(id, reseller_id) ON DELETE CASCADE;
alter table public."dashboard_purchase_operations" add constraint "dashboard_purchase_operations_order_id_reseller_id_fkey" FOREIGN KEY (order_id, reseller_id) REFERENCES vpn_orders(id, reseller_id) ON DELETE CASCADE;
alter table public."dashboard_purchase_operations" add constraint "dashboard_purchase_operations_reseller_id_fkey" FOREIGN KEY (reseller_id) REFERENCES resellers(id);
alter table public."monthly_settlements" add constraint "monthly_settlements_confirmed_by_admin_id_fkey" FOREIGN KEY (confirmed_by_admin_id) REFERENCES admins(id);
alter table public."monthly_settlements" add constraint "monthly_settlements_reseller_id_fkey" FOREIGN KEY (reseller_id) REFERENCES resellers(id);
alter table public."notifications_sent" add constraint "notifications_sent_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES vpn_customers(id) ON DELETE CASCADE;
alter table public."notifications_sent" add constraint "notifications_sent_order_id_fkey" FOREIGN KEY (order_id) REFERENCES vpn_orders(id) ON DELETE SET NULL;
alter table public."order_payments" add constraint "order_payments_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES vpn_customers(id);
alter table public."order_payments" add constraint "order_payments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES vpn_orders(id);
alter table public."order_payments" add constraint "order_payments_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES vpn_plans(id);
alter table public."order_payments" add constraint "order_payments_reseller_id_fkey" FOREIGN KEY (reseller_id) REFERENCES resellers(id);
alter table public."order_payments" add constraint "order_payments_reviewed_by_admin_id_fkey" FOREIGN KEY (reviewed_by_admin_id) REFERENCES admins(id);
alter table public."order_payments" add constraint "order_payments_reviewed_by_reseller_id_fkey" FOREIGN KEY (reviewed_by_reseller_id) REFERENCES resellers(id);
alter table public."reseller_miniapps" add constraint "reseller_miniapps_reseller_id_fkey" FOREIGN KEY (reseller_id) REFERENCES resellers(id);
alter table public."reseller_notification_templates" add constraint "reseller_notification_templates_reseller_id_fkey" FOREIGN KEY (reseller_id) REFERENCES resellers(id) ON DELETE CASCADE;
alter table public."resellers" add constraint "resellers_supabase_user_id_fkey" FOREIGN KEY (supabase_user_id) REFERENCES auth.users(id);
alter table public."server_health_status" add constraint "server_health_status_server_id_fkey" FOREIGN KEY (server_id) REFERENCES vpn_servers(id) ON DELETE CASCADE;
alter table public."telegram_links" add constraint "telegram_links_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES vpn_customers(id);
alter table public."telegram_links" add constraint "telegram_links_reseller_id_fkey" FOREIGN KEY (reseller_id) REFERENCES resellers(id);
alter table public."telegram_links" add constraint "telegram_links_trial_order_id_fkey" FOREIGN KEY (trial_order_id) REFERENCES vpn_orders(id);
alter table public."token_server_assignments" add constraint "token_server_assignments_server_id_fkey" FOREIGN KEY (server_id) REFERENCES vpn_servers(id);
alter table public."token_server_assignments" add constraint "token_server_assignments_token_id_fkey" FOREIGN KEY (token_id) REFERENCES access_tokens(id);
alter table public."token_server_assignments" add constraint "token_server_assignments_vpn_key_id_fkey" FOREIGN KEY (vpn_key_id) REFERENCES vpn_keys(id);
alter table public."vpn_customers" add constraint "vpn_customers_reseller_id_fkey" FOREIGN KEY (reseller_id) REFERENCES resellers(id);
alter table public."vpn_keys" add constraint "vpn_keys_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES vpn_customers(id);
alter table public."vpn_keys" add constraint "vpn_keys_customer_tenant_fk" FOREIGN KEY (customer_id, reseller_id) REFERENCES vpn_customers(id, reseller_id) NOT VALID;
alter table public."vpn_keys" add constraint "vpn_keys_order_id_fkey" FOREIGN KEY (order_id) REFERENCES vpn_orders(id);
alter table public."vpn_keys" add constraint "vpn_keys_order_tenant_fk" FOREIGN KEY (order_id, reseller_id) REFERENCES vpn_orders(id, reseller_id) NOT VALID;
alter table public."vpn_keys" add constraint "vpn_keys_reseller_id_fkey" FOREIGN KEY (reseller_id) REFERENCES resellers(id);
alter table public."vpn_keys" add constraint "vpn_keys_server_id_fkey" FOREIGN KEY (server_id) REFERENCES vpn_servers(id);
alter table public."vpn_orders" add constraint "vpn_orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES vpn_customers(id);
alter table public."vpn_orders" add constraint "vpn_orders_customer_tenant_fk" FOREIGN KEY (customer_id, reseller_id) REFERENCES vpn_customers(id, reseller_id) NOT VALID;
alter table public."vpn_orders" add constraint "vpn_orders_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES vpn_plans(id);
alter table public."vpn_orders" add constraint "vpn_orders_reseller_id_fkey" FOREIGN KEY (reseller_id) REFERENCES resellers(id);
CREATE OR REPLACE FUNCTION public.activate_vpn_key(p_key_id uuid, p_reseller_id uuid, p_outline_key_id text, p_access_url text, p_key_credentials jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
begin
  select status into v_status
    from vpn_keys
   where id = p_key_id and reseller_id = p_reseller_id
   for update;

  if v_status is null then
    raise exception 'key % not found for reseller %', p_key_id, p_reseller_id
      using errcode = 'no_data_found';
  end if;
  if v_status = 'deleted' then
    raise exception 'key % is already deleted', p_key_id
      using errcode = 'check_violation';
  end if;

  update vpn_keys
     set status          = 'active',
         outline_key_id  = p_outline_key_id,
         access_url      = p_access_url,
         key_credentials = p_key_credentials,
         is_used         = true,
         used_at         = now(),
         deleted_at      = null,
         updated_at      = now()
   where id = p_key_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.admin_monitoring_daily(p_start timestamp with time zone, p_end timestamp with time zone, p_reseller_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(date text, total bigint, raw_events bigint, miniapp_config_loads bigint, unique_miniapp_opens bigint, packages_viewed bigint, order_submitted bigint, server_selected bigint, failures bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with days as (
    select generate_series(
      date_trunc('day', p_start),
      date_trunc('day', p_end),
      interval '1 day'
    ) as day_start
  ),
  scoped as (
    select *
    from app_events
    where created_at >= p_start
      and created_at <= p_end
      and (p_reseller_id is null or reseller_id = p_reseller_id)
  )
  select
    days.day_start::date::text as date,
    count(scoped.id) as total,
    count(scoped.id) as raw_events,
    count(scoped.id) filter (where scoped.event_name = 'miniapp_config_loaded') as miniapp_config_loads,
    count(distinct coalesce(
      scoped.customer_id::text,
      scoped.telegram_user_id::text,
      scoped.session_id,
      scoped.ip_hash,
      scoped.id::text
    )) filter (where scoped.event_name = 'miniapp_authenticated') as unique_miniapp_opens,
    count(scoped.id) filter (where scoped.event_name = 'packages_viewed') as packages_viewed,
    count(scoped.id) filter (where scoped.event_name = 'order_submitted') as order_submitted,
    count(scoped.id) filter (where scoped.event_name = 'server_selected') as server_selected,
    count(scoped.id) filter (where scoped.status = 'failed') as failures
  from days
  left join scoped
    on scoped.created_at >= days.day_start
   and scoped.created_at < days.day_start + interval '1 day'
  group by days.day_start
  order by days.day_start;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_monitoring_funnel(p_start timestamp with time zone, p_end timestamp with time zone, p_reseller_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(event_name text, count bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with event_names(event_name) as (
    values
      ('miniapp_authenticated'),
      ('packages_viewed'),
      ('order_submitted'),
      ('payment_screenshot_uploaded'),
      ('server_page_viewed'),
      ('server_selected'),
      ('server_select_blocked'),
      ('trial_created'),
      ('key_provisioned')
  )
  select event_names.event_name, count(app_events.id) as count
  from event_names
  left join app_events
    on app_events.event_name = event_names.event_name
   and app_events.created_at >= p_start
   and app_events.created_at <= p_end
   and (p_reseller_id is null or app_events.reseller_id = p_reseller_id)
  group by event_names.event_name
  order by array_position(array[
    'miniapp_authenticated',
    'packages_viewed',
    'order_submitted',
    'payment_screenshot_uploaded',
    'server_page_viewed',
    'server_selected',
    'server_select_blocked',
    'trial_created',
    'key_provisioned'
  ], event_names.event_name);
$function$
;
CREATE OR REPLACE FUNCTION public.admin_monitoring_server_events(p_start timestamp with time zone, p_end timestamp with time zone, p_reseller_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(server_id uuid, server_name text, region text, server_tier text, selected bigint, key_provisioned bigint, blocked bigint, failed bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select
    app_events.server_id,
    coalesce(vpn_servers.name, 'Unknown server') as server_name,
    vpn_servers.region,
    vpn_servers.server_tier,
    count(app_events.id) filter (where app_events.event_name = 'server_selected') as selected,
    count(app_events.id) filter (where app_events.event_name = 'key_provisioned') as key_provisioned,
    count(app_events.id) filter (where app_events.status = 'blocked') as blocked,
    count(app_events.id) filter (where app_events.status = 'failed') as failed
  from app_events
  left join vpn_servers on vpn_servers.id = app_events.server_id
  where app_events.created_at >= p_start
    and app_events.created_at <= p_end
    and app_events.server_id is not null
    and (p_reseller_id is null or app_events.reseller_id = p_reseller_id)
  group by app_events.server_id, vpn_servers.name, vpn_servers.region, vpn_servers.server_tier
  order by
    count(app_events.id) filter (where app_events.event_name = 'server_selected') +
    count(app_events.id) filter (where app_events.event_name = 'key_provisioned') +
    count(app_events.id) filter (where app_events.status = 'blocked') +
    count(app_events.id) filter (where app_events.status = 'failed') desc;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_monitoring_summary(p_start timestamp with time zone, p_end timestamp with time zone, p_reseller_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(raw_events bigint, total_events bigint, unique_customers bigint, unique_telegram_users bigint, unique_miniapp_opens bigint, miniapp_opens bigint, miniapp_config_loads bigint, packages_viewed bigint, server_page_views bigint, server_selected bigint, server_blocked bigint, order_submitted bigint, screenshots_uploaded bigint, trials_created bigint, keys_provisioned bigint, failures bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with scoped as (
    select *
    from app_events
    where created_at >= p_start
      and created_at <= p_end
      and (p_reseller_id is null or reseller_id = p_reseller_id)
  ),
  open_events as (
    select distinct coalesce(
      customer_id::text,
      telegram_user_id::text,
      session_id,
      ip_hash,
      id::text
    ) as actor_key
    from scoped
    where event_name = 'miniapp_authenticated'
  )
  select
    count(*) as raw_events,
    count(*) as total_events,
    count(distinct customer_id) filter (where customer_id is not null) as unique_customers,
    count(distinct telegram_user_id) filter (where telegram_user_id is not null) as unique_telegram_users,
    (select count(*) from open_events) as unique_miniapp_opens,
    (select count(*) from open_events) as miniapp_opens,
    count(*) filter (where event_name = 'miniapp_config_loaded') as miniapp_config_loads,
    count(*) filter (where event_name = 'packages_viewed') as packages_viewed,
    count(*) filter (where event_name = 'server_page_viewed') as server_page_views,
    count(*) filter (where event_name = 'server_selected') as server_selected,
    count(*) filter (where event_name = 'server_select_blocked') as server_blocked,
    count(*) filter (where event_name = 'order_submitted') as order_submitted,
    count(*) filter (where event_name = 'payment_screenshot_uploaded') as screenshots_uploaded,
    count(*) filter (where event_name = 'trial_created') as trials_created,
    count(*) filter (where event_name = 'key_provisioned') as keys_provisioned,
    count(*) filter (where status = 'failed') as failures
  from scoped;
$function$
;
CREATE OR REPLACE FUNCTION public.apply_confirmed_payment(p_order_id uuid, p_reseller_id uuid, p_reviewer_reseller_id uuid, p_reviewer_admin_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner     uuid;
  v_total     int;
  v_comm      int;
  v_pending   int;
  v_confirmed int;
  v_rejected  int;
  v_review    text;
begin
  -- Tenant guard (P2/P5): lock the order and confirm ownership.
  select reseller_id into v_owner from vpn_orders where id = p_order_id for update;
  if v_owner is null then
    raise exception 'order % not found', p_order_id using errcode = 'no_data_found';
  end if;
  if v_owner is distinct from p_reseller_id then
    raise exception 'order % does not belong to reseller %', p_order_id, p_reseller_id
      using errcode = 'check_violation';
  end if;

  -- 1. Confirm + apply all pending payments. Recompute snapshot amounts from the
  --    payment's own commission_percent (clamped 0..100), matching
  --    calculatePaymentAmounts().
  update order_payments
     set commission_amount_mmk = floor(amount_mmk * least(100, greatest(0, commission_percent)) / 100.0),
         platform_due_mmk      = greatest(0, amount_mmk - floor(amount_mmk * least(100, greatest(0, commission_percent)) / 100.0)),
         review_status = 'confirmed',
         apply_status  = 'applied',
         applied_at    = now(),
         apply_error   = null,
         reviewed_at   = now(),
         reviewed_by_reseller_id = p_reviewer_reseller_id,
         reviewed_by_admin_id    = p_reviewer_admin_id,
         updated_at    = now()
   where order_id = p_order_id
     and review_status = 'pending_review';

  -- 2. Recompute the order's cached summary (same filter as summarizePayments()).
  select
    coalesce(sum(amount_mmk)            filter (where review_status='confirmed' and (apply_status is null or apply_status='applied')), 0),
    coalesce(sum(commission_amount_mmk) filter (where review_status='confirmed' and (apply_status is null or apply_status='applied')), 0),
    count(*) filter (where review_status='pending_review'),
    count(*) filter (where review_status='confirmed' and (apply_status is null or apply_status='applied')),
    count(*) filter (where review_status='rejected')
  into v_total, v_comm, v_pending, v_confirmed, v_rejected
  from order_payments
  where order_id = p_order_id;

  if    v_pending   > 0 then v_review := 'pending_review';
  elsif v_confirmed > 0 then v_review := 'confirmed';
  elsif v_rejected  > 0 then v_review := 'rejected';
  else  v_review := null;
  end if;

  update vpn_orders
     set total_paid_mmk        = v_total,
         commission_amount_mmk = v_comm,
         payment_status        = case when v_total > 0 then 'paid' else 'unpaid' end,
         review_status         = coalesce(v_review, review_status),
         updated_at            = now()
   where id = p_order_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.claim_dashboard_purchase_setup(p_reseller_id uuid, p_order_id uuid, p_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare op dashboard_purchase_operations%rowtype; ord vpn_orders%rowtype; active_order vpn_orders%rowtype;
begin
  if p_owner is null then raise exception 'OWNER_REQUIRED'; end if;
  select * into ord from vpn_orders where id=p_order_id and reseller_id=p_reseller_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  perform 1 from vpn_customers where id=ord.customer_id and reseller_id=p_reseller_id for update;
  select * into op from dashboard_purchase_operations where order_id=p_order_id and reseller_id=p_reseller_id for update;
  if not found then raise exception 'SETUP_NOT_FOUND'; end if;
  -- Re-read after the ownership locks: another attempt may have completed since
  -- the initial customer lookup. Never reset an already active order to pending.
  select * into ord from vpn_orders where id=p_order_id and reseller_id=p_reseller_id for update;
  if ord.source not in ('dashboard','admin') or ord.order_type<>'purchase' then raise exception 'INVALID_SOURCE'; end if;
  if ord.status='active' then return jsonb_build_object('claimed',false,'state','ready'); end if;
  if ord.status not in ('pending','scheduled') or ord.review_status='rejected' then raise exception 'INVALID_STATUS'; end if;
  if ord.payment_status<>'paid' or ord.review_status<>'confirmed' then return jsonb_build_object('claimed',false,'state','awaiting_payment'); end if;
  select * into active_order from vpn_orders where reseller_id=p_reseller_id and customer_id=ord.customer_id and order_type='purchase' and id<>ord.id
    and (status='active' or (status='pending' and source in ('dashboard','admin') and payment_status='paid' and review_status='confirmed'
      and (ord.status='scheduled' or (created_at,id)<(ord.created_at,ord.id))))
    order by created_at,id limit 1;
  if found then
    if active_order.review_status is distinct from 'confirmed' then raise exception 'PURCHASE_UNDER_REVIEW'; end if;
    if exists(select 1 from vpn_orders where reseller_id=p_reseller_id and customer_id=ord.customer_id and status='scheduled' and order_type='purchase' and id<>ord.id) then raise exception 'QUEUED_PACKAGE_EXISTS'; end if;
    update vpn_orders set status='scheduled',start_date=null,expiry_date=null where id=ord.id and reseller_id=p_reseller_id;
    update dashboard_purchase_operations set state='queued',last_error_code=null,updated_at=now() where id=op.id;
    return jsonb_build_object('claimed',false,'state','queued');
  end if;
  if exists(select 1 from dashboard_purchase_operations where reseller_id=p_reseller_id and customer_id=ord.customer_id and state='running') then
    return jsonb_build_object('claimed',false,'state','running');
  end if;
  -- Reuse the guarded initial activation path; dates start only after successful setup.
  update vpn_orders set status='pending' where id=ord.id and reseller_id=p_reseller_id;
  update dashboard_purchase_operations set state='running',setup_owner=p_owner,claimed_at=now(),last_error_code=null,updated_at=now() where id=op.id;
  return jsonb_build_object('claimed',true,'state','running','plan_snapshot',op.plan_snapshot);
end $function$
;
CREATE OR REPLACE FUNCTION public.cleanup_old_app_events(p_days integer DEFAULT 90)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(p_days, 7));
  deleted_count integer;
begin
  delete from app_events
    where created_at < cutoff;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.ensure_dashboard_purchase_operation(p_reseller_id uuid, p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ord vpn_orders%rowtype; op dashboard_purchase_operations%rowtype; snapshot jsonb;
begin
 select * into ord from vpn_orders where id=p_order_id and reseller_id=p_reseller_id;
 if not found or ord.source not in ('dashboard','admin') or ord.order_type<>'purchase' then raise exception 'ORDER_NOT_FOUND'; end if;
 perform 1 from vpn_customers where id=ord.customer_id and reseller_id=p_reseller_id for update;
 select * into op from dashboard_purchase_operations where order_id=p_order_id and reseller_id=p_reseller_id;
 if found then return to_jsonb(op); end if;
 select to_jsonb(p) into snapshot from vpn_plans p where id=ord.plan_id;
 select snapshot || jsonb_build_object('price_mmk',ord.price_mmk,
   'duration_days',coalesce(p.package_duration_days,(snapshot->>'duration_days')::int),
   'data_limit_gb',p.package_data_limit_gb)
 into snapshot from order_payments p where p.order_id=ord.id and p.reseller_id=p_reseller_id and p.plan_id=ord.plan_id and p.package_duration_days is not null order by p.created_at desc limit 1;
 if snapshot is null then select to_jsonb(p) into snapshot from vpn_plans p where id=ord.plan_id; end if;
 insert into dashboard_purchase_operations(reseller_id,request_key,request_hash,customer_id,order_id,plan_snapshot,state)
 values(p_reseller_id,p_order_id,'legacy:'||p_order_id::text,ord.customer_id,ord.id,snapshot,'not_started') returning * into op;
 return to_jsonb(op);
end $function$
;
CREATE OR REPLACE FUNCTION public.fail_pending_key(p_key_id uuid, p_reseller_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
begin
  select status into v_status
    from vpn_keys
   where id = p_key_id and reseller_id = p_reseller_id
   for update;

  if v_status is null or v_status = 'deleted' then
    return; -- idempotent
  end if;

  -- Soft-delete; the trigger recomputes the counter (releases the reservation).
  update vpn_keys
     set status     = 'deleted',
         deleted_at = now(),
         updated_at = now()
   where id = p_key_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.finish_dashboard_purchase_setup(p_reseller_id uuid, p_order_id uuid, p_owner uuid, p_state text, p_error_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_state not in ('ready','failed') then raise exception 'INVALID_SETUP_STATE'; end if;
  update dashboard_purchase_operations set state=p_state,setup_owner=null,last_error_code=left(p_error_code,80),updated_at=now()
  where reseller_id=p_reseller_id and order_id=p_order_id and setup_owner=p_owner and state='running';
  if not found then raise exception 'SETUP_OWNER_NOT_FOUND'; end if;
end $function$
;
CREATE OR REPLACE FUNCTION public.prepare_dashboard_purchase(p_reseller_id uuid, p_request_key uuid, p_request_hash text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  op dashboard_purchase_operations%rowtype;
  c vpn_customers%rowtype;
  pl vpn_plans%rowtype;
  active_order vpn_orders%rowtype;
  ord vpn_orders%rowtype;
  rate numeric;
  payment_commission integer;
  paid boolean := p_payload->>'payment_status'='paid';
  sale_source text := coalesce(p_payload->>'source','dashboard');
  sale_type text := p_payload->>'payment_type';
begin
  if p_request_key is null or coalesce(p_request_hash,'')='' then raise exception 'REQUEST_KEY_REQUIRED'; end if;
  if sale_source not in ('dashboard','admin') then raise exception 'INVALID_SOURCE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_reseller_id::text||p_request_key::text,0));
  select * into op from dashboard_purchase_operations where reseller_id=p_reseller_id and request_key=p_request_key;
  if found then
    if op.request_hash<>p_request_hash then raise exception 'REQUEST_CONFLICT'; end if;
    return to_jsonb(op);
  end if;
  if coalesce(trim(p_payload->>'full_name'),'')='' then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  select least(100,greatest(0,commission_percent)) into rate from resellers where id=p_reseller_id;
  if not found then raise exception 'RESELLER_NOT_FOUND'; end if;
  select * into pl from vpn_plans where id=(p_payload->>'plan_id')::uuid and is_active=true;
  if not found or pl.is_trial then raise exception 'PAID_PLAN_REQUIRED'; end if;
  if pl.price_mmk<=0 then raise exception 'PAID_PLAN_REQUIRED'; end if;
  payment_commission := floor(pl.price_mmk::numeric * coalesce(rate,0) / 100.0)::integer;
  if nullif(p_payload->>'customer_id','') is not null then
    select * into c from vpn_customers where id=(p_payload->>'customer_id')::uuid and reseller_id=p_reseller_id for update;
    if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  else
    -- Serialize contact lookup/creation as well as exact request replay.
    perform pg_advisory_xact_lock(hashtextextended(p_reseller_id::text||coalesce(nullif(p_payload->>'phone',''),nullif(p_payload->>'telegram_username',''),p_request_key::text),1));
    select * into c from vpn_customers where reseller_id=p_reseller_id and
      ((nullif(p_payload->>'phone','') is not null and phone=p_payload->>'phone') or
       (nullif(p_payload->>'telegram_username','') is not null and telegram_username=p_payload->>'telegram_username'))
      order by id limit 1 for update;
    if not found then
      insert into vpn_customers(reseller_id,full_name,phone,telegram_username,notes,status,customer_type,protocol_preference)
      values(p_reseller_id,trim(p_payload->>'full_name'),nullif(p_payload->>'phone',''),nullif(p_payload->>'telegram_username',''),nullif(p_payload->>'notes',''),'active','normal',
        case when p_payload->>'protocol_preference' in ('shadowsocks','vless','hysteria2') then p_payload->>'protocol_preference' else 'shadowsocks' end) returning * into c;
    end if;
  end if;
  -- Admin's existing follow-up actions may serve Telegram customers. Require a
  -- real, same-tenant/same-customer origin; reseller manual creation stays gated.
  if nullif(p_payload->>'origin_order_id','') is not null then
    perform 1 from vpn_orders where id=(p_payload->>'origin_order_id')::uuid and reseller_id=p_reseller_id and customer_id=c.id;
    if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  end if;
  if (c.customer_type is distinct from 'normal' or exists(select 1 from telegram_links where customer_id=c.id and reseller_id=p_reseller_id))
    and not (sale_source='admin' and nullif(p_payload->>'origin_order_id','') is not null) then raise exception 'TELEGRAM_CUSTOMER_ACTION'; end if;
  update vpn_customers set
    full_name=trim(p_payload->>'full_name'),
    phone=coalesce(nullif(p_payload->>'phone',''),phone),
    telegram_username=coalesce(nullif(p_payload->>'telegram_username',''),telegram_username),
    notes=coalesce(nullif(p_payload->>'notes',''),notes),
    protocol_preference=case when p_payload->>'protocol_preference' in ('shadowsocks','vless','hysteria2') then p_payload->>'protocol_preference' else protocol_preference end
  where id=c.id and reseller_id=p_reseller_id;
  select * into active_order from vpn_orders where reseller_id=p_reseller_id and customer_id=c.id and order_type='purchase'
    and (status='active' or (status='pending' and source in ('dashboard','admin') and payment_status='paid' and review_status='confirmed'))
    order by created_at,id limit 1;
  if found and active_order.review_status is distinct from 'confirmed' then raise exception 'PURCHASE_UNDER_REVIEW'; end if;
  if exists(select 1 from vpn_orders where reseller_id=p_reseller_id and customer_id=c.id and status='scheduled' and order_type='purchase') then raise exception 'QUEUED_PACKAGE_EXISTS'; end if;
  insert into vpn_orders(reseller_id,customer_id,plan_id,status,payment_status,review_status,order_type,source,price_mmk,total_paid_mmk,commission_percent,commission_amount_mmk,payment_note,payment_screenshot_url,quota_limit_bytes,usage_baseline_bytes)
  values(p_reseller_id,c.id,pl.id,case when active_order.id is not null then 'scheduled' else 'pending' end,'unpaid','pending_review','purchase',sale_source,pl.price_mmk,0,coalesce(rate,0),0,p_payload->>'payment_note',p_payload->>'payment_screenshot_url',case when pl.data_limit_gb is null then null else floor(pl.data_limit_gb::numeric * 1073741824::numeric)::bigint end,0) returning * into ord;
  if paid then
    insert into order_payments(order_id,customer_id,reseller_id,plan_id,amount_mmk,commission_percent,commission_amount_mmk,platform_due_mmk,review_status,apply_status,payment_type,source,package_duration_days,package_data_limit_gb,payment_note,payment_screenshot_url,idempotency_key)
    values(ord.id,c.id,p_reseller_id,pl.id,pl.price_mmk,coalesce(rate,0),payment_commission,pl.price_mmk-payment_commission,'pending_review','pending',case when sale_type in ('renew','extend') then sale_type when ord.status='scheduled' then 'extend' else 'initial' end,sale_source,pl.duration_days,pl.data_limit_gb,p_payload->>'payment_note',p_payload->>'payment_screenshot_url','dashboard:'||p_request_key::text);
    perform apply_confirmed_payment(ord.id,p_reseller_id,p_reseller_id,null);
  end if;
  insert into dashboard_purchase_operations(reseller_id,request_key,request_hash,customer_id,order_id,plan_snapshot,state)
  values(p_reseller_id,p_request_key,p_request_hash,c.id,ord.id,to_jsonb(pl),case when not paid then 'awaiting_payment' when ord.status='scheduled' then 'queued' else 'not_started' end) returning * into op;
  return to_jsonb(op);
end $function$
;
CREATE OR REPLACE FUNCTION public.reserve_pending_key(p_order_id uuid, p_customer_id uuid, p_reseller_id uuid, p_server_id uuid, p_key_name text, p_data_limit_bytes bigint, p_protocol text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key_id uuid;
begin
  -- Tenant guard (P2/P5): the order must belong to this reseller.
  if not exists (
    select 1 from vpn_orders
    where id = p_order_id and reseller_id = p_reseller_id
  ) then
    raise exception 'order % does not belong to reseller %', p_order_id, p_reseller_id
      using errcode = 'check_violation';
  end if;

  -- Capacity is enforced by trg_sync_server_active_keys on this insert; if the
  -- server is full it raises 'capacity exceeded' and the insert rolls back.
  insert into vpn_keys (
    order_id, customer_id, reseller_id, server_id,
    key_name, data_limit_bytes, used_bytes, status, protocol
  ) values (
    p_order_id, p_customer_id, p_reseller_id, p_server_id,
    p_key_name, p_data_limit_bytes, 0, 'pending', p_protocol
  )
  returning id into v_key_id;

  return v_key_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_order_quota_limit_from_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  plan_limit_gb numeric;
begin
  if new.quota_limit_bytes is not null then
    return new;
  end if;

  select data_limit_gb
    into plan_limit_gb
  from public.vpn_plans
  where id = new.plan_id;

  if plan_limit_gb > 0 then
    new.quota_limit_bytes := floor(plan_limit_gb * 1073741824)::bigint;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_server_active_keys()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_servers uuid[];
  s uuid;
  v_count int;
  v_max int;
begin
  -- Every server touched by this row change (covers server moves on UPDATE).
  v_servers := array_remove(array[
    case when tg_op in ('UPDATE','DELETE') then old.server_id end,
    case when tg_op in ('INSERT','UPDATE') then new.server_id end
  ], null);

  foreach s in array v_servers loop
    -- Serialize concurrent key writes for this server so the capacity check
    -- below is race-free.
    perform 1 from vpn_servers where id = s for update;

    select count(*) into v_count
      from vpn_keys
     where server_id = s and status in ('active', 'pending');

    select max_active_keys into v_max from vpn_servers where id = s;

    if v_max is not null and v_max > 0 and v_count > v_max then
      raise exception 'server % capacity exceeded (% > %)', s, v_count, v_max
        using errcode = 'check_violation';
    end if;

    update vpn_servers
       set current_active_keys = v_count,
           updated_at = now()
     where id = s;
  end loop;

  return null;
end $function$
;
CREATE TRIGGER trg_sync_server_active_keys AFTER INSERT OR DELETE OR UPDATE ON public.vpn_keys FOR EACH ROW EXECUTE FUNCTION sync_server_active_keys();
CREATE TRIGGER trg_set_order_quota_limit BEFORE INSERT ON public.vpn_orders FOR EACH ROW EXECUTE FUNCTION set_order_quota_limit_from_plan();
create view public."customer_view" as  SELECT c.id,
    c.reseller_id,
    c.full_name AS display_name,
    c.telegram_username,
    c.phone,
    c.notes,
    c.status,
    c.customer_type,
    c.protocol_preference,
    c.ssconf_token,
    c.created_at,
    c.updated_at,
    r.name AS reseller_display_name,
    ( SELECT o.id
           FROM vpn_orders o
          WHERE o.customer_id = c.id AND o.status = 'active'::text
          ORDER BY o.created_at DESC
         LIMIT 1) AS active_order_id
   FROM vpn_customers c
     LEFT JOIN resellers r ON r.id = c.reseller_id;
create view public."order_view" as  SELECT o.id,
    o.customer_id,
    o.reseller_id,
    o.plan_id,
    o.status,
    o.price_mmk,
    o.commission_percent,
    o.start_date,
    o.expiry_date,
    o.payment_note,
    o.payment_status,
    o.activated_at,
    o.stopped_at,
    o.order_type,
    o.review_status,
    o.payment_screenshot_url,
    o.source,
    o.created_at,
    o.updated_at,
    money.total_paid_mmk,
    money.commission_amount_mmk,
    money.platform_due_mmk,
    COALESCE(ak.protocol, c.protocol_preference, 'shadowsocks'::text) AS protocol,
    ak.id AS active_key_id,
    ak.access_url AS active_key_access_url,
    ak.protocol AS active_key_protocol,
    ak.server_id AS active_key_server_id,
    c.full_name AS customer_display_name,
    c.ssconf_token AS customer_ssconf_token,
    c.protocol_preference AS customer_protocol_preference,
    r.name AS reseller_display_name,
    p.name AS plan_name
   FROM vpn_orders o
     LEFT JOIN vpn_customers c ON c.id = o.customer_id
     LEFT JOIN resellers r ON r.id = o.reseller_id
     LEFT JOIN vpn_plans p ON p.id = o.plan_id
     LEFT JOIN LATERAL ( SELECT k.id,
            k.access_url,
            k.protocol,
            k.server_id
           FROM vpn_keys k
          WHERE k.order_id = o.id AND k.status = 'active'::text AND k.deleted_at IS NULL
          ORDER BY k.created_at DESC
         LIMIT 1) ak ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(op.amount_mmk) FILTER (WHERE op.review_status = 'confirmed'::text AND (op.apply_status IS NULL OR op.apply_status = 'applied'::text)), 0::bigint) AS total_paid_mmk,
            COALESCE(sum(op.commission_amount_mmk) FILTER (WHERE op.review_status = 'confirmed'::text AND (op.apply_status IS NULL OR op.apply_status = 'applied'::text)), 0::bigint) AS commission_amount_mmk,
            COALESCE(sum(op.platform_due_mmk) FILTER (WHERE op.review_status = 'confirmed'::text AND (op.apply_status IS NULL OR op.apply_status = 'applied'::text)), 0::bigint) AS platform_due_mmk
           FROM order_payments op
          WHERE op.order_id = o.id) money ON true;
create view public."server_view" as  SELECT s.id,
    s.name,
    s.provider,
    s.region,
    s.region_code,
    s.droplet_id,
    s.host_ip,
    s.outline_api_url,
    s.outline_cert_sha256,
    s.status,
    s.is_active,
    s.is_default,
    s.max_active_keys,
    s.current_active_keys,
    s.last_error,
    s.display_country,
    s.display_city,
    s.flag_emoji,
    s.server_number,
    s.sort_order,
    s.created_at,
    s.updated_at,
    s.server_tier,
    s.panel_type,
    s.panel_url,
    s.panel_public_url,
    s.panel_username,
    s.panel_password_encrypted,
    s.marzneshin_service_ids,
    s.marzneshin_vless_service_ids,
    s.marzneshin_vless_trial_service_ids,
    h.outline_api_status,
    h.last_checked_at,
    h.last_success_at,
    h.last_usage_sync_at,
    h.consecutive_failures AS health_consecutive_failures,
    ( SELECT count(*) AS count
           FROM vpn_keys k
          WHERE k.server_id = s.id AND (k.status = ANY (ARRAY['active'::text, 'pending'::text]))) AS live_active_key_count
   FROM vpn_servers s
     LEFT JOIN server_health_status h ON h.server_id = s.id;
alter table public."access_tokens" enable row level security;
revoke all on public."access_tokens" from public,anon,authenticated; grant all on public."access_tokens" to service_role;
alter table public."admins" enable row level security;
revoke all on public."admins" from public,anon,authenticated; grant all on public."admins" to service_role;
alter table public."app_events" enable row level security;
revoke all on public."app_events" from public,anon,authenticated; grant all on public."app_events" to service_role;
alter table public."commission_ledger" enable row level security;
revoke all on public."commission_ledger" from public,anon,authenticated; grant all on public."commission_ledger" to service_role;
alter table public."dashboard_purchase_operations" enable row level security;
revoke all on public."dashboard_purchase_operations" from public,anon,authenticated; grant all on public."dashboard_purchase_operations" to service_role;
alter table public."monthly_settlements" enable row level security;
revoke all on public."monthly_settlements" from public,anon,authenticated; grant all on public."monthly_settlements" to service_role;
alter table public."notifications_sent" enable row level security;
revoke all on public."notifications_sent" from public,anon,authenticated; grant all on public."notifications_sent" to service_role;
alter table public."order_payments" enable row level security;
revoke all on public."order_payments" from public,anon,authenticated; grant all on public."order_payments" to service_role;
alter table public."platform_settings" enable row level security;
revoke all on public."platform_settings" from public,anon,authenticated; grant all on public."platform_settings" to service_role;
alter table public."reseller_miniapps" enable row level security;
revoke all on public."reseller_miniapps" from public,anon,authenticated; grant all on public."reseller_miniapps" to service_role;
alter table public."reseller_notification_templates" enable row level security;
revoke all on public."reseller_notification_templates" from public,anon,authenticated; grant all on public."reseller_notification_templates" to service_role;
alter table public."resellers" enable row level security;
revoke all on public."resellers" from public,anon,authenticated; grant all on public."resellers" to service_role;
alter table public."server_health_status" enable row level security;
revoke all on public."server_health_status" from public,anon,authenticated; grant all on public."server_health_status" to service_role;
alter table public."system_job_runs" enable row level security;
revoke all on public."system_job_runs" from public,anon,authenticated; grant all on public."system_job_runs" to service_role;
alter table public."telegram_links" enable row level security;
revoke all on public."telegram_links" from public,anon,authenticated; grant all on public."telegram_links" to service_role;
alter table public."token_server_assignments" enable row level security;
revoke all on public."token_server_assignments" from public,anon,authenticated; grant all on public."token_server_assignments" to service_role;
alter table public."vpn_customers" enable row level security;
revoke all on public."vpn_customers" from public,anon,authenticated; grant all on public."vpn_customers" to service_role;
alter table public."vpn_keys" enable row level security;
revoke all on public."vpn_keys" from public,anon,authenticated; grant all on public."vpn_keys" to service_role;
alter table public."vpn_orders" enable row level security;
revoke all on public."vpn_orders" from public,anon,authenticated; grant all on public."vpn_orders" to service_role;
alter table public."vpn_plans" enable row level security;
revoke all on public."vpn_plans" from public,anon,authenticated; grant all on public."vpn_plans" to service_role;
alter table public."vpn_servers" enable row level security;
revoke all on public."vpn_servers" from public,anon,authenticated; grant all on public."vpn_servers" to service_role;
revoke all on function public."activate_vpn_key"(p_key_id uuid, p_reseller_id uuid, p_outline_key_id text, p_access_url text, p_key_credentials jsonb) from public,anon,authenticated;
grant execute on function public."activate_vpn_key"(p_key_id uuid, p_reseller_id uuid, p_outline_key_id text, p_access_url text, p_key_credentials jsonb) to service_role;
grant execute on function public."admin_monitoring_daily"(p_start timestamp with time zone, p_end timestamp with time zone, p_reseller_id uuid) to service_role;
grant execute on function public."admin_monitoring_funnel"(p_start timestamp with time zone, p_end timestamp with time zone, p_reseller_id uuid) to service_role;
grant execute on function public."admin_monitoring_server_events"(p_start timestamp with time zone, p_end timestamp with time zone, p_reseller_id uuid) to service_role;
grant execute on function public."admin_monitoring_summary"(p_start timestamp with time zone, p_end timestamp with time zone, p_reseller_id uuid) to service_role;
revoke all on function public."apply_confirmed_payment"(p_order_id uuid, p_reseller_id uuid, p_reviewer_reseller_id uuid, p_reviewer_admin_id uuid) from public,anon,authenticated;
grant execute on function public."apply_confirmed_payment"(p_order_id uuid, p_reseller_id uuid, p_reviewer_reseller_id uuid, p_reviewer_admin_id uuid) to service_role;
revoke all on function public."claim_dashboard_purchase_setup"(p_reseller_id uuid, p_order_id uuid, p_owner uuid) from public,anon,authenticated;
grant execute on function public."claim_dashboard_purchase_setup"(p_reseller_id uuid, p_order_id uuid, p_owner uuid) to service_role;
grant execute on function public."cleanup_old_app_events"(p_days integer) to service_role;
revoke all on function public."ensure_dashboard_purchase_operation"(p_reseller_id uuid, p_order_id uuid) from public,anon,authenticated;
grant execute on function public."ensure_dashboard_purchase_operation"(p_reseller_id uuid, p_order_id uuid) to service_role;
revoke all on function public."fail_pending_key"(p_key_id uuid, p_reseller_id uuid) from public,anon,authenticated;
grant execute on function public."fail_pending_key"(p_key_id uuid, p_reseller_id uuid) to service_role;
revoke all on function public."finish_dashboard_purchase_setup"(p_reseller_id uuid, p_order_id uuid, p_owner uuid, p_state text, p_error_code text) from public,anon,authenticated;
grant execute on function public."finish_dashboard_purchase_setup"(p_reseller_id uuid, p_order_id uuid, p_owner uuid, p_state text, p_error_code text) to service_role;
revoke all on function public."prepare_dashboard_purchase"(p_reseller_id uuid, p_request_key uuid, p_request_hash text, p_payload jsonb) from public,anon,authenticated;
grant execute on function public."prepare_dashboard_purchase"(p_reseller_id uuid, p_request_key uuid, p_request_hash text, p_payload jsonb) to service_role;
revoke all on function public."reserve_pending_key"(p_order_id uuid, p_customer_id uuid, p_reseller_id uuid, p_server_id uuid, p_key_name text, p_data_limit_bytes bigint, p_protocol text) from public,anon,authenticated;
grant execute on function public."reserve_pending_key"(p_order_id uuid, p_customer_id uuid, p_reseller_id uuid, p_server_id uuid, p_key_name text, p_data_limit_bytes bigint, p_protocol text) to service_role;
grant execute on function public."rls_auto_enable"() to service_role;
grant execute on function public."set_order_quota_limit_from_plan"() to service_role;
grant execute on function public."sync_server_active_keys"() to service_role;
revoke all on public."customer_view" from public,anon,authenticated; grant all on public."customer_view" to service_role;
revoke all on public."order_view" from public,anon,authenticated; grant all on public."order_view" to service_role;
revoke all on public."server_view" from public,anon,authenticated; grant all on public."server_view" to service_role;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to service_role;
alter default privileges in schema public grant all on tables to service_role;
