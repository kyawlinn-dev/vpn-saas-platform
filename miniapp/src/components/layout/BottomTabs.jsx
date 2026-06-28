import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import DnsRoundedIcon from "@mui/icons-material/DnsRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import { BottomNavigation, BottomNavigationAction, Box, Paper } from "@mui/material";
import { TAB_KEYS } from "../../constants/routes";

export default function BottomTabs({ value, onChange }) {
  return (
    <Box
      sx={{
        px: 0,
        pb: 0,
        pt: 0,
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 20,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          mx: "auto",
          maxWidth: 600,
          border: "1px solid rgba(255,255,255,0.08)",
          borderBottom: 0,
          background: "rgba(15,23,42,0.98)",
          backdropFilter: "blur(18px)",
          borderRadius: "22px 22px 0 0",
          overflow: "hidden",
          boxShadow: "0 -14px 30px rgba(0,0,0,0.36)",
          pb: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <BottomNavigation
          value={value}
          onChange={(_, next) => onChange(next)}
          sx={{ height: 74 }}
        >
          <BottomNavigationAction
            label="Home"
            value={TAB_KEYS.HOME}
            icon={<HomeRoundedIcon />}
            sx={{
              py: 0.95,
              minWidth: 0,
              "&.Mui-selected": {
                background: "rgba(59,130,246,0.12)",
              },
            }}
          />
          <BottomNavigationAction
            label="Servers"
            value={TAB_KEYS.SERVERS}
            icon={<DnsRoundedIcon />}
            sx={{
              py: 0.95,
              minWidth: 0,
              "&.Mui-selected": {
                background: "rgba(59,130,246,0.12)",
              },
            }}
          />
          <BottomNavigationAction
            label="Packages"
            value={TAB_KEYS.PACKAGES}
            icon={<Inventory2RoundedIcon />}
            sx={{
              py: 0.95,
              minWidth: 0,
              "&.Mui-selected": {
                background: "rgba(59,130,246,0.12)",
              },
            }}
          />
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
