import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Calculator, CheckCircle2, Clock, CreditCard, TrendingUp, Users } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDate, formatMMK } from '@/lib/format';
import type { AdminAnalytics, OrderPayment } from '@/types/api';

const CHART_COLORS = ['#7c3aed', '#06b6d4', '#16a34a', '#f97316', '#eab308'];

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function paymentLabel(payment: OrderPayment) {
  const customer = payment.order?.customer?.full_name || 'Unknown customer';
  const plan = payment.order?.plan?.name || 'Unknown plan';
  return `${customer} - ${plan}`;
}

function moneyTooltip(value: unknown) {
  const numericValue = Array.isArray(value) ? value[0] : value;
  return formatMMK(Number(numericValue || 0));
}

export function AnalyticsPage() {
  const [month, setMonth] = useState(currentMonthValue);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .get<AdminAnalytics>('/admin/analytics', { params: { month } })
      .then((res) => setAnalytics(res.data))
      .catch((err: any) => setError(err?.response?.data?.error || err.message || 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [month]);

  const dailyRevenue = useMemo(
    () =>
      (analytics?.daily_revenue ?? []).map((row) => ({
        ...row,
        label: shortDate(row.date),
      })),
    [analytics],
  );

  const resellerBreakdown = analytics?.reseller_breakdown ?? [];
  const paymentTypes = analytics?.payment_type_breakdown ?? [];
  const summary = analytics?.summary;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Analytics</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Platform revenue, reseller performance, and payment flow.
          </p>
        </div>
        <div className="w-full md:w-48">
          <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !analytics ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Today Revenue" value={formatMMK(summary?.today_gross_mmk ?? 0)} accent="success" icon={<CreditCard size={16} />} />
            <StatCard label="Month Revenue" value={formatMMK(summary?.month_gross_mmk ?? 0)} accent="info" icon={<TrendingUp size={16} />} />
            <StatCard label="Platform Due" value={formatMMK(summary?.platform_due_mmk ?? 0)} icon={<Calculator size={16} />} />
            <StatCard label="Commission" value={formatMMK(summary?.reseller_commission_mmk ?? 0)} accent="warning" icon={<CheckCircle2 size={16} />} />
            <StatCard label="Pending Review" value={formatMMK(summary?.pending_review_mmk ?? 0)} accent="warning" icon={<Clock size={16} />} />
            <StatCard label="Active Resellers" value={summary?.active_resellers ?? 0} icon={<Users size={16} />} />
            <StatCard label="Active Orders" value={summary?.active_orders ?? 0} accent="success" icon={<Activity size={16} />} />
            <StatCard label="Submitted Settlements" value={summary?.submitted_settlements ?? 0} accent="warning" icon={<Calculator size={16} />} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-foreground">Daily Revenue</h2>
                  <p className="text-xs text-muted-foreground">{analytics?.period.time_zone} business days</p>
                </div>
                <Badge variant="outline">{analytics?.period.month}</Badge>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyRevenue} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="grossRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${Number(value) / 1000}k`} />
                    <Tooltip formatter={moneyTooltip} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }} />
                    <Area type="monotone" dataKey="gross_mmk" name="Gross" stroke="#7c3aed" fill="url(#grossRevenue)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-4">
                <h2 className="font-semibold text-foreground">Payment Mix</h2>
                <p className="text-xs text-muted-foreground">Confirmed and applied package events</p>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentTypes}
                      dataKey="gross_mmk"
                      nameKey="payment_type"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={3}
                    >
                      {paymentTypes.map((entry, index) => (
                        <Cell key={entry.payment_type} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={moneyTooltip} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {paymentTypes.map((entry, index) => (
                  <div key={entry.payment_type} className="rounded-lg border border-border bg-secondary/35 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                      <span className="text-xs uppercase text-muted-foreground">{entry.payment_type}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-foreground">{formatMMK(entry.gross_mmk)}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1.25fr]">
            <Card className="p-5">
              <div className="mb-4">
                <h2 className="font-semibold text-foreground">Reseller Revenue</h2>
                <p className="text-xs text-muted-foreground">Top resellers for the selected month</p>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={resellerBreakdown.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 18, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="reseller_name" type="category" width={105} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={moneyTooltip} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }} />
                    <Bar dataKey="gross_mmk" name="Gross" fill="#06b6d4" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 className="font-semibold text-foreground">Recent Payment Events</h2>
                  <p className="text-xs text-muted-foreground">Latest ledger activity across all resellers</p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Customer</TableHead>
                    <TableHead>Reseller</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(analytics?.recent_payments ?? []).length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No payment events yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    analytics?.recent_payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <div className="font-medium text-foreground">{paymentLabel(payment)}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(payment.created_at)}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{payment.reseller?.name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{payment.payment_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1.5">
                            <StatusBadge status={payment.review_status} />
                            <StatusBadge status={payment.apply_status} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatMMK(payment.amount_mmk)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
