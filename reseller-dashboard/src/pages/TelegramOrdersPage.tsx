import { useMemo, useState } from "react";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import { api } from "../lib/api";
import { formatDate, formatMMK } from "../lib/format";
import { useScopedDashboard } from "../hooks/useScopedDashboard";
import type { Order } from "../types/api";

function ReviewChip({ value }: { value?: string | null }) {
  const v = String(value || "pending_review");

  const map: Record<string, { label: string; sx: Record<string, unknown> }> = {
    pending_review: {
      label: "Pending Review",
      sx: {
        bgcolor: "rgba(245, 158, 11, 0.14)",
        color: "#f59e0b",
        border: "1px solid rgba(245, 158, 11, 0.3)",
      },
    },
    confirmed: {
      label: "Confirmed",
      sx: {
        bgcolor: "rgba(16, 185, 129, 0.14)",
        color: "#10b981",
        border: "1px solid rgba(16, 185, 129, 0.3)",
      },
    },
    rejected: {
      label: "Rejected",
      sx: {
        bgcolor: "rgba(239, 68, 68, 0.14)",
        color: "#ef4444",
        border: "1px solid rgba(239, 68, 68, 0.3)",
      },
    },
  };

  const item = map[v] || map.pending_review;

  return (
    <Chip
      size="small"
      label={item.label}
      sx={{
        fontWeight: 700,
        borderRadius: "999px",
        ...item.sx,
      }}
    />
  );
}

function AccessChip({ value }: { value?: string | null }) {
  const v = String(value || "pending");

  const map: Record<string, { label: string; sx: Record<string, unknown> }> = {
    active: {
      label: "Active",
      sx: {
        bgcolor: "rgba(16, 185, 129, 0.14)",
        color: "#10b981",
        border: "1px solid rgba(16, 185, 129, 0.3)",
      },
    },
    stopped: {
      label: "Stopped",
      sx: {
        bgcolor: "rgba(107, 114, 128, 0.14)",
        color: "#9ca3af",
        border: "1px solid rgba(107, 114, 128, 0.3)",
      },
    },
    pending: {
      label: "Pending",
      sx: {
        bgcolor: "rgba(59, 130, 246, 0.14)",
        color: "#60a5fa",
        border: "1px solid rgba(59, 130, 246, 0.3)",
      },
    },
  };

  const item = map[v] || map.pending;

  return (
    <Chip
      size="small"
      label={item.label}
      sx={{
        fontWeight: 700,
        borderRadius: "999px",
        ...item.sx,
      }}
    />
  );
}

function getOrderSource(order: Order) {
  return String(order.source || "dashboard");
}

function getTelegramOrders(orders: Order[]) {
  return orders.filter((order) => {
    const source = getOrderSource(order);
    return (source === "miniapp" || source === "bot") && order.order_type === "purchase";
  });
}

