import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import HeadsetMicRoundedIcon from "@mui/icons-material/HeadsetMicRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import IosShareRoundedIcon from "@mui/icons-material/IosShareRounded";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import WifiRoundedIcon from "@mui/icons-material/WifiRounded";
import { Box, CardContent, Stack, Typography } from "@mui/material";
import EmptyState from "../components/common/EmptyState";
import AddKeyButton from "../features/servers/AddKeyButton";
import { DataRing, GhostButton, GlassCard, SuccessDotIcon, VpnChip } from "../components/ui/vpnPrimitives";
import PageContainer from "../components/layout/PageContainer";
import { formatDate } from "../lib/format";
import { getShareUrl } from "../lib/links";
import {
  openTelegramNativeLink,
  openTelegramSharePicker,
  isTelegramWebBrowser,
} from "../lib/telegram";

function formatGb(value) {
  const number = Number(value || 0);
  if (!number) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function getPlanTitle(subscription) {
  const type = String(subscription?.type || "");
  if (type === "trial" || String(subscription?.plan_name || "").toLowerCase().includes("trial")) {
    return "Trial Access";
  }
  return subscription?.plan_name || "Premium Access";
}

function AccessHero({ subscription, outlineKey, keyForActions, hasImportLink, onToast }) {
  const usedGb = Number(outlineKey?.used_bytes || 0) / 1024 / 1024 / 1024;
  const limitGb = Number(subscription?.data_limit_gb || 0);
  const percent = limitGb > 0 ? Math.min(100, (usedGb / limitGb) * 100) : 0;
  const validUntil = subscription?.expiry_date ? formatDate(subscription.expiry_date) : "No expiry shown";
  const secondary = limitGb ? `${formatGb(usedGb)} / ${formatGb(limitGb)} GB` : `${formatGb(usedGb)} GB`;

  return (
    <GlassCard glow>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.65}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1.2}>
            <Stack direction="row" spacing={1.1} alignItems="center" minWidth={0}>
              <Stack
                alignItems="center"
                justifyContent="center"
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  color: "#86efac",
                  bgcolor: "rgba(34,197,94,0.14)",
                }}
              >
                <WifiRoundedIcon fontSize="small" />
              </Stack>
              <Box minWidth={0}>
                <Stack direction="row" spacing={0.55} alignItems="center" minWidth={0}>
                  <Typography sx={{ color: "#f8fafc", fontSize: 15.5, fontWeight: 850 }} noWrap>
                    VPN Access
                  </Typography>
                  <Typography sx={{ color: "#86efac", fontSize: 15.5, fontWeight: 850 }}>
                    Active
                  </Typography>
                </Stack>
                <Typography sx={{ color: "#9aa8bd", fontSize: 12, mt: 0.2 }} noWrap>
                  {getPlanTitle(subscription)}
                </Typography>
              </Box>
            </Stack>

            <VpnChip tone="success" icon={<SuccessDotIcon />}>
              Active
            </VpnChip>
          </Stack>

          <Stack alignItems="center" spacing={1.15}>
            <DataRing
              percent={percent}
              primary={`${Math.round(percent)}%`}
              secondary={secondary}
              size={136}
            />
            <Typography sx={{ color: "#9aa8bd", fontSize: 12 }}>
              Data used this month
            </Typography>
          </Stack>

          <Stack direction="row" spacing={0.8} alignItems="center" justifyContent="center">
            <Box sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: "#9aa8bd" }} />
            <Typography sx={{ color: "#9aa8bd", fontSize: 12 }}>
              Valid until {validUntil}
            </Typography>
          </Stack>

          <AddKeyButton
            outlineKey={keyForActions}
            disabled={!hasImportLink}
            onError={(message) => onToast(message, "warning")}
          />
        </Stack>
      </CardContent>
    </GlassCard>
  );
}

function CurrentServerCard({ server, onChange }) {
  const location = [server?.country, server?.city || server?.name].filter(Boolean).join(" / ");

  return (
    <GlassCard>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.3}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ color: "#9aa8bd", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Current Server
            </Typography>
            <GhostButton
              onClick={onChange}
              endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 15 }} />}
              sx={{ width: "auto", height: 30, minHeight: 30, px: 1.15, borderRadius: 999, fontSize: 12 }}
            >
              Change
            </GhostButton>
          </Stack>

          <Stack direction="row" spacing={1.15} alignItems="center">
            <Typography sx={{ fontSize: 24, lineHeight: 1 }}>
              {server?.flag || "VPN"}
            </Typography>
            <Box minWidth={0} flex={1}>
              <Typography sx={{ color: "#f8fafc", fontSize: 15.5, fontWeight: 850 }} noWrap>
                {location || server?.region || "Choose server"}
              </Typography>
              <Typography sx={{ color: "#9aa8bd", fontSize: 12, mt: 0.2 }}>
                {server?.server_number ? `Server #${server.server_number}` : server ? "Server linked" : "Not linked"}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }}>
            <VpnChip tone="violet">Premium</VpnChip>
            <VpnChip tone="cyan">High Speed</VpnChip>
          </Stack>
        </Stack>
      </CardContent>
    </GlassCard>
  );
}

