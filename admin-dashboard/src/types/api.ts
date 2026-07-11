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

export interface Customer {
  id: string;
  reseller_id: Nullable<string>;
  full_name: string;
  telegram_username: Nullable<string>;
  phone: Nullable<string>;
  notes: Nullable<string>;
  customer_type?: 'normal' | 'telegram';
  created_at?: string;
  reseller?: Reseller;
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
  created_at?: string;
  customer?: Customer;
  reseller?: Reseller;
  plan?: Plan;
}

export interface VpnKey {
  id: string;
  order_id: string;
  customer_id: string;
  reseller_id: Nullable<string>;
  outline_key_id: string;
  key_name: string;
  access_url: string;
  data_limit_bytes: Nullable<number>;
  used_bytes: Nullable<number>;
  status: 'active' | 'deleted' | string;
  created_at?: string;
  deleted_at?: Nullable<string>;
  order?: Pick<Order, 'id' | 'status' | 'payment_status'>;
}