export function TelegramOrdersPage() {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
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
      const response = await api.get(`/reseller/orders/${orderId}/screenshot-url`);
      const url = response.data.signed_url as string;
      setSignedUrls((prev) => ({ ...prev, [orderId]: url }));
      return url;
    } catch {
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

  return (
    <Stack spacing={2.5}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", md: "center" }}
      >
        <Box>
          <Typography variant="h5" sx={{ mb: 0.5 }}>
            Telegram Orders
          </Typography>
          <Typography color="text.secondary">
            Review instant-access purchases from Mini App and bot. Confirm valid payments or reject fake ones.
          </Typography>
        </Box>

        <Button
          variant="outlined"
          startIcon={<RefreshRoundedIcon />}
          onClick={() => void refresh()}
          disabled={loading}
        >
          Refresh
        </Button>
      </Stack>

      {loading ? <LinearProgress /> : null}

      {error ? <Alert severity="error">{error}</Alert> : null}
      {actionError ? <Alert severity="error">{actionError}</Alert> : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Total Telegram Orders
              </Typography>
              <Typography variant="h5" sx={{ mt: 1 }}>
                {counts.total}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Pending Review
              </Typography>
              <Typography variant="h5" sx={{ mt: 1, color: "#f59e0b" }}>
                {counts.pending}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Confirmed
              </Typography>
              <Typography variant="h5" sx={{ mt: 1, color: "#10b981" }}>
                {counts.confirmed}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 3 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">
                Rejected
              </Typography>
              <Typography variant="h5" sx={{ mt: 1, color: "#ef4444" }}>
                {counts.rejected}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            justifyContent="space-between"
            alignItems={{ xs: "stretch", md: "center" }}
            sx={{ mb: 2 }}
          >
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
              <Select
                value={reviewFilter}
                onChange={(e) => setReviewFilter(String(e.target.value))}
                size="small"
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="pending_review">Pending Review</MenuItem>
                <MenuItem value="confirmed">Confirmed</MenuItem>
                <MenuItem value="rejected">Rejected</MenuItem>
                <MenuItem value="all">All Review States</MenuItem>
              </Select>

              <Select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(String(e.target.value))}
                size="small"
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="all">All Sources</MenuItem>
                <MenuItem value="miniapp">Mini App</MenuItem>
                <MenuItem value="bot">Bot</MenuItem>
              </Select>
            </Stack>

            <Chip
              icon={<SmartToyRoundedIcon />}
              label={`${filteredOrders.length} result${filteredOrders.length === 1 ? "" : "s"}`}
              sx={{
                alignSelf: { xs: "flex-start", md: "center" },
                bgcolor: dark ? alpha("#fff", 0.05) : alpha("#000", 0.04),
              }}
            />
          </Stack>

          {filteredOrders.length === 0 ? (
            <Alert severity="info">
              No Telegram purchase orders found for the current filter.
            </Alert>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Customer</TableCell>
                    <TableCell>Plan</TableCell>
                    <TableCell>Source</TableCell>
                    <TableCell>Payment</TableCell>
                    <TableCell>Review</TableCell>
                    <TableCell>Access</TableCell>
                    <TableCell>Submitted</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {filteredOrders.map((order) => {
                    const busy = busyOrderId === order.id;
                    const canReview = order.review_status === "pending_review";

                    return (
                      <TableRow key={order.id} hover>
                        <TableCell>
                          <Stack spacing={0.35}>
                            <Typography fontWeight={700}>
                              {order.customer?.full_name || "Unknown customer"}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              @{order.customer?.telegram_username || "no_username"}
                            </Typography>
                          </Stack>
                        </TableCell>

                        <TableCell>
                          <Stack spacing={0.35}>
                            <Typography fontWeight={700}>
                              {order.plan?.name || "Unknown plan"}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {formatMMK(order.price_mmk || 0)}
                            </Typography>
                          </Stack>
                        </TableCell>

                        <TableCell>
                          <Chip
                            size="small"
                            label={String(order.source || "dashboard")}
                            sx={{
                              textTransform: "capitalize",
                              bgcolor: dark ? alpha("#fff", 0.05) : alpha("#000", 0.04),
                            }}
                          />
                        </TableCell>

                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            {order.payment_screenshot_url ? (
                              <>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={fetchingSignedUrl === order.id ? undefined : <ImageRoundedIcon />}
                                  disabled={fetchingSignedUrl === order.id}
                                  onClick={() => void handlePreview(order.id)}
                                >
                                  {fetchingSignedUrl === order.id ? "Loading…" : "Preview"}
                                </Button>
                                <IconButton
                                  size="small"
                                  disabled={fetchingSignedUrl === order.id}
                                  onClick={() => void handleOpenOriginal(order.id)}
                                >
                                  <OpenInNewRoundedIcon fontSize="small" />
                                </IconButton>
                              </>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                No screenshot
                              </Typography>
                            )}
                          </Stack>

                          {order.payment_note ? (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block", mt: 0.75 }}
                            >
                              {order.payment_note}
                            </Typography>
                          ) : null}
                        </TableCell>

                        <TableCell>
                          <ReviewChip value={order.review_status} />
                        </TableCell>

                        <TableCell>
                          <AccessChip value={order.status} />
                        </TableCell>

                        <TableCell>
                          <Typography variant="body2">
                            {formatDate(order.created_at || null)}
                          </Typography>
                        </TableCell>

                        <TableCell align="right">
                          <Stack
                            direction={{ xs: "column", lg: "row" }}
                            spacing={1}
                            justifyContent="flex-end"
                          >
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              startIcon={<CheckCircleRoundedIcon />}
                              disabled={!canReview || busy}
                              onClick={() => void handleConfirm(order.id)}
                            >
                              Confirm
                            </Button>

                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              startIcon={<CancelRoundedIcon />}
                              disabled={!canReview || busy}
                              onClick={() => setRejectConfirmOrder(order)}
                            >
                              Reject
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {rejectConfirmOrder && (
        <Dialog open onClose={() => setRejectConfirmOrder(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Reject Payment?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              This will permanently delete the VPN key for{" "}
              <strong>{rejectConfirmOrder.customer?.full_name ?? "this customer"}</strong> and cut
              their access immediately. The order will be marked rejected and cannot be confirmed
              afterward.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRejectConfirmOrder(null)}>Cancel</Button>
            <Button
              variant="contained"
              color="error"
              disabled={busyOrderId === rejectConfirmOrder.id}
              onClick={() => {
                const order = rejectConfirmOrder;
                setRejectConfirmOrder(null);
                void handleReject(order.id);
              }}
            >
              Reject &amp; Remove Access
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <Dialog open={Boolean(previewUrl)} onClose={() => setPreviewUrl(null)} maxWidth="md" fullWidth>
        <DialogTitle>Payment Screenshot</DialogTitle>
        <DialogContent dividers>
          {previewUrl ? (
            <Box
              component="img"
              src={previewUrl}
              alt="Payment screenshot"
              sx={{
                width: "100%",
                display: "block",
                borderRadius: 2,
                border: `1px solid ${alpha("#000", 0.12)}`,
              }}
            />
          ) : null}
        </DialogContent>
        <DialogActions>
          {previewUrl ? (
            <Button
              component="a"
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              startIcon={<OpenInNewRoundedIcon />}
            >
              Open Original
            </Button>
          ) : null}
          <Button onClick={() => setPreviewUrl(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}