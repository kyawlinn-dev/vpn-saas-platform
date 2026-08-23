export type Nullable<T> = T | null;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface OverviewStats {
  active_orders: number;
  pending_orders: number;
  stopped_orders: number;
  active_keys: number;
  total_value_mmk: number;
  recent_orders: Order[];
}

export interface AdminAnalyticsSummary {
  today_gross_mmk: number;
  month_gross_mmk: number;
  reseller_commission_mmk: number;
  platform_due_mmk: number;
  pending_review_mmk: number;
  payment_count: number;
  pending_review_count: number;
  active_orders: number;
  pending_orders: number;
  active_keys: number;
  active_resellers: number;
  submitted_settlements: number;
}

export interface AdminAnalyticsPeriod {
  month: string;
  time_zone: string;
  start_iso: string;
  end_iso: string;
  today: {
    date: string;
    start_iso: string;
    end_iso: string;
  };
}

export interface AdminAnalyticsBucket {
  gross_mmk: number;
  commission_mmk: number;
  platform_due_mmk: number;
  payment_count: number;
}

export interface AdminDailyRevenue extends AdminAnalyticsBucket {
  date: string;
}

export interface AdminResellerBreakdown extends AdminAnalyticsBucket {
  reseller_id: string;
  reseller_name: string;
}

export interface AdminPaymentTypeBreakdown extends AdminAnalyticsBucket {
  payment_type: string;
}

export interface OrderPayment {
  id: string;
  order_id: string;
  customer_id: string;
  reseller_id: Nullable<string>;
  amount_mmk: number;
  commission_percent: number;
  commission_amount_mmk: number;
  platform_due_mmk: number;
  review_status: 'pending_review' | 'confirmed' | 'rejected' | string;
  payment_type: 'initial' | 'extend' | 'renew' | string;
  apply_status: 'pending' | 'applied' | 'failed' | 'reversed' | string;
  source: Nullable<string>;
  payment_method?: Nullable<string>;
  payment_note?: Nullable<string>;
  review_note?: Nullable<string>;
  package_duration_days?: Nullable<number>;
  package_data_limit_gb?: Nullable<number>;
  submitted_at: string;
  reviewed_at: Nullable<string>;
  created_at: string;
  reseller?: Reseller | null;
  order?: Pick<Order, 'id' | 'status' | 'created_at'> & {
    order_type?: Nullable<string>;
    customer?: Pick<Customer, 'id' | 'full_name' | 'telegram_username'> | null;
    plan?: Pick<Plan, 'id' | 'name'> | null;
  };
}

export interface AdminAnalytics {
  period: AdminAnalyticsPeriod;
  summary: AdminAnalyticsSummary;
  daily_revenue: AdminDailyRevenue[];
  reseller_breakdown: AdminResellerBreakdown[];
  payment_type_breakdown: AdminPaymentTypeBreakdown[];
  recent_payments: OrderPayment[];
  pending_reviews: OrderPayment[];
}

export interface MonitoringEvent {
  id: string;
  event_name: string;
  actor_type: string | null;
  reseller_id: string | null;
  customer_id: string | null;
  telegram_user_id: number | string | null;
  order_id: string | null;
  payment_id: string | null;
  session_id: string | null;
  server_id: string | null;
  plan_id: string | null;
  page: string | null;
  route: string | null;
  status: 'info' | 'success' | 'blocked' | 'failed' | string;
  metadata: Record<string, unknown>;
  created_at: string;
  reseller?: Pick<Reseller, 'id' | 'name'> | null;
  customer?: Pick<Customer, 'id' | 'full_name' | 'telegram_username' | 'customer_type'> | null;
  server?: Pick<Server, 'id' | 'name' | 'region' | 'server_tier'> | null;
  plan?: Pick<Plan, 'id' | 'name'> | null;
}

export interface MonitoringSnapshot {
  period: {
    days: number;
    start_iso: string;
    end_iso: string;
  };
  missing_table: boolean;
  summary: {
    raw_events: number;
    total_events: number;
    unique_customers: number;
    unique_telegram_users: number;
    unique_miniapp_opens: number;
    miniapp_opens: number;
    miniapp_config_loads: number;
    packages_viewed: number;
    server_page_views: number;
    server_selected: number;
    server_blocked: number;
    order_submitted: number;
    screenshots_uploaded: number;
    trials_created: number;
    keys_provisioned: number;
    failures: number;
  };
  funnel: Array<{ event_name: string; count: number }>;
  daily: Array<{
    date: string;
    total: number;
    raw_events: number;
    miniapp_config_loads: number;
    unique_miniapp_opens: number;
    packages_viewed: number;
    order_submitted: number;
    server_selected: number;
    failures: number;
  }>;
  server_events: Array<{
    server_id: string;
    server_name: string;
    region: string | null;
    server_tier: string | null;
    selected: number;
    key_provisioned: number;
    blocked: number;
    failed: number;
  }>;
  server_health: Array<{
    id: string;
    name: string;
    region: string;
    status: string;
    server_tier: string;
    current_active_keys: number;
    max_active_keys: number;
    remaining_capacity: number;
    last_error: string | null;
    health?: {
      outline_api_status: string;
      last_checked_at: string | null;
      last_success_at: string | null;
      last_usage_sync_at: string | null;
      response_ms: number | null;
      consecutive_failures: number;
      last_error: string | null;
    } | null;
  }>;
  recent_events: MonitoringEvent[];
  kpis?: {
    new_customers_today: number;
    orders_submitted_today: number;
    keys_provisioned_today: number;
    failure_rate_24h_pct: number;
    median_provision_ms_24h: number | null;
    provisioning_sample_size_24h: number;
    unhealthy_server_count: number | null;
  } | null;
}

