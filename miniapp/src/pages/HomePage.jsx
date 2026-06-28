import IosShareRoundedIcon from "@mui/icons-material/IosShareRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import { Box, Card, CardContent, LinearProgress, Stack, Typography } from "@mui/material";
import EmptyState from "../components/common/EmptyState";
import SecondaryButton from "../components/common/SecondaryButton";
import PageContainer from "../components/layout/PageContainer";
import AddKeyButton from "../features/servers/AddKeyButton";
import ServerHero from "../features/servers/ServerHero";
import { SUPPORT_URL } from "../constants/app";
import { formatDate } from "../lib/format";
import { getShareUrl } from "../lib/links";
import {
  openExternalLink,
  openTelegramSharePicker,
  isTelegramWebBrowser,
} from "../lib/telegram";

function formatGb(value) {
  const number = Number(value || 0);
  if (!number) return "0 GB";
  return `${Number.isInteger(number) ? number : number.toFixed(1)} GB`;
}

function getPlanTitle(subscription) {
  const type = String(subscription?.type || "");
  if (type === "trial" || String(subscription?.plan_name || "").toLowerCase().includes("trial")) {
    return "Trial";
  }
  return "Premium";
}

function UsageCard({ subscription, outlineKey }) {
  const usedGb = Number(outlineKey?.used_bytes || 0) / 1024 / 1024 / 1024;
  const limitGb = Number(subscription?.data_limit_gb || 0);
  const progress = limitGb > 0 ? Math.min(100, (usedGb / limitGb) * 100) : 0;

  return (
    <Card>
      <CardContent sx={{ p: 2.2 }}>
        <Stack spacing={1.6}>
          <Typography variant="h6" fontWeight={900}>
            {getPlanTitle(subscription)}
          </Typography>

          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              {formatGb(usedGb)} used
            </Typography>
            <Typography variant="body2" color="text.secondary">
              of {limitGb ? `${limitGb} GB` : "Unlimited"}
            </Typography>
          </Stack>

          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 10,
              borderRadius: 999,
              bgcolor: "rgba(255,255,255,0.08)",
              "& .MuiLinearProgress-bar": {
                borderRadius: 999,
                background: "linear-gradient(90deg, #2563eb, #38bdf8)",
              },
            }}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}

function ActivePackageCard({ subscription }) {
  const planLabel = subscription?.plan_name || "Active Package";
  const duration = subscription?.expiry_date ? `Valid until ${formatDate(subscription.expiry_date)}` : "Valid package";
  const dataLimit = subscription?.data_limit_gb ? `${subscription.data_limit_gb} GB` : "Unlimited";

  return (
    <Card>
      <CardContent sx={{ p: 2.2 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box
              sx={{
                px: 1.25,
                py: 0.6,
                borderRadius: 999,
                bgcolor: "rgba(34,197,94,0.14)",
                color: "#22c55e",
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              Active Packages
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.1} alignItems="flex-start">
            <VerifiedRoundedIcon sx={{ color: "#22c55e", mt: 0.2 }} />
            <Box>
              <Typography variant="h6" fontWeight={900}>
                {planLabel}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {duration}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.65 }}>
                {dataLimit} premium servers, private high-speed access, no-log policy.
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function HomePage({ data, hasActivePackage, hasLinkedKey, onToast, onTabChange }) {
  const subscription = data?.subscription || null;
  const currentServer = data?.current_server || null;
  const outlineKey = data?.outline_key || null;
  const keyForActions = outlineKey || currentServer;
  const hasImportLink = Boolean(keyForActions?.dynamic_access_url);

  const handleShare = async () => {
    const shareUrl = getShareUrl(keyForActions);

    if (!shareUrl) {
      onToast("Please choose server first.", "warning");
      return;
    }

    try {
      openTelegramSharePicker(shareUrl);
      return;
    } catch {
      // fallback
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      onToast("Key copied", "success");
      return;
    } catch {
      if (!isTelegramWebBrowser()) {
        onToast("Unable to open Telegram share. Key copy failed too.", "error");
      } else {
        onToast("Unable to share key", "error");
      }
    }
  };

  if (hasActivePackage) {
    return (
      <PageContainer>
        {currentServer ? <ServerHero server={currentServer} /> : null}
        <UsageCard subscription={subscription} outlineKey={outlineKey} />
        <ActivePackageCard subscription={subscription} />

        {hasLinkedKey && currentServer ? (
          <Stack spacing={1.2}>
            <AddKeyButton
              outlineKey={keyForActions}
              disabled={!hasImportLink}
              onError={(message) => onToast(message, "warning")}
            />
            <SecondaryButton
              startIcon={<IosShareRoundedIcon />}
              onClick={handleShare}
              disabled={!hasImportLink}
            >
              Share Key
            </SecondaryButton>
          </Stack>
        ) : (
          <EmptyState
            icon={<StorageRoundedIcon />}
            title="Choose Server"
            description="Your package is active. Choose one server to create your Outline key."
            action={
              <Stack spacing={1.2}>
                <SecondaryButton onClick={() => onTabChange("servers")}>Choose Server</SecondaryButton>
                <SecondaryButton onClick={() => openExternalLink(SUPPORT_URL)}>Contact Support</SecondaryButton>
              </Stack>
            }
          />
        )}
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <EmptyState
        icon={<Inventory2RoundedIcon />}
        title="No active package"
        description="Your account is linked, but there is no active VPN package yet."
        action={
          <Stack spacing={1.2}>
            <SecondaryButton onClick={() => onTabChange("packages")}>View Packages</SecondaryButton>
            <SecondaryButton onClick={() => openExternalLink(SUPPORT_URL)}>Contact Support</SecondaryButton>
          </Stack>
        }
      />
    </PageContainer>
  );
}
