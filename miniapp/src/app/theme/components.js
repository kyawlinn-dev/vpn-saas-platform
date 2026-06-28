const components = {
  MuiCssBaseline: {
    styleOverrides: {
      html: {
        height: "100%",
      },
      body: {
        height: "100%",
        margin: 0,
        background: "#030712",
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
        border: "1px solid rgba(255,255,255,0.08)",
        background: "#0f172a",
        boxShadow: "0 16px 34px rgba(0,0,0,0.32)",
      },
    },
  },
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: 14,
        fontWeight: 800,
        textTransform: "none",
        boxShadow: "none",
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
        "&.Mui-selected": {
          color: "#3b82f6",
        },
      },
      label: {
        fontSize: "0.78rem",
        "&.Mui-selected": {
          fontSize: "0.8rem",
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
};

export default components;