export interface ScreenshotBacklogRow {
  screenshot_event_id: string;
  order_id: string;
  reseller_id: string | null;
  reseller_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_telegram: string | null;
  uploaded_at: string;
  minutes_waiting: number;
}

export interface ScreenshotBacklogResponse {
  data: ScreenshotBacklogRow[];
  total: number;
  missing_table?: boolean;
}

export interface MonitoringEventsResponse {
  data: MonitoringEvent[];
  total: number;
  page: number;
  limit: number;
  period: {
    days: number;
    start_iso: string;
    end_iso: string;
  };
  missing_table: boolean;
}

export interface MonitoringJourneyResponse {
  data: MonitoringEvent[];
  total: number;
  period: {
    days: number;
    start_iso: string;
    end_iso: string;
  };
  missing_table: boolean;
}

export interface BackendHealthSnapshot {
  missing_table: boolean;
  runtime: {
    status: string;
    pid: number;
    node_env: string | null;
    app_env: string | null;
    node_version: string;
    uptime_seconds: number;
    started_at: string;
    memory: {
      rss_bytes: number;
      heap_used_bytes: number;
      heap_total_bytes: number;
      external_bytes: number;
    };
  };
  pm2: {
    available: boolean;
    reason?: string;
    current?: {
      name: string;
      pm_id: number;
      status: string;
      restart_time: number | null;
      unstable_restarts: number | null;
      uptime: number | null;
      memory_bytes: number | null;
      cpu_percent: number | null;
    } | null;
    processes?: Array<{
      name: string;
      pm_id: number;
      status: string;
      restart_time: number | null;
      memory_bytes: number | null;
      cpu_percent: number | null;
    }>;
  };
  jobs: Array<{
    job_name: string;
    status: string;
    last_started_at: string | null;
    last_finished_at: string | null;
    last_success_at: string | null;
    last_error: string | null;
    consecutive_failures: number;
    run_count: number;
    updated_at: string;
    stale: boolean;
  }>;
  servers: Array<{
    id: string;
    name: string;
    region: string;
    server_tier: string;
    status: string;
    current_active_keys: number;
    max_active_keys: number;
    last_error: string | null;
    health: {
      outline_api_status: string;
      last_checked_at: string | null;
      last_success_at: string | null;
      last_usage_sync_at: string | null;
      last_error: string | null;
      response_ms: number | null;
      active_key_count_seen: number | null;
      consecutive_failures: number;
      usage_sync_stale: boolean;
      health_check_stale: boolean;
    };
  }>;
  alerts: Array<{
    severity: 'warning' | 'destructive' | 'info' | 'success' | string;
    code: string;
    title: string;
    detail: string;
    server_id?: string;
  }>;
  thresholds_ms: {
    usageSyncStaleMs: number;
    healthCheckStaleMs: number;
  };
}

export interface Reseller {
  id: string;
  name: string;
  email?: string;
  status?: string;
  commission_percent?: number;
  created_at?: string;
  miniapp_slug?: string | null;
  miniapp_enabled?: boolean | null;
}

export interface BotStatus {
  token_saved: boolean;
  token_valid: boolean;
  webhook_registered: boolean;
  running: boolean;
  connected: boolean;
  bot_username: Nullable<string>;
  bot_id: Nullable<number>;
  webhook_registered_at?: Nullable<string>;
}

export interface AdminResellerWorkspace {
  miniapp_slug: string;
  brand_name: string;
  brand_logo_url: string;
  primary_color: string;
  trial_enabled: boolean;
  trial_data_limit_gb: number | null;
  trial_duration_days: number | null;
  bot_connected: boolean;
  bot_status: BotStatus;
}

export interface AdminResellerWorkspacePatch {
  miniapp_slug?: string;
  brand_logo_url?: string;
  primary_color?: string;
  trial_enabled?: boolean;
  trial_data_limit_gb?: number | null;
  trial_duration_days?: number | null;
  bot_token?: string;
}

