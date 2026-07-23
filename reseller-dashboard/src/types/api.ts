export type Nullable<T> = T | null;

export interface Reseller {
  id: string;
  name: string;
  email?: string;
  status?: string;
  commission_percent?: number;
  created_at?: string;
}

export interface Customer {
  id: string;
  reseller_id: Nullable<string>;
  full_name: string;
  telegram_username: Nullable<string>;
  phone: Nullable<string>;
  notes: Nullable<string>;
  customer_type?: "normal" | "telegram";
  created_at?: string;
  reseller?: Reseller;
}

export interface Plan {
  id: string;
  name: string;
  price_mmk: number;
  duration_days: number;
  data_limit_gb: Nullable<number>;
  max_devices: Nullable<number>;
  allowed_regions?: string[];
  is_active?: boolean;
}

export interface Order {
  id: string;
  customer_id: string;
  reseller_id: Nullable<string>;
  plan_id: string;

  status: "pending" | "active" | "expired" | "stopped" | "overdue" | string;
  payment_status:
    | "pending"
    | "unpaid"
    | "paid"
    | "overdue"
    | "refunded"
    | string;

  order_type?: "trial" | "purchase" | string;
  review_status?: "pending_review" | "confirmed" | "rejected" | string;
  payment_screenshot_url?: Nullable<string>;
  source?: "miniapp" | "bot" | "dashboard" | string;

  payment_note: Nullable<string>;
  price_mmk: number;
  total_paid_mmk: number;
  commission_percent: number;
  commission_amount_mmk: number;
  start_date: Nullable<string>;
  expiry_date: Nullable<string>;
  activated_at: Nullable<string>;
  stopped_at: Nullable<string>;
  created_at?: string;

  customer?: Customer;
  reseller?: Reseller;
  plan?: Plan;
  payments?: OrderPayment[];
}

export interface OrderPayment {
  id: string;
  amount_mmk: number;
  commission_amount_mmk?: number;
  platform_due_mmk?: number;
  review_status: "pending_review" | "confirmed" | "rejected" | string;
  payment_type?: "initial" | "extend" | "renew" | string;
  apply_status?: "pending" | "applied" | "failed" | "reversed" | string;
  created_at?: string;
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
  dynamic_access_url?: Nullable<string>;
  ssconf_url?: Nullable<string>;
  ssconf_token?: Nullable<string>;
  preferred_access_url?: Nullable<string>;
  data_limit_bytes: Nullable<number>;
  used_bytes: Nullable<number>;
  status: "active" | "deleted" | string;
  created_at?: string;
  deleted_at?: Nullable<string>;
  used_at?: Nullable<string>;

  used_bytes_30d?: number;
  used_gb_30d?: number;
  order_total_used_bytes?: number;
  order_total_used_gb?: number;
  order_total_remaining_gb?: Nullable<number>;
  data_limit_gb?: Nullable<number>;
  remaining_gb_30d?: Nullable<number>;
  recent_connections_24h?: number;

  order?: {
    id: string;
    status?: string;
    payment_status?: string;
    expiry_date?: Nullable<string>;
  };

  customer?: {
    id: string;
    full_name?: string;
    telegram_username?: Nullable<string>;
    phone?: Nullable<string>;
  };

  server?: {
    id: string;
    name?: string;
    status?: string;
    host_ip?: Nullable<string>;
  } | null;
}

export type VpnServerStatus =
  | "available"
  | "provisioning"
  | "active"
  | "full"
  | "failed"
  | string;

export interface VpnServer {
  id: string;
  name: string;
  host_ip: Nullable<string>;
  status: VpnServerStatus;
  current_users?: number;
  max_users?: number;
  outline_api_url?: Nullable<string>;
  created_at?: string;
}

export interface PaymentMethod {
  method: string;
  account_name: string;
  account_number: string;
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

export interface WorkspaceSettings {
  miniapp_slug: string;
  brand_name: string;
  brand_logo_url: string;
  support_username: string;
  primary_color: string;
  trial_enabled: boolean;
  trial_data_limit_gb: number | null;
  trial_duration_days: number | null;
  payment_info: PaymentMethod[];
  bot_connected: boolean;
  bot_status?: BotStatus;
}

export interface ServerInventoryCounts {
  total: number;
  available: number;
  provisioning: number;
  active_configured: number;
  active_not_ready: number;
  full: number;
  failed: number;
}

export interface AccountingPeriod {
  month: string;
  startIso: string;
  endIso: string;
}

export interface AccountingSummary {
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
}

export interface AccountingSettlementOrder {
  id: string;
  created_at: Nullable<string>;
  customer_name: string;
  telegram_username: Nullable<string>;
  plan_name: string;
  source: Nullable<string>;
  status: string;
  payment_status: string;
  review_status: string;
  price_mmk: number;
  total_paid_mmk: number;
  commission_percent: number;
  commission_amount_mmk: number;
  platform_due_mmk: number;
}

export interface MonthlySettlement {
  id: string;
  reseller_id: string;
  settlement_month: string;
  status: "draft" | "submitted" | "confirmed" | "reopened" | string;
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

export interface MonthlyAccountingSnapshot {
  period: AccountingPeriod;
  reseller: {
    id: string;
    name: string;
    commission_percent: number;
  };
  summary: AccountingSummary;
  settlement_orders: AccountingSettlementOrder[];
  basis: {
    period_field: string;
    included_orders: string;
    platform_due_formula: string;
  };
  settlement: MonthlySettlement | null;
}
