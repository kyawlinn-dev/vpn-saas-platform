import { Box, Card, CardContent, Stack, Typography } from "@mui/material";

export default function ServerHero({ server }) {
  const location = [server?.country, server?.city || server?.name]
    .filter(Boolean)
    .join(" / ");
  const serverNumber = server?.server_number ? `#${server.server_number}` : "";

  return (
    <Card>
      <CardContent sx={{ p: 2 }}>
        <Stack spacing={1.2}>
          <Typography color="text.secondary" fontWeight={800} sx={{ fontSize: 11.5, textTransform: "uppercase" }}>
            Current server
          </Typography>

          <Stack direction="row" alignItems="center" spacing={1.2} minWidth={0}>
            <Typography sx={{ fontSize: 30, lineHeight: 1 }}>
              {server?.flag || "VPN"}
            </Typography>
            <Box minWidth={0}>
              <Typography fontWeight={950} noWrap sx={{ color: "#fff", fontSize: 17 }}>
                {location || server?.region || "Choose server"}
              </Typography>
              <Typography fontWeight={900} sx={{ color: "#facc15", fontSize: 12.5 }}>
                {serverNumber || "Not linked"}
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
