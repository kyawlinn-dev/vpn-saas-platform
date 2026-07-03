const components = {
  MuiCssBaseline: {
    styleOverrides: {
      html: {
        height: "100%",
      },
      body: {
        height: "100%",
        margin: 0,
        background:
          "radial-gradient(circle at 20% -10%, rgba(59,130,246,0.18), transparent 28%), radial-gradient(circle at 90% 0%, rgba(124,58,237,0.16), transparent 26%), #020617",
      },
      "#root": {
        minHeight: "100%",
      },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        borderRadius: 18,
        border: "1px solid rgba(148,163,184,0.16)",
        background:
          "linear-gradient(180deg, rgba(15,23,42,0.78) 0%, rgba(8,13,28,0.82) 100%)",
        boxShadow: "0 18px 44px rgba(0,0,0,0.28)",
        backdropFilter: "blur(18px)",
      },
    },
  },
  MuiButton: {
    styleOverrides: {
      root: {
        minHeight: 46,
        borderRadius: 14,
        fontWeight: 800,
        textTransform: "none",
        boxShadow: "none",
        fontSize: 14,
      },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: {
        borderRadius: 999,
        fontWeight: 700,
      },
    },
  },
  MuiBottomNavigation: {
    styleOverrides: {
      root: {
        background: "transparent",
      },
    },
  },
  MuiBottomNavigationAction: {
    styleOverrides: {
      root: {
        color: "rgba(238,242,255,0.56)",
        minWidth: 0,
        padding: "7px 0 6px",
        "&.Mui-selected": {
          color: "var(--brand-primary, #3b82f6)",
        },
      },
      label: {
        fontSize: "0.72rem",
        "&.Mui-selected": {
          fontSize: "0.74rem",
          fontWeight: 700,
        },
      },
    },
  },
  MuiSkeleton: {
    styleOverrides: {
      root: {
        backgroundColor: "rgba(255,255,255,0.08)",
      },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: "24px 24px 0 0",
        margin: 0,
        width: "100%",
        maxWidth: 600,
        position: "fixed",
        bottom: 0,
        background:
          "linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(3,7,18,0.98) 100%)",
        border: "1px solid rgba(148,163,184,0.18)",
        boxShadow: "0 -24px 60px rgba(0,0,0,0.48)",
      },
    },
  },
};

export default components;
