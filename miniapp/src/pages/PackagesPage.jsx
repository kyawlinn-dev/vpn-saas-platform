import { useMemo, useRef, useState } from "react";
import CameraAltRoundedIcon from "@mui/icons-material/CameraAltRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import PaymentsRoundedIcon from "@mui/icons-material/PaymentsRounded";
import {
  Alert,
  Box,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import PageContainer from "../components/layout/PageContainer";
import EmptyState from "../components/common/EmptyState";
import { AuroraButton, GhostButton, GlassCard, SectionTitle } from "../components/ui/vpnPrimitives";
import { openTelegramNativeLink } from "../lib/telegram";
import { useSubmitPurchase } from "../features/access/hooks";
import { uploadPaymentScreenshot } from "../features/access/api";
import PackageCard from "../features/packages/PackageCard";
import SupportCard from "../features/support/SupportCard";
import { formatCurrencyMmk } from "../lib/format";

function PendingReviewCard() {
  return (
    <GlassCard sx={{ borderColor: "rgba(245,158,11,0.28)" }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack direction="row" spacing={1.1} alignItems="flex-start">
          <HourglassTopRoundedIcon sx={{ color: "#fbbf24", mt: 0.1 }} />
          <Box>
            <Typography fontWeight={950} sx={{ fontSize: 15.5 }}>
              Purchase waiting for review
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: 12.8, mt: 0.35, lineHeight: 1.5 }}>
              Premium access is active. Your reseller will review the payment screenshot.
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </GlassCard>
  );
}

function PaymentInfoCard({ methods, onCopy }) {
  if (!Array.isArray(methods) || methods.length === 0) return null;

  return (
    <Stack spacing={1}>
      {methods.map((method, i) => (
        <GlassCard
          key={i}
          sx={{
            background:
              "linear-gradient(180deg, rgba(37,99,235,0.12) 0%, rgba(8,13,28,0.9) 100%)",
          }}
        >
          <CardContent sx={{ p: 1.45 }}>
            <Stack spacing={1}>
              <Stack direction="row" spacing={0.8} alignItems="center">
                <PaymentsRoundedIcon sx={{ color: "#93c5fd", fontSize: 18 }} />
                <Typography sx={{ fontSize: 12, color: "text.secondary", fontWeight: 900, textTransform: "uppercase" }}>
                  Pay with {method.method}
                </Typography>
              </Stack>

              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                <Box minWidth={0}>
                  <Typography color="text.secondary" sx={{ fontSize: 11.5 }}>
                    Account name
                  </Typography>
                  <Typography fontWeight={900} noWrap sx={{ fontSize: 14 }}>
                    {method.account_name}
                  </Typography>
                  <Typography color="text.secondary" sx={{ fontSize: 11.5, mt: 0.75 }}>
                    Account number
                  </Typography>
                  <Typography fontWeight={950} sx={{ fontSize: 16, letterSpacing: "0.03em" }}>
                    {method.account_number}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={() => onCopy(method.account_number)}
                  sx={{
                    width: 38,
                    height: 38,
                    color: "#bfdbfe",
                    bgcolor: "rgba(148,163,184,0.12)",
                    border: "1px solid rgba(148,163,184,0.16)",
                  }}
                  aria-label="Copy account number"
                >
                  <ContentCopyRoundedIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
          </CardContent>
        </GlassCard>
      ))}
    </Stack>
  );
}

function ScreenshotUpload({ previewSrc, isUploading, error, onSelect }) {
  const inputRef = useRef(null);

  const handleClick = () => inputRef.current?.click();

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onSelect(file);
  };

  return (
    <Box>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={handleChange}
      />

      {isUploading ? (
        <Stack
          alignItems="center"
          justifyContent="center"
          sx={{
            border: "1.5px dashed rgba(147,197,253,0.28)",
            borderRadius: 4,
            py: 3,
            gap: 1,
            bgcolor: "rgba(37,99,235,0.06)",
          }}
        >
          <CircularProgress size={26} />
          <Typography color="text.secondary" sx={{ fontSize: 13 }}>
            Uploading...
          </Typography>
        </Stack>
      ) : previewSrc ? (
        <Stack spacing={1}>
          <Box
            component="img"
            src={previewSrc}
            alt="Payment screenshot preview"
            sx={{
              width: "100%",
              maxHeight: 220,
              objectFit: "contain",
              borderRadius: 4,
              border: "1px solid rgba(148,163,184,0.16)",
              bgcolor: "rgba(0,0,0,0.32)",
            }}
          />
          <GhostButton onClick={handleClick} sx={{ width: "auto", height: 38, minHeight: 38, px: 1.4 }}>
            Change screenshot
          </GhostButton>
        </Stack>
      ) : (
        <Stack
          role="button"
          tabIndex={0}
          onClick={handleClick}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
          alignItems="center"
          justifyContent="center"
          sx={{
            border: "1.5px dashed rgba(147,197,253,0.28)",
            borderRadius: 4,
            py: 3,
            gap: 0.7,
            cursor: "pointer",
            bgcolor: "rgba(37,99,235,0.06)",
            "&:hover": { borderColor: "rgba(34,211,238,0.52)", bgcolor: "rgba(6,182,212,0.08)" },
          }}
        >
          <CameraAltRoundedIcon sx={{ color: "#93c5fd", fontSize: 30 }} />
          <Typography sx={{ fontSize: 13.5, fontWeight: 850 }}>
            Upload payment screenshot
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: 11.5 }}>
            JPEG, PNG, WebP · max 5 MB
          </Typography>
        </Stack>
      )}

      {error ? (
        <Alert severity="error" sx={{ mt: 1, borderRadius: 3, fontSize: 12.5 }}>
          {error}
        </Alert>
      ) : null}
    </Box>
  );
}

