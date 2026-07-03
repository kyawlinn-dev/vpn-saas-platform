import { useMemo, useRef, useState } from "react";

// ── MUI imports — used ONLY by PurchaseDialog and its helpers.
//    Phase 6 (checkout full screen) removes this entire block.
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
import {
  AuroraButton,
  GhostButton,
  GlassCard as MuiGlassCard,
} from "../components/ui/vpnPrimitives";
// ── end Phase 6 removal block ──────────────────────────────────────────────

// Tailwind / new design-system imports (listing layer)
import { Hourglass, Package } from "lucide-react";
import {
  BrandBar,
  Chip,
  GlassCard,
  PrimaryButton,
  SecondaryButton,
} from "../components/ui/primitives";

import { openTelegramNativeLink } from "../lib/telegram";
import { formatCurrencyMmk, formatDate } from "../lib/format";
import { useSubmitPurchase } from "../features/access/hooks";
import { uploadPaymentScreenshot } from "../features/access/api";
import PackageCard from "../features/packages/PackageCard";
import SupportCard from "../features/support/SupportCard";

// ── PurchaseDialog (MUI — kept unchanged until Phase 6) ────────────────────
// Sub-components: PaymentInfoCard, ScreenshotUpload are only used here.

function PaymentInfoCard({ methods, onCopy }) {
  if (!Array.isArray(methods) || methods.length === 0) return null;

  return (
    <Stack spacing={1}>
      {methods.map((method, i) => (
        <MuiGlassCard
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
        </MuiGlassCard>
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
      const result = await uploadPaymentScreenshot({ file, telegramUserId });
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
          <MuiGlassCard
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
          </MuiGlassCard>

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
              Payment note{" "}
              <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>
                (optional)
              </Box>
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
// ── end PurchaseDialog ─────────────────────────────────────────────────────

// ── Tailwind sub-components (listing layer) ────────────────────────────────

function PendingReviewCard() {
  return (
    <GlassCard className="border-warning/30 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
          <Hourglass size={16} />
        </div>
        <div>
          <p className="text-[15px] font-semibold text-foreground">
            Purchase waiting for review
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Premium access is active. Your reseller will review the payment screenshot.
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

function EmptyStateCard({ icon, title, description, children }) {
  return (
    <GlassCard className="p-5">
      <div className="flex flex-col gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/20 to-violet/15 text-primary">
          {icon}
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-[18px] font-semibold leading-tight text-foreground">{title}</p>
          {description && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
        {children && <div className="flex flex-col gap-2">{children}</div>}
      </div>
    </GlassCard>
  );
}

// Compact current-plan summary shown at the top when user has a confirmed purchase.
function CurrentPlanCard({ subscription }) {
  const planName = subscription?.plan_name || "Premium Plan";
  const expiry = subscription?.expiry_date ? formatDate(subscription.expiry_date) : null;

  return (
    <GlassCard className="flex items-center justify-between p-3.5">
      <div>
        <p className="text-[14px] font-semibold text-foreground">{planName}</p>
        {expiry && (
          <p className="text-[12px] text-muted-foreground">Valid until {expiry}</p>
        )}
      </div>
      <Chip tone="success" icon={<span className="h-1.5 w-1.5 rounded-full bg-success" />}>
        Active
      </Chip>
    </GlassCard>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PackagesPage({ data, onToast, onTabChange, onRefreshAuth }) {
  // ── Data (logic unchanged) ─────────────────────────────────────────────────
  const plans = useMemo(() => data?.plans || [], [data?.plans]);
  const subscription = data?.subscription || null;
  const paymentMethods = data?.config?.payment || [];
  const brand = data?.config?.brand || null;

  const rawSupportHandle = brand?.support_username
    ? String(brand.support_username).replace(/^@/, "")
    : null;
  const supportUsername = rawSupportHandle ? `@${rawSupportHandle}` : "";
  const handleSupportContact = rawSupportHandle
    ? () => openTelegramNativeLink(`https://t.me/${rawSupportHandle}`)
    : null;

  const pendingReviewOrder =
    subscription?.type === "purchase" && subscription?.review_status === "pending_review"
      ? subscription
      : null;

  // Show compact current-plan banner for confirmed active purchases.
  const confirmedActivePurchase =
    subscription?.type === "purchase" && subscription?.review_status !== "pending_review"
      ? subscription
      : null;

  // ── Dialog state ───────────────────────────────────────────────────────────
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // ── Mutation (payload UNCHANGED) ───────────────────────────────────────────
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

  // ── Plan grouping (logic unchanged) ───────────────────────────────────────
  const visiblePlans = useMemo(
    () => (plans || []).filter((plan) => !String(plan?.name || "").toLowerCase().includes("trial")),
    [plans],
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

  // ── Handlers (logic unchanged) ─────────────────────────────────────────────
  const isActivePlan = (plan) => {
    if (!subscription || subscription?.type !== "purchase") return false;
    return (
      plan?.id === subscription?.plan_id ||
      (plan?.name &&
        subscription?.plan_name &&
        String(plan.name) === String(subscription.plan_name))
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex flex-col gap-4 px-4 pt-2 pb-6">
        <BrandBar brandName={brand?.name || "VPN"} subtitle="Secure private access" />

        <div>
          <h2 className="text-[18px] font-semibold text-foreground">Choose Your Plan</h2>
          <p className="text-[13px] text-muted-foreground">
            Secure private access with this reseller
          </p>
        </div>

        <SupportCard supportUsername={supportUsername} onContact={handleSupportContact} />

        {/* Confirmed active purchase — compact banner */}
        {confirmedActivePurchase && (
          <CurrentPlanCard subscription={confirmedActivePurchase} />
        )}

        {/* Pending review warning */}
        {pendingReviewOrder && <PendingReviewCard />}

        {/* Plan listing grouped by duration */}
        {visiblePlans.length > 0 ? (
          groupedPlans.map(([days, groupPlans]) => (
            <div key={days} className="flex flex-col gap-3">
              <p className="px-0.5 text-[15px] font-bold text-foreground">{days} Days</p>
              {groupPlans.map((plan) => (
                <PackageCard
                  key={plan.id}
                  plan={plan}
                  onBuy={openBuyDialog}
                  active={isActivePlan(plan)}
                />
              ))}
            </div>
          ))
        ) : (
          <EmptyStateCard
            icon={<Package size={20} />}
            title="No packages available"
            description="Please check back later or contact support for manual activation."
          />
        )}
      </div>

      {/* MUI PurchaseDialog — unchanged until Phase 6 converts checkout to full screen */}
      <PurchaseDialog
        open={dialogOpen}
        plan={selectedPlan}
        paymentMethods={paymentMethods}
        telegramUserId={data?.user?.telegram_user_id}
        submitting={submitMutation.isPending}
        onClose={() => {
          if (!submitMutation.isPending) setDialogOpen(false);
        }}
        onSubmit={handleSubmit}
        onToast={onToast}
      />
    </>
  );
}
