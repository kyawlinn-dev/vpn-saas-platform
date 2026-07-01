export type Nullable<T> = T | null;

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
  is_active?: boolean;
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