function PurchaseDialog({
  open,
  plan,
  paymentMethods,
  telegramUserId,
  submitting,
  onClose,
  onSubmit,
  onToast,
}) {
  const [uploadedPath, setUploadedPath] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [paymentNote, setPaymentNote] = useState("");

  const resetUploadState = () => {
    setUploadedPath(null);
    setPreviewSrc(null);
    setIsUploading(false);
    setUploadError(null);
  };

  const handleClose = () => {
    if (submitting || isUploading) return;
    resetUploadState();
    setPaymentNote("");
    onClose();
  };

  const handleFileSelect = async (file) => {
    resetUploadState();
    setIsUploading(true);
    setPreviewSrc(URL.createObjectURL(file));

    try {
      const result = await uploadPaymentScreenshot({
        file,
        telegramUserId,
      });
      setUploadedPath(result.path);
    } catch (err) {
      setUploadError(err.message || "Upload failed. Please try again.");
      setPreviewSrc(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCopyAccountNumber = async (number) => {
    try {
      await navigator.clipboard.writeText(number);
      onToast("Account number copied", "success");
    } catch {
      onToast("Could not copy. Please copy manually", "warning");
    }
  };

  const canSubmit = Boolean(uploadedPath) && !isUploading && !submitting;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 950, fontSize: 18, pb: 0.5 }}>
        Checkout
      </DialogTitle>

      <DialogContent dividers sx={{ borderColor: "rgba(148,163,184,0.14)", px: 2 }}>
        <Stack spacing={1.5}>
          <GlassCard
            glow
            sx={{
              background:
                "radial-gradient(circle at 100% 0%, rgba(34,211,238,0.15), transparent 34%), linear-gradient(180deg, rgba(15,23,42,0.9), rgba(8,13,28,0.9))",
            }}
          >
            <CardContent sx={{ p: 1.6 }}>
              <Stack direction="row" justifyContent="space-between" gap={1.4}>
                <Box minWidth={0}>
                  <Typography color="text.secondary" sx={{ fontSize: 11.5, fontWeight: 800 }}>
                    Selected plan
                  </Typography>
                  <Typography fontWeight={950} noWrap sx={{ fontSize: 17, mt: 0.25 }}>
                    {plan?.name || "Package"}
                  </Typography>
                  <Typography color="text.secondary" sx={{ fontSize: 12.5, mt: 0.4 }}>
                    {plan?.data_limit_gb ? `${plan.data_limit_gb} GB` : "Unlimited"} · {plan?.duration_days || "-"} days
                  </Typography>
                </Box>
                <Typography fontWeight={950} sx={{ color: "#facc15", fontSize: 17, whiteSpace: "nowrap" }}>
                  {formatCurrencyMmk(plan?.price_mmk)}
                </Typography>
              </Stack>
            </CardContent>
          </GlassCard>

          <PaymentInfoCard methods={paymentMethods} onCopy={handleCopyAccountNumber} />

          <Divider />

          <Stack spacing={0.8}>
            <Typography fontWeight={900} sx={{ fontSize: 13.5 }}>
              Payment screenshot <Box component="span" sx={{ color: "#f87171" }}>*</Box>
            </Typography>
            <ScreenshotUpload
              previewSrc={previewSrc}
              isUploading={isUploading}
              error={uploadError}
              onSelect={handleFileSelect}
            />
          </Stack>

          <Stack spacing={0.8}>
            <Typography fontWeight={900} sx={{ fontSize: 13.5 }}>
              Payment note <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>(optional)</Box>
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={2}
              placeholder="Example: Paid with KBZPay at 3:10 PM"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 3,
                  bgcolor: "rgba(148,163,184,0.08)",
                  fontSize: 13.5,
                },
              }}
            />
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <GhostButton onClick={handleClose} disabled={submitting || isUploading}>
          Cancel
        </GhostButton>
        <AuroraButton
          onClick={() => onSubmit({ uploadedPath, paymentNote: paymentNote.trim() || undefined })}
          disabled={!canSubmit}
          startIcon={<CheckCircleRoundedIcon />}
        >
          {submitting ? "Submitting..." : "Submit Payment"}
        </AuroraButton>
      </DialogActions>
    </Dialog>
  );
}

