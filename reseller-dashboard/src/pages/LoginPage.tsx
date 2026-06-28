import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import { useLocation, useNavigate } from "react-router-dom";
import { useResellerAuth } from "../providers/ResellerAuthProvider";

const VIOLET = "#7c3aed";
const CYAN = "#06b6d4";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 6.294C4.672 4.169 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const { login, isAuthenticated, initializing } = useResellerAuth();

  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const routeState = location.state as
    | { from?: string; loggedOut?: boolean }
    | null;

  const forceOverviewAfterLogin =
    window.sessionStorage.getItem("forceOverviewAfterLogin") === "1";

  const redirectTo = forceOverviewAfterLogin
    ? "/app/overview"
    : routeState?.from || "/app/overview";

  useEffect(() => {
    if (!initializing && isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, initializing, navigate, redirectTo]);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      await login(email.trim(), password);

      window.sessionStorage.removeItem("forceOverviewAfterLogin");
      navigate("/app/overview", { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setError("");
    setSuccess("");
    setError("Sign up is not available yet. Please contact admin.");
  };

  const handleGoogle = async () => {
    try {
      setGoogleLoading(true);
      setError("");
      setSuccess("");
      setError("Google login is not supported yet.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading && email && password) {
      void (tab === "signin" ? handleSignIn() : handleSignUp());
    }
  };

  const canSubmit =
    !!email.trim() &&
    !!password &&
    (tab === "signin" || !!confirmPassword);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "stretch",
        background: dark
          ? `radial-gradient(ellipse 100% 60% at 50% -5%, ${alpha(VIOLET, 0.2)}, transparent), #070812`
          : `radial-gradient(ellipse 100% 60% at 50% -5%, ${alpha(VIOLET, 0.1)}, transparent), #f0f2ff`,
      }}
    >
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "center",
          width: "44%",
          px: 7,
          py: 6,
          position: "relative",
          background: `linear-gradient(155deg, ${alpha(VIOLET, 0.22)} 0%, ${alpha(CYAN, 0.08)} 100%)`,
          borderRight: `1px solid ${alpha(VIOLET, 0.15)}`,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: -80,
            left: -80,
            width: 320,
            height: 320,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${alpha(VIOLET, 0.25)}, transparent 70%)`,
            pointerEvents: "none",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            bottom: -60,
            right: -60,
            width: 260,
            height: 260,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${alpha(CYAN, 0.2)}, transparent 70%)`,
            pointerEvents: "none",
          }}
        />

        <Stack spacing={3} sx={{ position: "relative", zIndex: 1 }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: 2.5,
              background: `linear-gradient(135deg, ${VIOLET}, ${CYAN})`,
              display: "grid",
              placeItems: "center",
              boxShadow: `0 8px 32px ${alpha(VIOLET, 0.5)}`,
            }}
          >
            <Typography
              sx={{
                fontSize: "1.5rem",
                fontWeight: 900,
                color: "#fff",
                fontFamily: "'Outfit', sans-serif",
              }}
            >
              R
            </Typography>
          </Box>

          <Box>
            <Typography
              sx={{
                fontSize: "2.4rem",
                fontWeight: 900,
                fontFamily: "'Outfit', sans-serif",
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                color: dark ? "#e8eaf6" : "#0f0f23",
              }}
            >
              Reseller
              <br />
              Dashboard
            </Typography>
            <Typography
              sx={{
                mt: 1.5,
                fontSize: "1.05rem",
                color: dark ? alpha("#e8eaf6", 0.6) : alpha("#0f0f23", 0.55),
                lineHeight: 1.6,
              }}
            >
              Manage VPN orders, track customers,
              <br />
              and grow your reseller business.
            </Typography>
          </Box>

          <Stack spacing={2} sx={{ mt: 2 }}>
            {[
              {
                emoji: "⚡",
                title: "Live order tracking",
                desc: "Real-time status for all connections",
              },
              {
                emoji: "🔑",
                title: "Access key management",
                desc: "One-click activate, stop & renew",
              },
              {
                emoji: "📊",
                title: "Revenue insights",
                desc: "Track usage, value & expiry in one view",
              },
            ].map((f) => (
              <Stack
                key={f.title}
                direction="row"
                spacing={1.5}
                alignItems="flex-start"
              >
                <Box sx={{ fontSize: "1.2rem", mt: 0.1 }}>{f.emoji}</Box>
                <Box>
                  <Typography
                    sx={{
                      fontWeight: 700,
                      fontSize: "0.88rem",
                      color: dark ? "#e8eaf6" : "#0f0f23",
                    }}
                  >
                    {f.title}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.8rem",
                      color: dark
                        ? alpha("#e8eaf6", 0.5)
                        : alpha("#0f0f23", 0.5),
                    }}
                  >
                    {f.desc}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </Box>

      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          px: { xs: 2, sm: 4, md: 7 },
          py: 6,
        }}
      >
        <Stack
          spacing={1}
          alignItems="center"
          sx={{ mb: 4, display: { md: "none" } }}
        >
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              background: `linear-gradient(135deg, ${VIOLET}, ${CYAN})`,
              display: "grid",
              placeItems: "center",
              boxShadow: `0 6px 24px ${alpha(VIOLET, 0.4)}`,
            }}
          >
            <Typography
              sx={{
                fontSize: "1.4rem",
                fontWeight: 900,
                color: "#fff",
                fontFamily: "'Outfit', sans-serif",
              }}
            >
              R
            </Typography>
          </Box>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: "1.15rem",
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            Reseller Dashboard
          </Typography>
        </Stack>

        <Box
          sx={{
            width: "100%",
            maxWidth: 420,
            p: { xs: 3, sm: 4 },
            borderRadius: 3,
            background: dark ? alpha("#0c0e1c", 0.8) : alpha("#ffffff", 0.9),
            border: `1px solid ${
              dark ? alpha(VIOLET, 0.15) : alpha(VIOLET, 0.12)
            }`,
            backdropFilter: "blur(20px)",
            boxShadow: dark
              ? `0 24px 80px ${alpha("#000", 0.5)}`
              : `0 12px 48px ${alpha(VIOLET, 0.1)}`,
          }}
        >
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: "1.6rem",
              fontFamily: "'Outfit', sans-serif",
              mb: 0.5,
            }}
          >
            {tab === "signin" ? "Welcome back" : "Create account"}
          </Typography>
          <Typography
            sx={{ fontSize: "0.88rem", color: "text.secondary", mb: 2.5 }}
          >
            {tab === "signin"
              ? "Sign in to your reseller account"
              : "Start managing your VPN reseller business"}
          </Typography>

          <Tabs
            value={tab}
            onChange={(_, v: "signin" | "signup") => {
              if (v === "signup") {
                setError("Sign up is not available yet. Please contact admin.");
                setSuccess("");
                return;
              }
              setTab("signin");
              setError("");
              setSuccess("");
            }}
            sx={{
              mb: 3,
              "& .MuiTabs-root": { minHeight: 38 },
              "& .MuiTab-root": {
                minHeight: 38,
                fontSize: "0.88rem",
                fontWeight: 700,
                textTransform: "none",
                px: 2,
              },
              "& .MuiTabs-indicator": {
                height: 2,
                borderRadius: 2,
                background: `linear-gradient(90deg, ${VIOLET}, ${CYAN})`,
              },
            }}
          >
            <Tab value="signin" label="Sign In" />
            <Tab value="signup" label="Sign Up" />
          </Tabs>

          <Stack spacing={2}>
            {error ? (
              <Alert severity="error" sx={{ fontSize: "0.84rem" }}>
                {error}
              </Alert>
            ) : null}

            {success ? (
              <Alert severity="success" sx={{ fontSize: "0.84rem" }}>
                {success}
              </Alert>
            ) : null}

            <TextField
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              autoComplete="email"
              onKeyDown={onKeyDown}
              size="medium"
              disabled={loading}
            />

            <TextField
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              autoComplete="current-password"
              onKeyDown={onKeyDown}
              size="medium"
              disabled={loading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? (
                        <VisibilityOffRoundedIcon fontSize="small" />
                      ) : (
                        <VisibilityRoundedIcon fontSize="small" />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            {tab === "signup" && (
              <TextField
                label="Confirm password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                fullWidth
                autoComplete="new-password"
                onKeyDown={onKeyDown}
                size="medium"
                disabled={loading}
              />
            )}

            <Button
              variant="contained"
              size="large"
              onClick={() =>
                void (tab === "signin" ? handleSignIn() : handleSignUp())
              }
              disabled={loading || !canSubmit}
              fullWidth
              sx={{ minHeight: 46, fontSize: "0.95rem", borderRadius: 2 }}
            >
              {loading
                ? tab === "signin"
                  ? "Signing in…"
                  : "Creating account…"
                : tab === "signin"
                ? "Sign In"
                : "Create Account"}
            </Button>

            <Divider sx={{ my: 0.5 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ px: 1 }}
              >
                or continue with
              </Typography>
            </Divider>

            <Button
              variant="outlined"
              size="large"
              fullWidth
              onClick={() => void handleGoogle()}
              disabled={googleLoading}
              startIcon={<GoogleIcon />}
              sx={{
                minHeight: 46,
                fontSize: "0.9rem",
                borderRadius: 2,
                borderColor: dark
                  ? alpha(VIOLET, 0.25)
                  : alpha(VIOLET, 0.2),
                color: "text.primary",
                "&:hover": {
                  borderColor: VIOLET,
                  bgcolor: alpha(VIOLET, 0.05),
                },
              }}
            >
              {googleLoading ? "Redirecting…" : "Continue with Google"}
            </Button>
          </Stack>
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 3, textAlign: "center" }}
        >
          By signing in you agree to our Terms of Service and Privacy Policy.
        </Typography>
      </Box>
    </Box>
  );
}