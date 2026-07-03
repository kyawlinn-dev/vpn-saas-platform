import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import DnsRoundedIcon from "@mui/icons-material/DnsRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import { BottomNavigation, BottomNavigationAction, Box, Paper } from "@mui/material";
import { TAB_KEYS } from "../../constants/routes";

export default function BottomTabs({ value, onChange }) {
  const actionSx = {
    minWidth: 0,
    gap: 0.35,
    color: "#8b9ab0",
    "& .MuiBottomNavigationAction-label": {
      fontSize: 11,
      fontWeight: 650,
      opacity: 1,
    },
    "& .MuiSvgIcon-root": {
      p: 0.65,
      width: 34,
      height: 30,
      borderRadius: 999,
      transition: "background-color 160ms ease, color 160ms ease",
    },
    "&.Mui-selected": {
      color: "var(--brand-primary, #38bdf8)",
      "& .MuiSvgIcon-root": {
        bgcolor: "rgba(56,189,248,0.14)",
      },
      "& .MuiBottomNavigationAction-label": {
        fontSize: 11,
        fontWeight: 800,
      },
    },
  };

  return (
    <Box
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        px: 2,
        pb: "max(10px, env(safe-area-inset-bottom, 0px))",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          mx: "auto",
          maxWidth: 600,
          height: 64,
          overflow: "hidden",
          borderRadius: 5,
          border: "1px solid rgba(226,232,240,0.12)",
          background: "rgba(11,16,32,0.82)",
          backdropFilter: "blur(18px)",
        }}
      >
        <BottomNavigation
          value={value}
          onChange={(_, next) => onChange(next)}
          sx={{ height: "100%", bgcolor: "transparent" }}
        >
          <BottomNavigationAction
            label="Home"
            value={TAB_KEYS.HOME}
            icon={<HomeRoundedIcon />}
            sx={actionSx}
          />
          <BottomNavigationAction
            label="Servers"
            value={TAB_KEYS.SERVERS}
            icon={<DnsRoundedIcon />}
            sx={actionSx}
          />
          <BottomNavigationAction
            label="Packages"
            value={TAB_KEYS.PACKAGES}
            icon={<Inventory2RoundedIcon />}
            sx={actionSx}
          />
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
