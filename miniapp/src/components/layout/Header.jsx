import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import { Avatar, Box, IconButton, Stack, Typography } from "@mui/material";
import { APP_NAME } from "../../constants/app";

export default function Header({ brand }) {
  const brandName = brand?.name || APP_NAME || "VPN";
  const logoUrl = brand?.logo_url || "";

  return (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
      <Avatar
        src={logoUrl}
        alt={brandName}
        sx={{
          width: 40,
          height: 40,
          borderRadius: 3,
          color: "#eff6ff",
          bgcolor: "var(--brand-primary, #2563eb)",
          boxShadow: "0 0 20px -3px var(--brand-primary, #2563eb)",
        }}
      >
        <ShieldRoundedIcon fontSize="small" />
      </Avatar>

      <Box minWidth={0} flex={1}>
        <Typography sx={{ color: "#f8fafc", fontSize: 15, fontWeight: 850, lineHeight: 1.15 }} noWrap>
          {brandName}
        </Typography>
        <Typography sx={{ color: "#9aa8bd", fontSize: 12, lineHeight: 1.15 }} noWrap>
          Secure private access
        </Typography>
      </Box>

      <IconButton
        aria-label="Settings"
        size="small"
        disabled
        sx={{
          width: 40,
          height: 40,
          color: "#9aa8bd",
          border: "1px solid rgba(226,232,240,0.11)",
          bgcolor: "rgba(30,41,59,0.55)",
          "&.Mui-disabled": {
            color: "#9aa8bd",
            opacity: 0.75,
          },
        }}
      >
        <SettingsRoundedIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}
