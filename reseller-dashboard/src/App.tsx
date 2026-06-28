import { useMemo, useState } from "react";
import { CssBaseline, ThemeProvider, alpha, createTheme } from "@mui/material";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { ResellerAuthProvider } from "./providers/ResellerAuthProvider";
import { DashboardDataProvider } from "./providers/DashboardDataProvider";
import LoginPage from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { OrdersPage } from "./pages/OrdersPage";
import { PlansPage } from "./pages/PlansPage";
import { TelegramOrdersPage } from "./pages/TelegramOrdersPage";
import { ResellerLayout } from "./layouts/ResellerLayout";
import { ColorModeContext } from "./theme/ColorModeContext";

const VIOLET = "#7c3aed";
const CYAN = "#06b6d4";
const EMERALD = "#10b981";

function buildTheme(mode: "light" | "dark") {
  const dark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary: { main: VIOLET, light: "#9f67ff", dark: "#5b21b6" },
      secondary: { main: CYAN },
      success: { main: EMERALD },
      background: dark
        ? { default: "#070812", paper: "#0c0e1c" }
        : { default: "#f0f2ff", paper: "#ffffff" },
      text: dark
        ? { primary: "#e8eaf6", secondary: "#8892b0" }
        : { primary: "#0f0f23", secondary: "#5a6483" },
      divider: dark ? alpha("#7c3aed", 0.14) : alpha("#7c3aed", 0.1),
    },

    shape: { borderRadius: 10 },

    typography: {
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      h4: { fontWeight: 800, fontFamily: "'Outfit', sans-serif" },
      h5: { fontWeight: 800, fontFamily: "'Outfit', sans-serif" },
      h6: { fontWeight: 700, fontFamily: "'Outfit', sans-serif" },
      button: { fontWeight: 700, textTransform: "none", letterSpacing: "0.01em" },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage: dark
              ? `radial-gradient(ellipse 80% 40% at 50% -10%, ${alpha(VIOLET, 0.18)}, transparent),
                 linear-gradient(180deg, #070812 0%, #090b18 100%)`
              : `radial-gradient(ellipse 80% 40% at 50% -10%, ${alpha(VIOLET, 0.08)}, transparent),
                 linear-gradient(180deg, #f0f2ff 0%, #eaecff 100%)`,
          },
        },
      },

      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            borderRadius: 12,
            border: `1px solid ${dark ? alpha(VIOLET, 0.12) : alpha(VIOLET, 0.1)}`,
            boxShadow: dark
              ? `0 0 0 1px ${alpha(VIOLET, 0.06)}, 0 4px 24px ${alpha("#000", 0.3)}`
              : `0 2px 12px ${alpha(VIOLET, 0.06)}`,
            transition: "box-shadow 0.2s, border-color 0.2s",
          },
        },
      },

      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
        },
      },

      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            border: `1px solid ${dark ? alpha(VIOLET, 0.15) : alpha(VIOLET, 0.12)}`,
            boxShadow: `0 24px 80px ${alpha("#000", 0.4)}`,
          },
        },
      },

      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 8, minHeight: 38, fontWeight: 700 },
          contained: {
            background: `linear-gradient(135deg, ${VIOLET} 0%, #5b21b6 100%)`,
            "&:hover": {
              background: `linear-gradient(135deg, #9f67ff 0%, ${VIOLET} 100%)`,
            },
          },
          outlined: { borderWidth: "1.5px", "&:hover": { borderWidth: "1.5px" } },
        },
      },

      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 6, fontWeight: 700, fontSize: "0.78rem" },
        },
      },

      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: dark ? alpha(VIOLET, 0.2) : alpha(VIOLET, 0.2),
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: dark ? alpha(VIOLET, 0.45) : alpha(VIOLET, 0.4),
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: VIOLET,
              borderWidth: "1.5px",
            },
          },
        },
      },

      MuiTextField: { defaultProps: { size: "small" } },

      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
          },
        },
      },

      MuiTableCell: {
        styleOverrides: {
          head: {
            fontWeight: 700,
            fontSize: "0.82rem",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            opacity: 0.6,
          },
          root: { borderColor: dark ? alpha(VIOLET, 0.1) : alpha(VIOLET, 0.08) },
        },
      },

      MuiTableContainer: {
        styleOverrides: { root: { borderRadius: 10 } },
      },

      MuiAlert: {
        styleOverrides: { root: { borderRadius: 10 } },
      },

      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 8, height: 6 },
          bar: { borderRadius: 8 },
        },
      },
    },
  });
}

export default function App() {
  const [mode, setMode] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("reseller-dashboard-mode");
    return saved === "light" ? "light" : "dark";
  });

  const colorMode = useMemo(
    () => ({
      mode,
      toggleColorMode: () => {
        setMode((prev) => {
          const next = prev === "dark" ? "light" : "dark";
          localStorage.setItem("reseller-dashboard-mode", next);
          return next;
        });
      },
    }),
    [mode]
  );

  const theme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ResellerAuthProvider>
          <DashboardDataProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <ResellerLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<OverviewPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="telegram-orders" element={<TelegramOrdersPage />} />
                <Route path="plans" element={<PlansPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </DashboardDataProvider>
        </ResellerAuthProvider>
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}