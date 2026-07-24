import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  ArrowRight,
  Calculator,
  Clock,
  CreditCard,
  Key,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { GlowStatCard } from '@/components/ui/glow-stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDate, formatMMK } from '@/lib/format';
import type { AdminAnalytics, OrderPayment } from '@/types/api';

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function customerLabel(payment: OrderPayment) {
  return payment.order?.customer?.full_name || 'Unknown customer';
}

function planLabel(payment: OrderPayment) {
  return payment.order?.plan?.name || 'Unknown plan';
}

function sourceLabel(source?: string | null) {
  if (!source) return 'dashboard';
  return source.replace(/_/g, ' ');
}

function AttentionRow({
  label,
  detail,
  count,
  to,
  tone = 'warning',
}: {
  label: string;
  detail: string;
  count: number | string;
  to: string;
  tone?: 'warning' | 'success' | 'info';
}) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'info' ? 'text-primary' : 'text-warning';

  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5 transition-colors hover:bg-secondary/60"
    >
      <div className="min-w-0">
        <div className="font-medium text-foreground">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`text-sm font-bold ${toneClass}`}>{count}</span>
        <ArrowRight size={14} className="text-muted-foreground" />
      </div>
    </Link>
  );
}

export function OverviewPage() {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .get<AdminAnalytics>('/admin/analytics', { params: { month: currentMonthValue() } })
      .then((res) => setAnalytics(res.data))
      .catch((err: any) => setError(err?.response?.data?.error || err.message || 'Failed to load overview'))
      .finally(() => setLoading(false));
  }, []);

  const summary = analytics?.summary;
  const recentPayments = analytics?.recent_payments.slice(0, 6) ?? [];
  const topResellers = analytics?.reseller_breakdown.slice(0, 5) ?? [];
  const dailyRevenue = analytics?.daily_revenue.slice(-10) ?? [];

  const maxDailyRevenue = useMemo(
    () => Math.max(1, ...dailyRevenue.map((day) => Number(day.gross_mmk || 0))),
    [dailyRevenue],
  );

  const hasAttention =
    Number(summary?.pending_review_count || 0) > 0 ||
    Number(summary?.submitted_settlements || 0) > 0 ||
    Number(summary?.pending_orders || 0) > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Overview</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Daily control room for revenue, reviews, resellers, and access health.
          </p>
        </div>
        <Link
          to="/analytics"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80"
        >
          <TrendingUp size={16} />
          Open Analytics
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !analytics ? (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
          <GlowStatCard
            label="Today Revenue"
            value={Number(summary?.today_gross_mmk || 0).toLocaleString('en-US')}
            unit="MMK"
            caption="Confirmed today"
            icon={<CreditCard size={12} />}
            tone="success"
          />
          <GlowStatCard
            label="Month Revenue"
            value={Number(summary?.month_gross_mmk || 0).toLocaleString('en-US')}
            unit="MMK"
            caption="Platform-wide, this month"
            icon={<TrendingUp size={12} />}
            tone="cyan"
          />
          <GlowStatCard
            label="Platform Due"
            value={Number(summary?.platform_due_mmk || 0).toLocaleString('en-US')}
            unit="MMK"
            caption="Owed from resellers"
            icon={<Calculator size={12} />}
            tone="blue"
          />
          <GlowStatCard
            label="Pending Review"
            value={Number(summary?.pending_review_mmk || 0).toLocaleString('en-US')}
            unit="MMK"
            caption="Awaiting confirmation"
            icon={<Clock size={12} />}
            tone="warning"
          />
          <GlowStatCard
            label="Active Orders"
            value={summary?.active_orders ?? 0}
            caption="Currently active"
            icon={<Activity size={12} />}
            tone="violet"
          />
          <GlowStatCard
            label="Active Keys"
            value={summary?.active_keys ?? 0}
            caption="Provisioned VPN keys"
            icon={<Key size={12} />}
            tone="success"
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">Attention Queue</h2>
              <p className="text-xs text-muted-foreground">Items that need owner or operator review.</p>
            </div>
            <Badge variant={hasAttention ? 'warning' : 'success'}>{hasAttention ? 'open' : 'clear'}</Badge>
          </div>

          <div className="space-y-2">
            {hasAttention ? (
              <>
                {Number(summary?.pending_review_count || 0) > 0 && (
                  <AttentionRow
                    label="Payment reviews"
                    detail={`${formatMMK(summary?.pending_review_mmk ?? 0)} waiting for confirmation`}
                    count={summary?.pending_review_count ?? 0}
                    to="/orders"
                  />
                )}
                {Number(summary?.submitted_settlements || 0) > 0 && (
                  <AttentionRow
                    label="Submitted settlements"
                    detail="Reseller transfers waiting for owner confirmation"
                    count={summary?.submitted_settlements ?? 0}
                    to="/settlements"
                  />
                )}
                {Number(summary?.pending_orders || 0) > 0 && (
                  <AttentionRow
                    label="Pending orders"
                    detail="Orders not fully activated yet"
                    count={summary?.pending_orders ?? 0}
                    to="/orders"
                    tone="info"
                  />
                )}
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-secondary/20 px-4 py-8 text-center text-sm text-muted-foreground">
                No urgent payment reviews, settlements, or pending orders right now.
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">Revenue Rhythm</h2>
              <p className="text-xs text-muted-foreground">Last {dailyRevenue.length || 0} active business days</p>
            </div>
            <Badge variant="outline">{analytics?.period.month || currentMonthValue()}</Badge>
          </div>
          <div className="flex h-40 items-end gap-2">
            {dailyRevenue.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                No confirmed payment activity yet.
              </div>
            ) : (
              dailyRevenue.map((day) => {
                const height = Math.max(12, (Number(day.gross_mmk || 0) / maxDailyRevenue) * 100);
                return (
                  <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
                    <div className="text-center text-[10px] font-medium text-muted-foreground">
                      {Number(day.gross_mmk || 0) >= 1000 ? `${Math.round(Number(day.gross_mmk) / 1000)}k` : day.gross_mmk}
                    </div>
                    <div
                      className="rounded-t-md bg-primary/80 transition-all"
                      style={{ height: `${height}%` }}
                      title={`${day.date}: ${formatMMK(day.gross_mmk)}`}
                    />
                    <div className="truncate text-center text-[10px] text-muted-foreground">
                      {day.date.slice(5)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold text-foreground">Top Resellers</h2>
              <p className="text-xs text-muted-foreground">Gross paid this month</p>
            </div>
            <Link to="/analytics" className="text-xs font-medium text-primary hover:text-primary/80">
              Details
            </Link>
          </div>
          <div className="divide-y divide-border">
            {topResellers.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">No reseller revenue yet.</div>
            ) : (
              topResellers.map((reseller, index) => (
                <div key={reseller.reseller_id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-bold text-muted-foreground">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{reseller.reseller_name}</div>
                      <div className="text-xs text-muted-foreground">{reseller.payment_count} payments</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-foreground">{formatMMK(reseller.gross_mmk)}</div>
                    <div className="text-xs text-muted-foreground">{formatMMK(reseller.platform_due_mmk)} due</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold text-foreground">Recent Payment Events</h2>
              <p className="text-xs text-muted-foreground">Ledger-first activity across all resellers</p>
            </div>
            <Badge variant="outline">{summary?.payment_count ?? 0} confirmed</Badge>
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
              {recentPayments.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No payment events yet.
                  </TableCell>
                </TableRow>
              ) : (
                recentPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{customerLabel(payment)}</div>
                      <div className="text-xs text-muted-foreground">{planLabel(payment)} - {formatDate(payment.created_at)}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{payment.reseller?.name || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline">{payment.payment_type}</Badge>
                        <Badge variant="default">{sourceLabel(payment.source)}</Badge>
                      </div>
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

      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-secondary p-2 text-muted-foreground">
              <Users size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">{summary?.active_resellers ?? 0} active resellers</div>
              <div className="text-xs text-muted-foreground">Current enabled selling accounts</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-secondary p-2 text-muted-foreground">
              <ShoppingCart size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">{summary?.pending_orders ?? 0} pending orders</div>
              <div className="text-xs text-muted-foreground">Operational queue from order state</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-secondary p-2 text-muted-foreground">
              <Calculator size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">{formatMMK(summary?.reseller_commission_mmk ?? 0)} commission</div>
              <div className="text-xs text-muted-foreground">Total reseller share this month</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
