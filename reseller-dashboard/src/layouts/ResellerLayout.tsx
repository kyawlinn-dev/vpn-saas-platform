import { useMemo, useState } from "react";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import SellRoundedIcon from "@mui/icons-material/SellRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useDashboardContext } from "../providers/DashboardDataProvider";
import { useResellerAuth } from "../providers/ResellerAuthProvider";
import { useResellerProfile } from "../hooks/useResellerProfile";
import { useColorMode } from "../theme/ColorModeContext";

const VIOLET = "#7c3aed";
const CYAN = "#06b6d4";

const navItems = [
  { label: "Overview", to: "/app/overview", icon: <DashboardRoundedIcon fontSize="small" /> },
  { label: "Orders", to: "/app/orders", icon: <ReceiptLongRoundedIcon fontSize="small" /> },
  { label: "Telegram Orders", to: "/app/telegram-orders", icon: <SmartToyRoundedIcon fontSize="small" /> },
  { label: "Plans", to: "/app/plans", icon: <SellRoundedIcon fontSize="small" /> },
];

function NavButton({
  to,
  label,
  icon,
  active,
  onClick,
  mobile,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick?: () => void;
  mobile?: boolean;
}) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";

  return (
    <Button
      component={NavLink}
      to={to}
      onClick={onClick}
      startIcon={icon}
      fullWidth={mobile}
      disableElevation
      sx={{
        justifyContent: mobile ? "flex-start" : "center",
        borderRadius: mobile ? 2 : "50px",
        minHeight: mobile ? 48 : 36,
        px: mobile ? 2 : 2,
        color: active ? "#fff" : dark ? alpha("#e8eaf6", 0.65) : alpha("#0f0f23", 0.55),
        background: active
          ? `linear-gradient(135deg, ${VIOLET} 0%, #5b21b6 100%)`
          : "transparent",
        border: "none !important",
        fontWeight: active ? 700 : 600,
        fontSize: "0.86rem",
        letterSpacing: "0.01em",
        boxShadow: active
          ? `0 4px 14px ${alpha(VIOLET, dark ? 0.5 : 0.35)}`
          : "none",
        "&:hover": {
          background: active
            ? `linear-gradient(135deg, #9f67ff 0%, ${VIOLET} 100%)`
            : dark
              ? alpha(VIOLET, 0.1)
              : alpha(VIOLET, 0.07),
          color: active ? "#fff" : VIOLET,
          boxShadow: active ? `0 4px 14px ${alpha(VIOLET, 0.45)}` : "none",
        },
        transition: "all 0.18s ease",
        "& .MuiButton-startIcon": { color: "inherit", marginRight: "6px" },
      }}
    >
      {label}
    </Button>
  );
}

