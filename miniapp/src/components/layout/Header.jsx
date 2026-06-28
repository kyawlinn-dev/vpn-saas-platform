import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import { Avatar, Box, IconButton, Stack, Typography } from "@mui/material";
import { APP_NAME } from "../../constants/app";

export default function Header({ brand }) {
  const brandName = brand?.name || APP_NAME || "NEXA VPN";
  const logoUrl = brand?.logo_url || "";

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{ mb: 2, minHeight: 48 }}
    >
      <Avatar
        src={logoUrl}
        alt={brandName}
        sx={{
          width: 40,
          height: 40,
          bgcolor: "#0f172a",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <ShieldRoundedIcon sx={{ color: "#3b82f6" }} />
      </Avatar>

      <Stack
        direction="row"
        alignItems="center"
        spacing={0.8}
        sx={{
          minWidth: 0,
          px: 1.25,
          py: 0.65,
          borderRadius: 999,
          bgcolor: "rgba(15,23,42,0.82)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <Box
          sx={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg, #2563eb, #06b6d4)",
          }}
        >
          <ShieldRoundedIcon sx={{ fontSize: 15, color: "#fff" }} />
        </Box>
        <Typography
          variant="subtitle1"
          fontWeight={900}
          noWrap
          sx={{ color: "#fff", letterSpacing: 0 }}
        >
          {brandName}
        </Typography>
      </Stack>

      <IconButton
        size="small"
        aria-label="Settings"
        sx={{
          width: 40,
          height: 40,
          bgcolor: "#0f172a",
          color: "#cbd5e1",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <SettingsRoundedIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}
