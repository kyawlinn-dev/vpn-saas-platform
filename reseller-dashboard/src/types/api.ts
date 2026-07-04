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

export interface AccessToken {
  id: string;
  token: string;
  status: string;
  expires_at: Nullable<string>;
  created_at?: string;
  last_used_at?: Nullable<string>;
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
  access_tokens?: AccessToken[];
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
  status: "active" | "deleted" | string;
  created_at?: string;
  deleted_at?: Nullable<string>;
  used_at?: Nullable<string>;

  used_bytes_30d?: number;
  used_gb_30d?: number;
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
