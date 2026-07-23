import { useMemo, useState } from "react";
import {
  RefreshCw, Image as ImageIcon, ExternalLink, CheckCircle2, XCircle, Bot,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogHeader, DialogTitle, DialogDescription,
  DialogBody, DialogFooter,
} from "@/components/ui/dialog";
import { api } from "../lib/api";
import { formatDate, formatMMK } from "../lib/format";
import { useScopedDashboard } from "../hooks/useScopedDashboard";
import type { Order } from "../types/api";

function ReviewChip({ value }: { value?: string | null }) {
  const v = String(value || "pending_review");
  return (
    <Badge variant={v === "confirmed" ? "success" : v === "rejected" ? "destructive" : "warning"}>
      {v === "confirmed" ? "Confirmed" : v === "rejected" ? "Rejected" : "Pending Review"}
    </Badge>
  );
}

function AccessChip({ value }: { value?: string | null }) {
  const v = String(value || "pending");
  return (
    <Badge variant={v === "active" ? "success" : v === "stopped" ? "default" : "info"}>
      {v === "active" ? "Active" : v === "stopped" ? "Stopped" : "Pending"}
    </Badge>
  );
}

function getOrderSource(order: Order) {
  return String(order.source || "dashboard");
}

function getTelegramOrders(orders: Order[]) {
  return orders.filter((order) => {
    const source = getOrderSource(order);
    const telegramManaged =
      source === "miniapp" ||
      source === "bot" ||
      order.customer?.customer_type === "telegram";
    return telegramManaged && order.order_type === "purchase";
  });
}

