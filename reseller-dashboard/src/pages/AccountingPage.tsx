import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  RefreshCw,
  Upload,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "../lib/api";
import { formatDate, formatMMK } from "../lib/format";
import type { MonthlyAccountingSnapshot } from "../types/api";

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function readableMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function extractErrorMessage(err: unknown) {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (e.response && typeof e.response === "object") {
      const r = e.response as Record<string, unknown>;
      if (r.data && typeof r.data === "object") {
        const d = r.data as Record<string, unknown>;
        if (typeof d.error === "string") return d.error;
      }
    }
    if (typeof e.message === "string") return e.message;
  }
  return "Failed to load accounting";
}

function MoneyCard({
  label,
  value,
  caption,
  icon,
  tone,
}: {
  label: string;
  value: number;
  caption: string;
  icon: ReactNode;
  tone: "primary" | "success" | "warning" | "neutral";
}) {
  const toneClasses = {
    primary: "bg-primary/14 text-primary",
    success: "bg-success/10 text-[color:var(--success)]",
    warning: "bg-warning/10 text-[color:var(--warning)]",
    neutral: "bg-muted text-foreground",
  };

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 truncate font-display text-xl font-black leading-none text-foreground">
            {formatMMK(value)}
          </p>
          <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{caption}</p>
        </div>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${toneClasses[tone]}`}>
          {icon}
        </span>
      </div>
    </Card>
  );
}

type SettlementBadgeVariant = "default" | "success" | "warning" | "destructive";

function getSettlementVariant(status: string): SettlementBadgeVariant {
  if (status === "confirmed") return "success";
  if (status === "submitted") return "warning";
  if (status === "reopened") return "destructive";
  return "default";
}

function getMonthCloseBadge({
  status,
  platformDue,
}: {
  status: string;
  platformDue: number;
}): { label: string; variant: SettlementBadgeVariant } {
  if (status === "confirmed") return { label: "Settled", variant: "success" };
  if (status === "submitted") return { label: "Awaiting admin", variant: "warning" };
  if (status === "reopened") return { label: "Needs update", variant: "destructive" };
  if (platformDue > 0) return { label: "Transfer due", variant: "warning" };
  return { label: "Clear", variant: "success" };
}

function getSubmitLabel(status?: string | null) {
  if (status === "confirmed") return "Confirmed by admin";
  if (status === "submitted") return "Update Submission";
  if (status === "reopened") return "Resubmit Transfer";
  return "Mark Transfer Submitted";
}

export function AccountingPage() {
  const [month, setMonth] = useState(currentMonthValue);
  const [snapshot, setSnapshot] = useState<MonthlyAccountingSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferProofUrl, setTransferProofUrl] = useState("");

  const loadAccounting = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const res = await api.get<MonthlyAccountingSnapshot>("/reseller/accounting/monthly", {
        params: { month },
      });
      setSnapshot(res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void loadAccounting();
  }, [loadAccounting]);

  useEffect(() => {
    setTransferReference(snapshot?.settlement?.transfer_reference || "");
    setTransferNote(snapshot?.settlement?.transfer_note || "");
    setTransferProofUrl(snapshot?.settlement?.transfer_proof_url || "");
  }, [
    snapshot?.settlement?.id,
    snapshot?.settlement?.transfer_note,
    snapshot?.settlement?.transfer_proof_url,
    snapshot?.settlement?.transfer_reference,
  ]);

  const uploadProof = async (file?: File | null) => {
    if (!file) return;

    setUploadingProof(true);
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("month", month);
      formData.append("file", file);

      const res = await api.post<{ path: string }>(
        "/reseller/accounting/monthly/settlement-proof",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      setTransferProofUrl(res.data.path);
      setMessage("Transfer proof uploaded. Submit the settlement to save it.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setUploadingProof(false);
    }
  };

  const openProof = async () => {
    try {
      setError("");
      const res = await api.get<{ signed_url: string }>("/reseller/accounting/monthly/settlement-proof-url", {
        params: { month },
      });
      window.open(res.data.signed_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const submitSettlement = async () => {
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const res = await api.post("/reseller/accounting/monthly/settlement", {
        month,
        transfer_reference: transferReference,
        transfer_note: transferNote,
        transfer_proof_url: transferProofUrl,
      });
      setSnapshot((current) =>
        current
          ? { ...current, settlement: res.data.settlement }
          : current
      );
      setMessage("Settlement submitted for admin confirmation.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const summary = snapshot?.summary;
  const settlementOrders = snapshot?.settlement_orders ?? [];
  const settlement = snapshot?.settlement ?? null;
  const settlementStatus = settlement?.status || "not submitted";
  const settlementLocked = settlement?.status === "confirmed";
  const monthCloseBadge = getMonthCloseBadge({
    status: settlement?.status || "",
    platformDue: summary?.platform_due_mmk ?? 0,
  });
  const netRetentionRate = useMemo(() => {
    if (!summary || summary.gross_paid_mmk <= 0) return 0;
    return Math.round((summary.reseller_commission_mmk / summary.gross_paid_mmk) * 100);
  }, [summary]);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-[18px] font-black tracking-tight text-foreground">
            Accounting
          </h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Monthly sales, commission, and platform transfer amount.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <label className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-[12px] text-muted-foreground">
            <CalendarDays size={14} />
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value || currentMonthValue())}
              className="bg-transparent text-[12px] font-semibold text-foreground outline-none"
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw size={13} />}
            loading={loading}
            onClick={() => void loadAccounting()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-xs text-[color:var(--success)]">
          {message}
        </div>
      )}

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <MoneyCard
          label="Gross paid"
          value={summary?.gross_paid_mmk ?? 0}
          caption={`${summary?.confirmed_order_count ?? 0} confirmed paid orders`}
          icon={<Wallet size={15} />}
          tone="neutral"
        />
        <MoneyCard
          label="Your commission"
          value={summary?.reseller_commission_mmk ?? 0}
          caption={`${snapshot?.reseller.commission_percent ?? 0}% retained by reseller`}
          icon={<CheckCircle2 size={15} />}
          tone="success"
        />
        <MoneyCard
          label="Transfer to owner"
          value={summary?.platform_due_mmk ?? 0}
          caption="Amount payable to NovaNet MM"
          icon={<ArrowDownToLine size={15} />}
          tone="primary"
        />
        <MoneyCard
          label="Pending review"
          value={summary?.pending_review_mmk ?? 0}
          caption={`${summary?.pending_review_count ?? 0} Telegram payments waiting`}
          icon={<Clock3 size={15} />}
          tone="warning"
        />
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-[13px] font-black tracking-tight text-foreground">
                Month Close
              </h2>
              <p className="text-[11px] text-muted-foreground">{readableMonth(month)}</p>
            </div>
            <Badge variant={monthCloseBadge.variant}>
              {monthCloseBadge.label}
            </Badge>
          </div>

          <div className="rounded-lg border border-border bg-muted/55 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Payable to platform owner
            </p>
            <p className="mt-1 font-display text-3xl font-black leading-none text-foreground">
              {formatMMK(summary?.platform_due_mmk ?? 0)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-md bg-card px-2.5 py-2">
                <p className="font-bold text-foreground">{netRetentionRate}%</p>
                <p className="text-muted-foreground">Reseller share</p>
              </div>
              <div className="rounded-md bg-card px-2.5 py-2">
                <p className="font-bold text-foreground">{summary?.total_order_count ?? 0}</p>
                <p className="text-muted-foreground">Orders this month</p>
              </div>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-md border border-border bg-card px-2.5 py-2">
              <p className="font-bold text-foreground">{formatMMK(summary?.unpaid_mmk ?? 0)}</p>
              <p className="text-muted-foreground">{summary?.unpaid_order_count ?? 0} unpaid orders</p>
            </div>
            <div className="rounded-md border border-border bg-card px-2.5 py-2">
              <p className="font-bold text-foreground">{formatMMK(summary?.rejected_mmk ?? 0)}</p>
              <p className="text-muted-foreground">{summary?.rejected_order_count ?? 0} rejected orders</p>
            </div>
          </div>

          <div className="mt-2 flex items-start gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-[11px] text-muted-foreground">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-primary" />
            <p>
              This workflow uses order creation month and includes paid purchase orders after payment review is confirmed.
            </p>
          </div>

          <div className="mt-2 rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-[12px] font-black text-foreground">Settlement Status</h3>
                <p className="text-[10px] text-muted-foreground">
                  Submit after you transfer the platform amount.
                </p>
              </div>
              <Badge variant={getSettlementVariant(settlement?.status || "")}>
                {settlementStatus}
              </Badge>
            </div>

            <div className="space-y-2">
              <Input
                value={transferReference}
                onChange={(event) => setTransferReference(event.target.value)}
                disabled={settlementLocked}
                placeholder="Transfer reference, transaction ID, or account"
                className="h-8 text-[12px]"
              />
              <Textarea
                value={transferNote}
                onChange={(event) => setTransferNote(event.target.value)}
                disabled={settlementLocked}
                placeholder="Optional note for platform owner"
                className="min-h-16 resize-none text-[12px]"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-secondary">
                  <Upload size={13} />
                  {uploadingProof ? "Uploading..." : transferProofUrl ? "Replace proof" : "Upload proof"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={settlementLocked || uploadingProof}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      void uploadProof(file);
                    }}
                  />
                </label>
                {settlement?.transfer_proof_url && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    leftIcon={<ExternalLink size={13} />}
                    onClick={() => void openProof()}
                  >
                    View proof
                  </Button>
                )}
              </div>
              {transferProofUrl && (
                <p className="truncate text-[10px] text-muted-foreground">
                  Proof: {transferProofUrl.split("/").pop()}
                  {!settlement?.transfer_proof_url ? " (submit to save)" : ""}
                </p>
              )}
              {settlement?.submitted_at && (
                <p className="text-[10px] text-muted-foreground">
                  Submitted {formatDate(settlement.submitted_at)}
                  {settlement.confirmed_at ? ` - Confirmed ${formatDate(settlement.confirmed_at)}` : ""}
                </p>
              )}
              {settlement?.admin_note && (
                <div className="rounded-md border border-border bg-muted/60 px-2.5 py-2 text-[11px] text-muted-foreground">
                  Admin note: {settlement.admin_note}
                </div>
              )}
              <Button
                variant="primary"
                size="sm"
                fullWidth
                loading={submitting}
                disabled={!snapshot || settlementLocked || (summary?.platform_due_mmk ?? 0) <= 0}
                onClick={() => void submitSettlement()}
              >
                {getSubmitLabel(settlement?.status)}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-[13px] font-black tracking-tight text-foreground">
                Settlement Orders
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Orders included in the platform transfer calculation.
              </p>
            </div>
            <Badge variant="default">{settlementOrders.length} rows</Badge>
          </div>

          {settlementOrders.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/55 px-3 py-8 text-center text-[12px] text-muted-foreground">
              No confirmed paid purchase orders in this month yet.
            </div>
          ) : (
            <Table className="text-[12px]">
              <TableHeader>
                <TableRow className="bg-muted/65 hover:bg-muted/65">
                  <TableHead className="h-8 px-2.5">Customer</TableHead>
                  <TableHead className="h-8 px-2.5">Plan</TableHead>
                  <TableHead className="h-8 px-2.5 text-right">Paid</TableHead>
                  <TableHead className="h-8 px-2.5 text-right">Commission</TableHead>
                  <TableHead className="h-8 px-2.5 text-right">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlementOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="px-2.5 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{order.customer_name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {order.telegram_username || order.source || "-"} - {formatDate(order.created_at)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="px-2.5 py-2">
                      <span className="line-clamp-2">{order.plan_name}</span>
                    </TableCell>
                    <TableCell className="px-2.5 py-2 text-right font-semibold">
                      {formatMMK(order.total_paid_mmk)}
                    </TableCell>
                    <TableCell className="px-2.5 py-2 text-right">
                      <p className="font-semibold text-[color:var(--success)]">
                        {formatMMK(order.commission_amount_mmk)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{order.commission_percent}%</p>
                    </TableCell>
                    <TableCell className="px-2.5 py-2 text-right font-black text-primary">
                      {formatMMK(order.platform_due_mmk)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