function QuickAction({ icon, label, helper, onClick, disabled }) {
  return (
    <GlassCard
      component="button"
      onClick={onClick}
      disabled={disabled}
      sx={{
        width: "100%",
        p: 0,
        border: "1px solid rgba(226,232,240,0.1)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        textAlign: "left",
        color: "inherit",
      }}
    >
      <Stack direction="row" spacing={1.1} alignItems="center" sx={{ p: 1.35 }}>
        <Stack
          alignItems="center"
          justifyContent="center"
          sx={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            color: "var(--brand-primary, #38bdf8)",
            bgcolor: "rgba(56,189,248,0.14)",
          }}
        >
          {icon}
        </Stack>
        <Box minWidth={0}>
          <Typography sx={{ color: "#f8fafc", fontSize: 13.5, fontWeight: 800 }} noWrap>
            {label}
          </Typography>
          <Typography sx={{ color: "#9aa8bd", fontSize: 11.5 }} noWrap>
            {helper}
          </Typography>
        </Box>
      </Stack>
    </GlassCard>
  );
}

export default function HomePage({ data, hasActivePackage, hasLinkedKey, onToast, onTabChange }) {
  const subscription = data?.subscription || null;
  const currentServer = data?.current_server || null;
  const outlineKey = data?.outline_key || null;
  const recentRejection = data?.recent_rejection || null;
  const rawSupportHandle = data?.config?.brand?.support_username
    ? String(data.config.brand.support_username).replace(/^@/, "")
    : null;
  const handleSupportContact = rawSupportHandle
    ? () => openTelegramNativeLink(`https://t.me/${rawSupportHandle}`)
    : null;
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
        <AccessHero
          subscription={subscription}
          outlineKey={outlineKey}
          keyForActions={keyForActions}
          hasImportLink={hasImportLink}
          onToast={onToast}
        />
        <CurrentServerCard server={currentServer} onChange={() => onTabChange("servers")} />

        {hasLinkedKey && currentServer ? (
          <Stack spacing={1.1}>
            <Typography sx={{ color: "#f8fafc", fontSize: 13, fontWeight: 850 }}>
              Quick Actions
            </Typography>
            <Stack direction="row" spacing={1}>
              <QuickAction
                icon={<IosShareRoundedIcon fontSize="small" />}
                label="Share Key"
                helper="Send access"
                onClick={handleShare}
                disabled={!hasImportLink}
              />
              {handleSupportContact ? (
                <QuickAction
                  icon={<HeadsetMicRoundedIcon fontSize="small" />}
                  label="Support"
                  helper="Get help"
                  onClick={handleSupportContact}
                />
              ) : null}
            </Stack>
          </Stack>
        ) : (
          <EmptyState
            icon={<StorageRoundedIcon />}
            title="Choose server"
            description="Your package is active. Select one premium server to create your Outline key."
            action={
              <Stack spacing={1} width="100%">
                <GhostButton startIcon={<TuneRoundedIcon />} onClick={() => onTabChange("servers")}>
                  Choose Server
                </GhostButton>
                {handleSupportContact && (
                  <GhostButton startIcon={<HeadsetMicRoundedIcon />} onClick={handleSupportContact}>
                    Contact Support
                  </GhostButton>
                )}
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
        title={recentRejection ? "Payment not confirmed" : "No active package"}
        description={
          recentRejection
            ? `Your${recentRejection.plan_name ? ` ${recentRejection.plan_name}` : ""} payment was rejected. Please contact support or submit a new payment.`
            : "Your account is linked. Choose a package to start secure VPN access."
        }
        action={
          <Stack spacing={1} width="100%">
            <GhostButton onClick={() => onTabChange("packages")}>View Packages</GhostButton>
            {handleSupportContact && (
              <GhostButton startIcon={<HeadsetMicRoundedIcon />} onClick={handleSupportContact}>
                Contact Support
              </GhostButton>
            )}
          </Stack>
        }
      />
    </PageContainer>
  );
}
