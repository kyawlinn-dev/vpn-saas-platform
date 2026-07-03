// Sample reseller config. In production this is replaced by dynamic reseller data.
export const reseller = {
  brandName: 'Test Reseller',
  subtitle: 'Secure private access',
  // primaryColor: blue / cyan (applied via theme tokens)
}

export const subscription = {
  plan: 'Premium Plan',
  status: 'Active',
  validUntil: 'Jul 31, 2026',
  dataUsedGb: 2.1,
  dataTotalGb: 100,
  get usedPercent() {
    return Math.round((this.dataUsedGb / this.dataTotalGb) * 100)
  },
}

export type ServerTag = 'Premium' | 'High Speed' | 'Standard' | 'Streaming'

export type VpnServer = {
  id: string
  city: string
  number: number
  latency: number
  tags: ServerTag[]
  current?: boolean
}

export type Country = {
  code: string
  name: string
  flag: string
  servers: VpnServer[]
}

export const countries: Country[] = [
  {
    code: 'sg',
    name: 'Singapore',
    flag: '🇸🇬',
    servers: [
      { id: 'sg-92', city: 'Singapore', number: 92, latency: 24, tags: ['Premium', 'High Speed'] },
      { id: 'sg-93', city: 'Singapore', number: 93, latency: 28, tags: ['Premium'] },
      { id: 'sg-99', city: 'Singapore', number: 99, latency: 35, tags: ['Standard'] },
    ],
  },
  {
    code: 'in',
    name: 'India',
    flag: '🇮🇳',
    servers: [
      { id: 'in-91', city: 'Bangalore', number: 91, latency: 24, tags: ['Premium', 'High Speed'], current: true },
      { id: 'in-94', city: 'Mumbai', number: 94, latency: 31, tags: ['Premium', 'High Speed'] },
      { id: 'in-97', city: 'Chennai', number: 97, latency: 36, tags: ['Premium', 'Streaming'] },
    ],
  },
  {
    code: 'jp',
    name: 'Japan',
    flag: '🇯🇵',
    servers: [
      { id: 'jp-85', city: 'Tokyo', number: 85, latency: 38, tags: ['Premium'] },
      { id: 'jp-86', city: 'Osaka', number: 86, latency: 42, tags: ['Standard'] },
    ],
  },
]

export const currentServer = {
  country: 'India',
  city: 'Bangalore',
  flag: '🇮🇳',
  number: 91,
  latency: 24,
  tags: ['Premium', 'High Speed'] as ServerTag[],
}

export type Plan = {
  id: string
  name: string
  dataGb: number
  days: number
  price: number
  currency: string
  popular?: boolean
  features: string[]
}

export const plans: Plan[] = [
  {
    id: 'basic',
    name: 'Basic Plan',
    dataGb: 50,
    days: 30,
    price: 4000,
    currency: 'MMK',
    features: ['Premium servers', 'No-log policy', 'Up to 2 devices'],
  },
  {
    id: 'premium',
    name: 'Premium Plan',
    dataGb: 100,
    days: 30,
    price: 5000,
    currency: 'MMK',
    popular: true,
    features: ['Premium servers', 'No-log policy', 'Up to 2 devices', 'High speed connection'],
  },
  {
    id: 'max',
    name: 'Max Plan',
    dataGb: 200,
    days: 30,
    price: 8000,
    currency: 'MMK',
    features: ['Premium servers', 'High speed connection', 'Best for heavy users'],
  },
]

export const paymentMethods = [
  { id: 'kbzpay', name: 'KBZPay', account: '09 123 456 789', label: 'KBZPay Phone Number' },
  { id: 'wavepay', name: 'WavePay', account: '09 987 654 321', label: 'WavePay Phone Number' },
  { id: 'bank', name: 'Bank Transfer', account: '0012 3456 7890', label: 'Bank Account Number' },
]

export const formatPrice = (price: number, currency: string) =>
  `${price.toLocaleString('en-US')} ${currency}`