export function ResellerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const mobile = useMediaQuery(theme.breakpoints.down("md"));
  const { mode, toggleColorMode } = useColorMode();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { logout } = useResellerAuth();
  const { refresh, loading, error } = useDashboardContext();
  const { profile, loading: profileLoading, error: profileError } = useResellerProfile();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const initials = useMemo(() => {
    const name = profile?.name || "";
    return name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "R";
  }, [profile?.name]);

  const drawerContent = useMemo(
    () => (
      <Box
        sx={{
          width: 300,
          maxWidth: "100vw",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.paper",
        }}
      >
        <Box sx={{ p: 2.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  background: `linear-gradient(135deg, ${VIOLET}, ${CYAN})`,
                  display: "grid",
                  placeItems: "center",
                  boxShadow: `0 4px 16px ${alpha(VIOLET, 0.4)}`,
                }}
              >
                <Typography
                  sx={{
                    fontWeight: 900,
                    color: "#fff",
                    fontSize: "1.1rem",
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  R
                </Typography>
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontSize: "1rem", lineHeight: 1 }}>
                  Reseller Dashboard
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {profileLoading ? "Loading…" : profile?.name || "Reseller"}
                </Typography>
              </Box>
            </Stack>
            <IconButton size="small" onClick={() => setDrawerOpen(false)} sx={{ borderRadius: 1.5 }}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2.5, px: 0.5 }}>
            <FiberManualRecordIcon
              sx={{ fontSize: 10, color: loading ? "warning.main" : "success.main" }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {loading ? "Syncing data…" : "Live data"}
            </Typography>
          </Stack>

          <Stack spacing={0.75}>
            {navItems.map((item) => (
              <NavButton
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
                active={location.pathname.startsWith(item.to)}
                onClick={() => setDrawerOpen(false)}
                mobile
              />
            ))}
          </Stack>
        </Box>

        <Divider sx={{ mx: 2 }} />

        <Box sx={{ p: 2.5 }}>
          <Stack spacing={1}>
            <Button
              fullWidth
              variant="outlined"
              color="inherit"
              startIcon={mode === "dark" ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
              onClick={toggleColorMode}
              sx={{
                borderRadius: 2,
                minHeight: 44,
                justifyContent: "flex-start",
                px: 2,
                fontWeight: 600,
                fontSize: "0.88rem",
              }}
            >
              {mode === "dark" ? "Light mode" : "Dark mode"}
            </Button>

            <Button
              fullWidth
              variant="outlined"
              color="inherit"
              startIcon={<RefreshRoundedIcon />}
              onClick={() => {
                void refresh();
                setDrawerOpen(false);
              }}
              sx={{
                borderRadius: 2,
                minHeight: 44,
                justifyContent: "flex-start",
                px: 2,
                fontWeight: 600,
                fontSize: "0.88rem",
              }}
            >
              Refresh data
            </Button>

            <Button
              fullWidth
              variant="outlined"
              color="error"
              startIcon={<LogoutRoundedIcon />}
              onClick={() => {
                void handleLogout();
                setDrawerOpen(false);
              }}
              sx={{
                borderRadius: 2,
                minHeight: 44,
                justifyContent: "flex-start",
                px: 2,
                fontWeight: 600,
                fontSize: "0.88rem",
              }}
            >
              Sign out
            </Button>
          </Stack>
        </Box>
      </Box>
    ),
    [loading, location.pathname, mode, profile?.name, profileLoading, refresh, toggleColorMode]
  );

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          backgroundColor: dark ? alpha("#070812", 0.88) : "rgba(255,255,255,0.94)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderBottom: `1px solid ${dark ? alpha(VIOLET, 0.14) : "rgba(0,0,0,0.07)"}`,
          boxShadow: dark ? `0 1px 0 ${alpha(VIOLET, 0.1)}` : "0 1px 12px rgba(0,0,0,0.07)",
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 60, md: 68 }, px: { xs: 1.5, md: 3 }, gap: 1.5 }}>
          {mobile ? (
            <>
              <IconButton
                onClick={() => setDrawerOpen(true)}
                edge="start"
                sx={{
                  borderRadius: 1.5,
                  color: dark ? alpha("#e8eaf6", 0.85) : alpha("#0f0f23", 0.75),
                  "&:hover": { color: VIOLET, bgcolor: alpha(VIOLET, 0.08) },
                }}
              >
                <MenuRoundedIcon />
              </IconButton>

              <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flexGrow: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    width: 34,
                    height: 34,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${VIOLET}, ${CYAN})`,
                    display: "grid",
                    placeItems: "center",
                    boxShadow: `0 3px 12px ${alpha(VIOLET, 0.4)}`,
                    flexShrink: 0,
                  }}
                >
                  <Typography
                    sx={{
                      fontWeight: 900,
                      color: "#fff",
                      fontSize: "0.95rem",
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    R
                  </Typography>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="h6"
                    noWrap
                    sx={{ fontSize: "1rem", lineHeight: 1, color: dark ? "#e8eaf6" : "#0f0f23" }}
                  >
                    Reseller Dashboard
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {profileLoading ? "Loading…" : profile?.name || "Signed in"}
                  </Typography>
                </Box>
              </Stack>

              <IconButton
                onClick={toggleColorMode}
                sx={{
                  borderRadius: 1.5,
                  color: dark ? alpha("#e8eaf6", 0.75) : alpha("#0f0f23", 0.65),
                  "&:hover": { color: VIOLET, bgcolor: alpha(VIOLET, 0.08) },
                }}
              >
                {mode === "dark" ? (
                  <LightModeRoundedIcon fontSize="small" />
                ) : (
                  <DarkModeRoundedIcon fontSize="small" />
                )}
              </IconButton>
            </>
          ) : (
            <>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 1.5,
                    background: `linear-gradient(135deg, ${VIOLET}, ${CYAN})`,
                    display: "grid",
                    placeItems: "center",
                    boxShadow: `0 4px 14px ${alpha(VIOLET, 0.45)}`,
                  }}
                >
                  <Typography
                    sx={{
                      fontWeight: 900,
                      color: "#fff",
                      fontSize: "1rem",
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    R
                  </Typography>
                </Box>
                <Box>
                  <Typography
                    sx={{
                      fontWeight: 700,
                      fontSize: "0.95rem",
                      lineHeight: 1.2,
                      color: dark ? "#e8eaf6" : "#0f0f23",
                    }}
                  >
                    Reseller Dashboard
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <FiberManualRecordIcon
                      sx={{ fontSize: 7, color: loading ? "warning.main" : "success.main" }}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        color: dark ? alpha("#e8eaf6", 0.4) : alpha("#0f0f23", 0.38),
                      }}
                    >
                      {profileLoading ? "Loading…" : profile?.name || "Signed in"} •{" "}
                      {loading ? "Syncing" : "Live"}
                    </Typography>
                  </Stack>
                </Box>
              </Stack>

              <Box sx={{ flexGrow: 1 }} />

              <Stack direction="row" spacing={0.5} alignItems="center">
                {navItems.map((item) => (
                  <NavButton
                    key={item.to}
                    to={item.to}
                    label={item.label}
                    icon={item.icon}
                    active={location.pathname.startsWith(item.to)}
                  />
                ))}
              </Stack>

              <Box sx={{ flexGrow: 1 }} />

              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                <Tooltip title="Refresh data">
                  <span>
                    <IconButton
                      onClick={() => void refresh()}
                      disabled={loading}
                      sx={{
                        borderRadius: 2,
                        bgcolor: dark ? alpha("#fff", 0.04) : alpha("#000", 0.03),
                        "&:hover": {
                          bgcolor: dark ? alpha(VIOLET, 0.12) : alpha(VIOLET, 0.08),
                          color: VIOLET,
                        },
                      }}
                    >
                      <RefreshRoundedIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>

                <Tooltip title={mode === "dark" ? "Light mode" : "Dark mode"}>
                  <IconButton
                    onClick={toggleColorMode}
                    sx={{
                      borderRadius: 2,
                      bgcolor: dark ? alpha("#fff", 0.04) : alpha("#000", 0.03),
                      "&:hover": {
                        bgcolor: dark ? alpha(VIOLET, 0.12) : alpha(VIOLET, 0.08),
                        color: VIOLET,
                      },
                    }}
                  >
                    {mode === "dark" ? (
                      <LightModeRoundedIcon fontSize="small" />
                    ) : (
                      <DarkModeRoundedIcon fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>

                <Stack direction="row" spacing={1.2} alignItems="center">
                  <Avatar
                    sx={{
                      width: 34,
                      height: 34,
                      fontWeight: 800,
                      fontSize: "0.85rem",
                      background: `linear-gradient(135deg, ${VIOLET} 0%, #5b21b6 100%)`,
                      boxShadow: `0 4px 12px ${alpha(VIOLET, 0.35)}`,
                    }}
                  >
                    {initials}
                  </Avatar>
                  <Box sx={{ display: { xs: "none", lg: "block" }, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontWeight: 700,
                        fontSize: "0.84rem",
                        lineHeight: 1.1,
                        color: dark ? "#e8eaf6" : "#0f0f23",
                      }}
                      noWrap
                    >
                      {profileLoading ? "Loading…" : profile?.name || "Reseller"}
                    </Typography>
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{
                        color: dark ? alpha("#e8eaf6", 0.42) : alpha("#0f0f23", 0.4),
                        fontSize: "0.72rem",
                      }}
                    >
                      {profile?.email || "Signed in"}
                    </Typography>
                  </Box>
                </Stack>

                <Button
                  variant="outlined"
                  color="inherit"
                  startIcon={<LogoutRoundedIcon />}
                  onClick={() => void handleLogout()}
                  sx={{
                    borderRadius: 2,
                    fontWeight: 700,
                    px: 1.6,
                    color: dark ? alpha("#e8eaf6", 0.8) : alpha("#0f0f23", 0.72),
                    borderColor: dark ? alpha("#fff", 0.12) : alpha("#000", 0.08),
                    "&:hover": {
                      color: "#ef4444",
                      borderColor: alpha("#ef4444", 0.3),
                      bgcolor: alpha("#ef4444", 0.06),
                    },
                  }}
                >
                  Sign out
                </Button>
              </Stack>
            </>
          )}
        </Toolbar>
      </AppBar>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        anchor="left"
        PaperProps={{
          sx: {
            bgcolor: "background.paper",
            backgroundImage: "none",
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        {profileError ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {profileError}
          </Alert>
        ) : null}

        <Outlet />
      </Container>
    </>
  );
}