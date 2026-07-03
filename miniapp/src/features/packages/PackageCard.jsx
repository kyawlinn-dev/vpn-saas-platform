import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import DataUsageRoundedIcon from "@mui/icons-material/DataUsageRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import SparklesRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import { Box, CardContent, Stack, Typography } from "@mui/material";
import { AuroraButton, GhostButton, GlassCard, VpnChip } from "../../components/ui/vpnPrimitives";
import { formatCurrencyMmk } from "../../lib/format";

function getFeatures(plan) {
  if (Array.isArray(plan?.features) && plan.features.length > 0) {
    return plan.features;
  }

  const maxDevices = Number(plan?.max_devices || 1);
  return [
    "Premium servers",
    "No-log policy",
    `Up to ${maxDevices} device${maxDevices === 1 ? "" : "s"}`,
    "High speed connection",
  ];
}

export default function PackageCard({ plan, onBuy, active }) {
  const dataLimit = plan?.data_limit_gb ? `${plan.data_limit_gb} GB` : "Unlimited";
  const duration = plan?.duration_days ? `${plan.duration_days} Days` : "Flexible";
  const features = getFeatures(plan);
  const highlighted = active || Boolean(plan?.is_popular || plan?.popular);
  const ButtonComponent = highlighted ? AuroraButton : GhostButton;

  return (
    <GlassCard glow={highlighted} sx={{ borderColor: highlighted ? "rgba(56,189,248,0.34)" : undefined }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.6}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1.25}>
            <Box minWidth={0}>
              <Stack direction="row" spacing={0.7} alignItems="center" sx={{ mb: 0.55 }}>
                {active ? <VpnChip tone="success">Active</VpnChip> : null}
                {highlighted && !active ? (
                  <VpnChip tone="primary" icon={<SparklesRoundedIcon />}>
                    Popular
                  </VpnChip>
                ) : null}
                <Typography sx={{ color: "#f8fafc", fontSize: 13, fontWeight: 850 }} noWrap>
                  Premium VPN
                </Typography>
              </Stack>
              <Typography sx={{ color: "#f8fafc", fontSize: 17, fontWeight: 850 }} noWrap>
                {plan?.name || "Premium Plan"}
              </Typography>
            </Box>

            <Box sx={{ textAlign: "right", flex: "0 0 auto" }}>
              <Typography sx={{ color: "#f8fafc", fontSize: 18, fontWeight: 900, lineHeight: 1 }}>
                {Number(plan?.price_mmk || 0).toLocaleString("en-US")}
              </Typography>
              <Typography sx={{ color: "#9aa8bd", fontSize: 11, mt: 0.3 }}>
                MMK
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.4} sx={{ color: "#9aa8bd", fontSize: 12 }}>
            <Stack direction="row" spacing={0.55} alignItems="center">
              <DataUsageRoundedIcon sx={{ fontSize: 15 }} />
              <Typography sx={{ fontSize: 12 }}>{dataLimit}</Typography>
            </Stack>
            <Stack direction="row" spacing={0.55} alignItems="center">
              <EventRoundedIcon sx={{ fontSize: 15 }} />
              <Typography sx={{ fontSize: 12 }}>{duration}</Typography>
            </Stack>
          </Stack>

          <Stack component="ul" spacing={0.85} sx={{ m: 0, p: 0, listStyle: "none" }}>
            {features.slice(0, 4).map((feature) => (
              <Stack key={feature} component="li" direction="row" spacing={0.85} alignItems="center">
                <Stack
                  alignItems="center"
                  justifyContent="center"
                  sx={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    color: "#86efac",
                    bgcolor: "rgba(34,197,94,0.14)",
                  }}
                >
                  <CheckRoundedIcon sx={{ fontSize: 12 }} />
                </Stack>
                <Typography sx={{ color: "rgba(248,250,252,0.9)", fontSize: 13 }}>
                  {feature}
                </Typography>
              </Stack>
            ))}
          </Stack>

          <ButtonComponent onClick={() => onBuy?.(plan)} disabled={active} sx={{ height: 44 }}>
            {active ? "Current Plan" : `Buy Now - ${formatCurrencyMmk(plan?.price_mmk)}`}
          </ButtonComponent>
        </Stack>
      </CardContent>
    </GlassCard>
  );
}