export function TelegramOrdersPage() {
  const { orders, refresh, loading, error } = useScopedDashboard();

  const [reviewFilter, setReviewFilter] = useState("pending_review");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [rejectConfirmOrder, setRejectConfirmOrder] = useState<Order | null>(null);
  const [actionError, setActionError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Signed URLs keyed by orderId — cached for the session so repeated clicks
  // don't hit the backend again until the component unmounts.
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [fetchingSignedUrl, setFetchingSignedUrl] = useState<string | null>(null);

  const telegramOrders = useMemo(() => getTelegramOrders(orders), [orders]);

  const filteredOrders = useMemo(() => {
    return telegramOrders.filter((order) => {
      const matchReview =
        reviewFilter === "all" ? true : String(order.review_status || "") === reviewFilter;

      const matchSource =
        sourceFilter === "all" ? true : String(order.source || "") === sourceFilter;

      return matchReview && matchSource;
    });
  }, [telegramOrders, reviewFilter, sourceFilter]);

  const counts = useMemo(() => {
    return {
      total: telegramOrders.length,
      pending: telegramOrders.filter((o) => o.review_status === "pending_review").length,
      confirmed: telegramOrders.filter((o) => o.review_status === "confirmed").length,
      rejected: telegramOrders.filter((o) => o.review_status === "rejected").length,
    };
  }, [telegramOrders]);

  const getSignedUrl = async (orderId: string): Promise<string | null> => {
    if (signedUrls[orderId]) return signedUrls[orderId];
    try {
      setFetchingSignedUrl(orderId);
      setActionError("");
      const response = await api.get(`/reseller/orders/${orderId}/screenshot-url`);
      const url = response.data.signed_url as string;
      setSignedUrls((prev) => ({ ...prev, [orderId]: url }));
      return url;
    } catch (err: any) {
      setActionError(
        err?.response?.data?.error || err?.message || "Payment screenshot is not available."
      );
      return null;
    } finally {
      setFetchingSignedUrl(null);
    }
  };

  const handlePreview = async (orderId: string) => {
    const url = await getSignedUrl(orderId);
    if (url) setPreviewUrl(url);
  };

  const handleOpenOriginal = async (orderId: string) => {
    const url = await getSignedUrl(orderId);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleConfirm = async (orderId: string) => {
    try {
      setBusyOrderId(orderId);
      setActionError("");
      await api.post(`/reseller/order-actions/${orderId}/confirm-payment`);
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.error || err?.message || "Failed to confirm payment");
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleReject = async (orderId: string) => {
    try {
      setBusyOrderId(orderId);
      setActionError("");
      await api.post(`/reseller/order-actions/${orderId}/reject-payment`);
      await refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.error || err?.message || "Failed to reject payment");
    } finally {
      setBusyOrderId(null);
    }
  };

  const renderOrderActions = (order: Order) => {
    const busy = busyOrderId === order.id;
    const canReview =
      order.review_status === "pending_review" &&
      ["active", "pending"].includes(String(order.status || ""));
    const hasScreenshot = Boolean(order.payment_screenshot_url);
    const actions: ActionMenuItem[] = [
      {
        label: fetchingSignedUrl === order.id ? "Loading screenshot..." : "Preview screenshot",
        icon: <ImageIcon size={14} />,
        disabled: !hasScreenshot || fetchingSignedUrl === order.id,
        onSelect: () => void handlePreview(order.id),
      },
      {
        label: "Open original",
        icon: <ExternalLink size={14} />,
        disabled: !hasScreenshot || fetchingSignedUrl === order.id,
        onSelect: () => void handleOpenOriginal(order.id),
      },
      {
        label: busy ? "Confirming..." : "Confirm payment",
        icon: <CheckCircle2 size={14} />,
        disabled: !canReview || busy,
        onSelect: () => void handleConfirm(order.id),
      },
      {
        label: "Reject payment",
        icon: <XCircle size={14} />,
        disabled: !canReview || busy,
        destructive: true,
        onSelect: () => setRejectConfirmOrder(order),
      },
    ];

    return <ActionMenu items={actions} />;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-[18px] font-black tracking-tight text-foreground">
            Telegram Orders
          </h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Review instant-access purchases from Mini App and bot. Confirm valid payments or reject fake ones.
          </p>
        </div>
        <Button
          variant="outline"
          leftIcon={<RefreshCw size={16} className={loading ? "animate-spin" : undefined} />}
          onClick={() => void refresh()}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {/* Loading bar */}
      {loading ? (
        <div className="h-1 w-full overflow-hidden rounded bg-secondary">
          <div className="h-full w-1/3 animate-pulse rounded bg-primary" />
        </div>
      ) : null}

      {/* Alerts */}
      {error ? (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {actionError ? (
        <div className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Card className="p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Total Telegram Orders</div>
          <div className="mt-1 text-lg font-black font-display text-foreground">{counts.total}</div>
        </Card>
        <Card className="p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Pending Review</div>
          <div className="mt-1 text-lg font-black font-display text-[color:var(--warning)]">
            {counts.pending}
          </div>
        </Card>
        <Card className="p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Confirmed</div>
          <div className="mt-1 text-lg font-black font-display text-[color:var(--success)]">
            {counts.confirmed}
          </div>
        </Card>
        <Card className="p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Rejected</div>
          <div className="mt-1 text-lg font-black font-display text-destructive">
            {counts.rejected}
          </div>
        </Card>
      </div>

      {/* Filter bar + orders */}
      <Card className="p-3 space-y-3">
        {/* Filters row */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={reviewFilter}
              onChange={(e) => setReviewFilter(String(e.target.value))}
              className="md:w-[180px]"
            >
              <option value="pending_review">Pending Review</option>
              <option value="confirmed">Confirmed</option>
              <option value="rejected">Rejected</option>
              <option value="all">All Review States</option>
            </Select>
            <Select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(String(e.target.value))}
              className="md:w-[160px]"
            >
              <option value="all">All Sources</option>
              <option value="miniapp">Mini App</option>
              <option value="bot">Bot</option>
            </Select>
          </div>
          <Badge variant="default" className="gap-1 self-start md:self-center">
            <Bot size={14} />
            {filteredOrders.length} result{filteredOrders.length === 1 ? "" : "s"}
          </Badge>
        </div>

        {/* Orders list */}
        {filteredOrders.length === 0 ? (
          <div className="rounded-md border border-border bg-secondary/40 px-4 py-8 text-center text-sm text-muted-foreground">
            No Telegram purchase orders found for the current filter.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Customer</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Review</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => {
                    return (
                      <TableRow key={order.id}>
                        <TableCell>
                          <div className="text-sm font-medium">
                            {order.customer?.full_name || "Unknown customer"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            @{order.customer?.telegram_username || "no_username"}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="text-sm font-medium">
                            {order.plan?.name || "Unknown plan"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatMMK(order.price_mmk || 0)}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge variant="default" className="capitalize">
                            {String(order.source || "dashboard")}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          {order.payment_screenshot_url ? (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                leftIcon={
                                  fetchingSignedUrl === order.id ? undefined : <ImageIcon size={15} />
                                }
                                disabled={fetchingSignedUrl === order.id}
                                onClick={() => void handlePreview(order.id)}
                              >
                                {fetchingSignedUrl === order.id ? "Loading…" : "Preview"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={fetchingSignedUrl === order.id}
                                onClick={() => void handleOpenOriginal(order.id)}
                                title="Open original"
                              >
                                <ExternalLink size={15} />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">No screenshot</span>
                          )}
                          {order.payment_note ? (
                            <div className="mt-1.5 text-xs text-muted-foreground">
                              {order.payment_note}
                            </div>
                          ) : null}
                        </TableCell>

                        <TableCell>
                          <ReviewChip value={order.review_status} />
                        </TableCell>

                        <TableCell>
                          <AccessChip value={order.status} />
                        </TableCell>

                        <TableCell>
                          <span className="text-sm">
                            {formatDate(order.created_at || null)}
                          </span>
                        </TableCell>

                        <TableCell>
                          <div className="flex justify-end">{renderOrderActions(order)}</div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {filteredOrders.map((order) => {
                return (
                  <Card key={order.id} className="p-4 space-y-3">
                    {/* Row 1: name + source */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {order.customer?.full_name || "Unknown customer"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          @{order.customer?.telegram_username || "no_username"}
                        </div>
                      </div>
                      <Badge variant="default" className="capitalize shrink-0">
                        {String(order.source || "dashboard")}
                      </Badge>
                    </div>

                    {/* Row 2: plan + status badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">
                          {order.plan?.name || "Unknown plan"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatMMK(order.price_mmk || 0)}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 items-end shrink-0">
                        <ReviewChip value={order.review_status} />
                        <AccessChip value={order.status} />
                      </div>
                    </div>

                    {/* Row 3: submitted date */}
                    <div className="text-xs text-muted-foreground">
                      Submitted: {formatDate(order.created_at || null)}
                    </div>

                    {/* Payment row */}
                    <div>
                      {order.payment_screenshot_url ? (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={
                              fetchingSignedUrl === order.id ? undefined : <ImageIcon size={15} />
                            }
                            disabled={fetchingSignedUrl === order.id}
                            onClick={() => void handlePreview(order.id)}
                          >
                            {fetchingSignedUrl === order.id ? "Loading…" : "Preview"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={fetchingSignedUrl === order.id}
                            onClick={() => void handleOpenOriginal(order.id)}
                            title="Open original"
                          >
                            <ExternalLink size={15} />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">No screenshot</span>
                      )}
                      {order.payment_note ? (
                        <div className="mt-1.5 text-xs text-muted-foreground">
                          {order.payment_note}
                        </div>
                      ) : null}
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/55 px-2.5 py-2">
                      <span className="text-xs font-semibold text-muted-foreground">Actions</span>
                      {renderOrderActions(order)}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Reject confirm dialog */}
      {rejectConfirmOrder && (
        <Dialog open onClose={() => setRejectConfirmOrder(null)} size="sm">
          <DialogHeader>
            <DialogTitle>Reject Payment?</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              This will permanently delete the VPN key for{" "}
              <span className="font-semibold text-foreground">
                {rejectConfirmOrder.customer?.full_name ?? "this customer"}
              </span>{" "}
              and cut their access immediately. The order will be marked rejected and cannot be
              confirmed afterward.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectConfirmOrder(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busyOrderId === rejectConfirmOrder.id}
              onClick={() => {
                const order = rejectConfirmOrder;
                setRejectConfirmOrder(null);
                void handleReject(order.id);
              }}
            >
              Reject &amp; Remove Access
            </Button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Preview dialog */}
      <Dialog open={Boolean(previewUrl)} onClose={() => setPreviewUrl(null)} size="lg">
        <DialogHeader>
          <DialogTitle>Payment Screenshot</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Payment screenshot"
              className="block w-full rounded-md border border-border"
            />
          ) : null}
        </DialogBody>
        <DialogFooter>
          {previewUrl ? (
            <Button
              variant="outline"
              leftIcon={<ExternalLink size={16} />}
              onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
            >
              Open Original
            </Button>
          ) : null}
          <Button variant="primary" onClick={() => setPreviewUrl(null)}>
            Close
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