export default function PackagesPage({
  data,
  onToast,
  onTabChange,
  onRefreshAuth,
}) {
  const plans = useMemo(() => data?.plans || [], [data?.plans]);
  const subscription = data?.subscription || null;
  const paymentMethods = data?.config?.payment || [];
  const rawSupportHandle = data?.config?.brand?.support_username
    ? String(data.config.brand.support_username).replace(/^@/, "")
    : null;
  const supportUsername = rawSupportHandle ? `@${rawSupportHandle}` : "";
  const handleSupportContact = rawSupportHandle
    ? () => openTelegramNativeLink(`https://t.me/${rawSupportHandle}`)
    : null;
  const pendingReviewOrder =
    subscription?.type === "purchase" && subscription?.review_status === "pending_review"
      ? subscription
      : null;

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const submitMutation = useSubmitPurchase({
    onSuccess: async () => {
      onToast("Premium access created. Waiting for reseller review.", "success");
      setDialogOpen(false);
      setSelectedPlan(null);
      if (onRefreshAuth) await onRefreshAuth();
      onTabChange("home");
    },
    onError: (error) => {
      onToast(error?.message || "Failed to submit purchase", "error");
    },
  });

  const visiblePlans = useMemo(
    () => (plans || []).filter((plan) => !String(plan?.name || "").toLowerCase().includes("trial")),
    [plans]
  );

  const groupedPlans = useMemo(() => {
    const sorted = [...visiblePlans].sort((a, b) => {
      const orderDiff = (a.sort_order ?? 999) - (b.sort_order ?? 999);
      if (orderDiff !== 0) return orderDiff;
      return (a.price_mmk ?? 0) - (b.price_mmk ?? 0);
    });
    const map = new Map();
    for (const plan of sorted) {
      const days = plan.duration_days ?? 30;
      if (!map.has(days)) map.set(days, []);
      map.get(days).push(plan);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [visiblePlans]);

  const isActivePlan = (plan) => {
    if (!subscription || subscription?.type !== "purchase") return false;
    return (
      plan?.id === subscription?.plan_id ||
      (plan?.name && subscription?.plan_name && String(plan.name) === String(subscription.plan_name))
    );
  };

  const openBuyDialog = (plan) => {
    if (!data?.user?.telegram_user_id) {
      onToast("Telegram user is not ready yet", "warning");
      return;
    }
    if (subscription?.type === "purchase") {
      onToast("You already have an active package", "warning");
      return;
    }
    setSelectedPlan(plan);
    setDialogOpen(true);
  };

  const handleSubmit = ({ uploadedPath, paymentNote }) => {
    submitMutation.mutate({
      telegram_user_id: data?.user?.telegram_user_id,
      plan_id: selectedPlan?.id,
      payment_screenshot_url: uploadedPath,
      payment_note: paymentNote,
    });
  };

  return (
    <PageContainer>
      <SectionTitle title="Choose Your Plan" subtitle="Secure private access with this reseller" />

      <SupportCard
        supportUsername={supportUsername}
        onContact={handleSupportContact}
      />

      {pendingReviewOrder ? <PendingReviewCard order={pendingReviewOrder} /> : null}

      {visiblePlans.length > 0 ? (
        groupedPlans.map(([days, groupPlans]) => (
          <Stack key={days} spacing={1}>
            <Typography fontWeight={950} sx={{ color: "#fff", px: 0.2, fontSize: 15.5 }}>
              {days} Days
            </Typography>
            {groupPlans.map((plan) => (
              <PackageCard
                key={plan.id}
                plan={plan}
                onBuy={openBuyDialog}
                active={isActivePlan(plan)}
              />
            ))}
          </Stack>
        ))
      ) : (
        <EmptyState
          title="No packages available"
          description="Please check back later or contact support for manual activation."
        />
      )}

      <PurchaseDialog
        open={dialogOpen}
        plan={selectedPlan}
        paymentMethods={paymentMethods}
        telegramUserId={data?.user?.telegram_user_id}
        submitting={submitMutation.isPending}
        onClose={() => { if (!submitMutation.isPending) setDialogOpen(false); }}
        onSubmit={handleSubmit}
        onToast={onToast}
      />
    </PageContainer>
  );
}
