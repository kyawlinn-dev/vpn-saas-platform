import { useMemo, useState } from "react";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import PhotoCameraBackRoundedIcon from "@mui/icons-material/PhotoCameraBackRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import PageContainer from "../components/layout/PageContainer";
import EmptyState from "../components/common/EmptyState";
import { SUPPORT_URL } from "../constants/app";
import { openExternalLink } from "../lib/telegram";
import { submitMiniAppPurchase } from "../features/auth/api";
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

          {order?.payment_screenshot_url ? (
            <Button
              variant="outlined"
              size="small"
              component="a"
              href={order.payment_screenshot_url}
              target="_blank"
              rel="noreferrer"
              sx={{ alignSelf: "flex-start" }}
            >
              Open Submitted Screenshot
            </Button>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function PurchaseDialog({
  open,
  plan,
  submitting,
  screenshotUrl,
  paymentNote,
  onChangeScreenshotUrl,
  onChangePaymentNote,
  onClose,
  onSubmit,
}) {
  const canSubmit = Boolean(plan?.id && screenshotUrl.trim());

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>
        Buy {plan?.name || "Package"}
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info" sx={{ borderRadius: 3 }}>
            For now, paste your payment screenshot image URL here to test the order flow from the Mini App UI.
          </Alert>

          <Card
            sx={{
              background:
                "linear-gradient(180deg, rgba(124,58,237,0.12) 0%, rgba(18,20,36,0.98) 100%)",
            }}
          >
            <CardContent sx={{ p: 2 }}>
              <Stack spacing={0.7}>
                <Typography variant="body2" color="text.secondary">
                  Selected Plan
                </Typography>
                <Typography variant="h6" fontWeight={800}>
                  {plan?.name || "-"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Submit payment screenshot and premium access will be created immediately.
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          <Divider />

          <Stack spacing={1}>
            <Typography variant="subtitle2" fontWeight={800}>
              Payment Screenshot URL
            </Typography>

            <TextField
              fullWidth
              multiline
              minRows={3}
              placeholder="https://your-image-host.com/payment-screenshot.jpg"
              value={screenshotUrl}
              onChange={(e) => onChangeScreenshotUrl(e.target.value)}
              InputProps={{
                startAdornment: (
                  <PhotoCameraBackRoundedIcon
                    sx={{ mr: 1, mt: 0.4, color: "rgba(255,255,255,0.52)" }}
                  />
                ),
              }}
            />

            <Typography variant="caption" color="text.secondary">
              Use any public image URL for testing right now.
            </Typography>
          </Stack>

          <Stack spacing={1}>
            <Typography variant="subtitle2" fontWeight={800}>
              Payment Note
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={2}
              placeholder="Example: Paid with KBZPay at 3:10 PM"
              value={paymentNote}
              onChange={(e) => onChangePaymentNote(e.target.value)}
            />
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          startIcon={<CheckCircleRoundedIcon />}
        >
          {submitting ? "Submitting..." : "Submit & Activate"}
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
  const supportUsername = data?.config?.brand?.support_username
    ? `@${String(data.config.brand.support_username).replace(/^@/, "")}`
    : "";
  const pendingReviewOrder =
    subscription?.type === "purchase" && subscription?.review_status === "pending_review"
      ? subscription
      : null;

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const submitMutation = useMutation({
    mutationFn: () =>
      submitMiniAppPurchase({
        telegram_user_id: data?.user?.telegram_user_id,
        plan_id: selectedPlan?.id,
        payment_screenshot_url: screenshotUrl.trim(),
        payment_note: paymentNote.trim(),
      }),
    onSuccess: async () => {
      onToast("Premium access created. Waiting for reseller review.", "success");
      setDialogOpen(false);
      setSelectedPlan(null);
      setScreenshotUrl("");
      setPaymentNote("");

      if (onRefreshAuth) {
        await onRefreshAuth();
      }

      onTabChange("home");
    },
    onError: (error) => {
      onToast(error?.message || "Failed to submit purchase", "error");
    },
  });

  const visiblePlans = useMemo(() => {
    return (plans || []).filter((plan) => {
      const name = String(plan?.name || "").toLowerCase();
      return !name.includes("trial");
    });
  }, [plans]);

  const openBuyDialog = (plan) => {
    if (!data?.user?.telegram_user_id) {
      onToast("Telegram user is not ready yet", "warning");
      return;
    }

    if (pendingReviewOrder) {
      onToast("You already have a purchase waiting for reseller review", "warning");
      return;
    }

    setSelectedPlan(plan);
    setScreenshotUrl("");
    setPaymentNote("");
    setDialogOpen(true);
  };

  return (
    <PageContainer>
      <SupportCard
        supportUsername={supportUsername}
        onContact={() => openExternalLink(SUPPORT_URL)}
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
        submitting={submitMutation.isPending}
        screenshotUrl={screenshotUrl}
        paymentNote={paymentNote}
        onChangeScreenshotUrl={setScreenshotUrl}
        onChangePaymentNote={setPaymentNote}
        onClose={() => {
          if (!submitMutation.isPending) {
            setDialogOpen(false);
          }
        }}
        onSubmit={() => submitMutation.mutate()}
      />
    </PageContainer>
  );
}
