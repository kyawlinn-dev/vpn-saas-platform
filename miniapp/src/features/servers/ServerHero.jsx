import SignalCellularAltRoundedIcon from "@mui/icons-material/SignalCellularAltRounded";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";

export default function ServerHero({ server }) {
  const location = [server?.country, server?.city || server?.name]
    .filter(Boolean)
    .join(" / ");
  const serverNumber = server?.server_number ? `#${server.server_number}` : "";

  return (
    <Card>
      <CardContent sx={{ p: 2.3 }}>
        <Stack spacing={1.6}>
          <Typography variant="body1" color="text.secondary" fontWeight={700}>
            Current Server :
          </Typography>

          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1.5}>
            <Stack direction="row" alignItems="center" spacing={1.2} minWidth={0}>
              <Typography sx={{ fontSize: 34, lineHeight: 1 }}>
                {server?.flag || "🌐"}
              </Typography>
              <Box minWidth={0}>
                <Typography variant="h6" fontWeight={900} noWrap sx={{ color: "#fff" }}>
                  {location || server?.region || "Choose server"}
                </Typography>
                <Typography variant="body2" fontWeight={900} sx={{ color: "#facc15" }}>
                  {serverNumber || "Not linked"}
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={0.6} alignItems="center" sx={{ color: "#22c55e" }}>
              <SignalCellularAltRoundedIcon fontSize="small" />
              <Typography variant="caption" fontWeight={900}>
                24ms
              </Typography>
            </Stack>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
