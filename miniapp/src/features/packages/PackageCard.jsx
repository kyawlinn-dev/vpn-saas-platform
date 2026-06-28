import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import { Box, Card, CardActionArea, CardContent, Stack, Typography } from "@mui/material";
import PrimaryButton from "../../components/common/PrimaryButton";
import { formatCurrencyMmk } from "../../lib/format";

function getFeatures(plan) {
  if (Array.isArray(plan?.features) && plan.features.length > 0) {
    return plan.features;
  }

  return [
    "Affordable for everyone",
    `${plan?.data_limit_gb || "-"} GB Premium Servers`,
    "High-Speed Private Servers",
    "No-Log Policy",
    `${plan?.duration_days || "-"} Days Validity`,
  ];
}

export default function PackageCard({ plan, onBuy }) {
  const dataLimit = plan?.data_limit_gb ? `${plan.data_limit_gb} GB` : "Unlimited";
  const maxDevices = Number(plan?.max_devices || 1);
  const recommended = maxDevices > 1 ? `1-${maxDevices}` : "1";
  const features = getFeatures(plan);

  return (
    <Card
      sx={{
        overflow: "hidden",
        background: "#0f172a",
      }}
    >
      <CardActionArea onClick={() => onBuy?.(plan)}>
        <CardContent sx={{ p: 2.2 }}>
          <Stack spacing={1.8}>
            <Stack direction="row" justifyContent="space-between" gap={2}>
              <Box>
                <Typography variant="h6" fontWeight={950}>
                  {plan?.name || "Premium Plan"}
                </Typography>
                <Typography variant="h6" fontWeight={950} sx={{ color: "#38bdf8" }}>
                  {dataLimit}
                </Typography>
              </Box>

              <Typography variant="h6" fontWeight={950} sx={{ color: "#facc15" }}>
                {formatCurrencyMmk(plan?.price_mmk)}
              </Typography>
            </Stack>

            <Typography variant="body2" color="text.secondary">
              Unlimited Devices ({recommended} devices recommended)
            </Typography>

            <Stack spacing={0.9}>
              {features.map((feature) => (
                <Stack key={feature} direction="row" spacing={1} alignItems="center">
                  <CheckCircleRoundedIcon sx={{ fontSize: 18, color: "#22c55e" }} />
                  <Typography variant="body2">{feature}</Typography>
                </Stack>
              ))}
            </Stack>
          </Stack>
        </CardContent>
      </CardActionArea>

      <Box sx={{ px: 2.2, pb: 2.2 }}>
        <PrimaryButton onClick={() => onBuy?.(plan)}>Buy</PrimaryButton>
      </Box>
    </Card>
  );
}