export interface Customer {
  id: string;
  reseller_id: Nullable<string>;
  full_name: string;
  telegram_username: Nullable<string>;
  phone: Nullable<string>;
  notes: Nullable<string>;
  status?: string;
  customer_type?: 'normal' | 'telegram';
  ssconf_token?: Nullable<string>;
  ssconf_url?: Nullable<string>;
  dynamic_access_url?: Nullable<string>;
  preferred_access_url?: Nullable<string>;
  created_at?: string;
  reseller?: Reseller;
  telegram_link?: TelegramLink | null;
  orders?: Order[];
  active_order?: Order | null;
  keys?: VpnKey[];
  payment_summary?: PaymentSummary;
}

export interface TelegramLink {
  id: string;
  telegram_user_id: number | string;
  telegram_username: Nullable<string>;
  customer_id: string;
  reseller_id: string;
  trial_used_at: Nullable<string>;
  trial_order_id: Nullable<string>;
  created_at: string;
}

export interface PaymentSummary {
  gross_mmk: number;
  commission_mmk: number;
  platform_due_mmk: number;
  pending_mmk: number;
  confirmed_count: number;
  pending_count: number;
}

export interface Plan {
  id: string;
  name: string;
  price_mmk: number;
  duration_days: number;
  data_limit_gb: number;
  max_devices: number;
  is_active: boolean;
  is_trial: boolean;
  sort_order: number;
  features?: string[] | null;
  allowed_regions: string[] | null;
  created_at?: string;
}

export interface Server {
  id: string;
  name: string;
  provider: string | null;
  region: string;
  droplet_id: number | string | null;
  status: string;
  host_ip: string | null;
  server_tier?: 'trial' | 'premium' | string;
  outline_api_url?: string | null;
  outline_cert_sha256?: string | null;
  current_active_keys: number;
  max_active_keys: number;
  remaining_capacity: number;
  is_default: boolean;
  last_error: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Order {
  id: string;
  customer_id: string;
  reseller_id: Nullable<string>;
  plan_id: string;
  status: 'pending' | 'active' | 'expired' | 'stopped' | string;
  payment_status: 'unpaid' | 'paid' | 'overdue' | string;
  payment_note: Nullable<string>;
  price_mmk: number;
  commission_percent: number;
  commission_amount_mmk: number;
  start_date: Nullable<string>;
  expiry_date: Nullable<string>;
  activated_at: Nullable<string>;
  stopped_at: Nullable<string>;
  order_type?: Nullable<string>;
  review_status?: Nullable<string>;
  total_paid_mmk?: number;
  used_bytes?: number;
  ssconf_url?: Nullable<string>;
  dynamic_access_url?: Nullable<string>;
  preferred_access_url?: Nullable<string>;
  source?: Nullable<string>;
  created_at?: string;
  customer?: Customer;
  reseller?: Reseller;
  plan?: Plan;
  payments?: OrderPayment[];
  keys?: VpnKey[];
  // Lifetime usage across every key this order has ever had (survives
  // server switches) — see customerOrderEnrichmentService.js enrichOrderAccess.
  total_used_bytes?: number;
  total_used_gb?: number;
  total_remaining_gb?: Nullable<number>;
  is_unlimited?: boolean;
}

export interface VpnKey {
  id: string;
  order_id: string;
  customer_id: string;
  reseller_id: Nullable<string>;
  server_id?: Nullable<string>;
  outline_key_id: string;
  key_name: string;
  access_url: string;
  data_limit_bytes: Nullable<number>;
  used_bytes: Nullable<number>;
  status: 'active' | 'deleted' | string;
  ssconf_url?: Nullable<string>;
  dynamic_access_url?: Nullable<string>;
  preferred_access_url?: Nullable<string>;
  created_at?: string;
  deleted_at?: Nullable<string>;
  order?: Pick<Order, 'id' | 'status' | 'payment_status'>;
  order_total_used_bytes?: number;
  order_total_used_gb?: number;
  order_total_remaining_gb?: Nullable<number>;
}

export interface MonthlySettlement {
  id: string;
  reseller_id: string;
  settlement_month: string;
  status: 'draft' | 'submitted' | 'confirmed' | 'reopened' | string;
  gross_paid_mmk: number;
  reseller_commission_mmk: number;
  platform_due_mmk: number;
  pending_review_mmk: number;
  unpaid_mmk: number;
  rejected_mmk: number;
  confirmed_order_count: number;
  pending_review_count: number;
  unpaid_order_count: number;
  rejected_order_count: number;
  total_order_count: number;
  transfer_note: Nullable<string>;
  transfer_reference: Nullable<string>;
  transfer_proof_url: Nullable<string>;
  submitted_at: Nullable<string>;
  confirmed_at: Nullable<string>;
  confirmed_by_admin_id: Nullable<string>;
  reopened_at: Nullable<string>;
  admin_note: Nullable<string>;
  snapshot_basis?: Record<string, unknown>;
  created_at: Nullable<string>;
  updated_at: Nullable<string>;
  reseller?: Reseller | null;
  confirmed_by?: {
    id: string;
    full_name?: Nullable<string>;
    email?: Nullable<string>;
  } | null;
}
