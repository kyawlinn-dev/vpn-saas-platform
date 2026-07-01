import { useMemo, useRef, useState } from "react";
import CameraAltRoundedIcon from "@mui/icons-material/CameraAltRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import {
  Alert,
  Box,
  Button,
  Card,
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
import { openTelegramNativeLink } from "../lib/telegram";
import { useSubmitPurchase } from "../features/access/hooks";
import { uploadPaymentScreenshot } from "../features/access/api";
import PackageCard from "../features/packages/PackageCard";
import SupportCard from "../features/support/SupportCard";

function PendingReviewCard({ order }) {
  return (
    <Card
      sx={{
        border: "1px solid rgba(245,158,11,0.22)",
        background:
          "linear-gradient(180deg, rgba(245,158,11,0.12) 0%, rgba(18,20,36,0.98) 100%)",
      }}
    >
      <CardContent sx={{ p: 2.2 }}>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} alignItems="center">
            <HourglassTopRoundedIcon sx={{ color: "#fbbf24" }} />
            <Typography variant="h6" fontWeight={800}>
              Purchase Waiting for Review
            </Typography>
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Your premium access is already active. The reseller will review your payment screenshot later.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function PaymentInfoCard({ methods, onCopy }) {
  if (!Array.isArray(methods) || methods.length === 0) return null;

  return (
    <Stack spacing={1.25}>
      {methods.map((method, i) => (
        <Card
          key={i}
          sx={{
            background:
              "linear-gradient(180deg, rgba(99,102,241,0.1) 0%, rgba(18,20,36,0.98) 100%)",
            border: "1px solid rgba(99,102,241,0.2)",
          }}
        >
          <CardContent sx={{ p: 2 }}>
            <Stack spacing={1.1}>
              <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Pay with {method.method}
              </Typography>

              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="caption" color="text.secondary">Account Name</Typography>
                  <Typography fontWeight={800}>{method.account_name}</Typography>
                </Box>
              </Stack>

              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="caption" color="text.secondary">Account Number</Typography>
                  <Typography fontWeight={800} sx={{ fontSize: "1.05rem", letterSpacing: "0.04em" }}>
                    {method.account_number}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={() => onCopy(method.account_number)}
                  sx={{ color: "#6366f1" }}
                  aria-label="Copy account number"
                >
                  <ContentCopyRoundedIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

function ScreenshotUpload({ previewSrc, isUploading, error, onSelect }) {
  const inputRef = useRef(null);

  const handleClick = () => inputRef.current?.click();

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected after a change
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
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            border: "2px dashed rgba(255,255,255,0.18)",
            borderRadius: 2,
            py: 3.5,
            gap: 1.25,
          }}
        >
          <CircularProgress size={28} />
          <Typography variant="body2" color="text.secondary">
            Uploading…
          </Typography>
        </Box>
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
              borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.1)",
              bgcolor: "rgba(0,0,0,0.3)",
            }}
          />
          <Button size="small" onClick={handleClick} sx={{ alignSelf: "flex-start", color: "#6366f1" }}>
            Change screenshot
          </Button>
        </Stack>
      ) : (
        <Box
          role="button"
          tabIndex={0}
          onClick={handleClick}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            border: "2px dashed rgba(255,255,255,0.18)",
            borderRadius: 2,
            py: 3.5,
            gap: 1,
            cursor: "pointer",
            "&:hover": { borderColor: "rgba(99,102,241,0.5)", bgcolor: "rgba(99,102,241,0.04)" },
          }}
        >
          <CameraAltRoundedIcon sx={{ color: "text.secondary", fontSize: 32 }} />
          <Typography variant="body2" color="text.secondary">
            Tap to upload payment screenshot
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.6 }}>
            JPEG · PNG · WebP · max 5 MB
          </Typography>
        </Box>
      )}

      {error ? (
        <Alert severity="error" sx={{ mt: 1, borderRadius: 2 }}>
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
      onToast("Could not copy — please copy manually", "warning");
    }
  };

  const canSubmit = Boolean(uploadedPath) && !isUploading && !submitting;

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>
        Buy {plan?.name || "Package"}
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          {/* Plan summary */}
          <Card sx={{ background: "linear-gradient(180deg, rgba(124,58,237,0.12) 0%, rgba(18,20,36,0.98) 100%)" }}>
            <CardContent sx={{ p: 2 }}>
              <Stack spacing={0.7}>
                <Typography variant="body2" color="text.secondary">Selected Plan</Typography>
                <Typography variant="h6" fontWeight={800}>{plan?.name || "-"}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Submit payment screenshot and premium access will be created immediately.
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          {/* Payment info */}
          <PaymentInfoCard methods={paymentMethods} onCopy={handleCopyAccountNumber} />

          <Divider />

          {/* Screenshot upload */}
          <Stack spacing={1}>
            <Typography variant="subtitle2" fontWeight={800}>
              Payment Screenshot <Box component="span" sx={{ color: "#ef4444" }}>*</Box>
            </Typography>
            <ScreenshotUpload
              previewSrc={previewSrc}
              isUploading={isUploading}
              error={uploadError}
              onSelect={handleFileSelect}
            />
          </Stack>

          {/* Optional note */}
          <Stack spacing={1}>
            <Typography variant="subtitle2" fontWeight={800}>
              Payment Note <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>(optional)</Box>
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={2}
              placeholder="Example: Paid with KBZPay at 3:10 PM"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
            />
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={handleClose} disabled={submitting || isUploading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => onSubmit({ uploadedPath, paymentNote: paymentNote.trim() || undefined })}
          disabled={!canSubmit}
          startIcon={<CheckCircleRoundedIcon />}
        >
          {submitting ? "Submitting…" : "Submit & Activate"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function PackagesPage({
  data,
  initData,
  onToast,
  onTabChange,
  onRefreshAuth,
}) {
  const plans = data?.plans || [];
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
      <SupportCard
        supportUsername={supportUsername}
        onContact={handleSupportContact}
      />

      {pendingReviewOrder ? <PendingReviewCard order={pendingReviewOrder} /> : null}

      <Typography variant="h6" fontWeight={950} sx={{ color: "#fff", px: 0.4 }}>
        30 Days packages:
      </Typography>

      {visiblePlans.length > 0 ? (
        visiblePlans.map((plan) => (
          <Box key={plan.id}>
            <PackageCard plan={plan} onBuy={openBuyDialog} />
          </Box>
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
