import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import { Box, Button, Card, Chip, Stack, Typography } from "@mui/material";

export function GlassCard({ children, glow = false, sx, ...props }) {
  return (
    <Card
      elevation={0}
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "22px",
        border: "1px solid rgba(226,232,240,0.11)",
        background:
          "linear-gradient(180deg, rgba(30,41,75,0.66), rgba(15,23,42,0.56))",
        backdropFilter: "blur(16px)",
        boxShadow: glow ? "0 18px 48px -28px var(--brand-primary, #38bdf8)" : "none",
        ...(glow
          ? {
              "&::before": {
                content: '""',
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background:
                  "radial-gradient(120% 90% at 10% -10%, rgba(37,99,235,0.22), transparent 60%), radial-gradient(120% 90% at 100% 0%, rgba(34,211,238,0.16), transparent 55%), radial-gradient(140% 120% at 80% 120%, rgba(124,58,237,0.14), transparent 60%)",
              },
            }
          : null),
        ...sx,
      }}
      {...props}
    >
      <Box sx={{ position: "relative", zIndex: 1 }}>{children}</Box>
    </Card>
  );
}

export function VpnChip({ children, tone = "muted", icon, sx }) {
  const tones = {
    primary: {
      color: "var(--brand-primary, #38bdf8)",
      bgcolor: "rgba(56,189,248,0.14)",
      borderColor: "rgba(56,189,248,0.26)",
    },
    cyan: {
      color: "#67e8f9",
      bgcolor: "rgba(6,182,212,0.14)",
      borderColor: "rgba(6,182,212,0.26)",
    },
    violet: {
      color: "#c4b5fd",
      bgcolor: "rgba(124,58,237,0.14)",
      borderColor: "rgba(124,58,237,0.28)",
    },
    success: {
      color: "#86efac",
      bgcolor: "rgba(34,197,94,0.14)",
      borderColor: "rgba(34,197,94,0.26)",
    },
    warning: {
      color: "#fde68a",
      bgcolor: "rgba(245,158,11,0.14)",
      borderColor: "rgba(245,158,11,0.26)",
    },
    muted: {
      color: "#a7b3c7",
      bgcolor: "rgba(148,163,184,0.12)",
      borderColor: "rgba(148,163,184,0.16)",
    },
  };

  return (
    <Chip
      icon={icon}
      label={children}
      size="small"
      sx={{
        height: 24,
        border: "1px solid",
        fontWeight: 800,
        ...tones[tone],
        "& .MuiChip-label": { px: 0.9, fontSize: 11 },
        "& .MuiChip-icon": { ml: 0.8, mr: -0.35, fontSize: 14, color: "inherit" },
        ...sx,
      }}
    />
  );
}

export function SectionTitle({ title, subtitle }) {
  return (
    <Box>
      <Typography sx={{ color: "#f8fafc", fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>
        {title}
      </Typography>
      {subtitle ? (
        <Typography sx={{ color: "#9aa8bd", fontSize: 13, mt: 0.35 }}>
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  );
}

export function AuroraButton({ children, sx, ...props }) {
  return (
    <Button
      fullWidth
      variant="contained"
      sx={{
        height: 48,
        borderRadius: 4,
        color: "#eff6ff",
        fontSize: 15,
        fontWeight: 850,
        background:
          "linear-gradient(90deg, var(--brand-primary, #2563eb), #22d3ee)",
        boxShadow: "0 10px 28px -14px var(--brand-primary, #2563eb)",
        "&:hover": {
          background:
            "linear-gradient(90deg, var(--brand-primary, #3b82f6), #67e8f9)",
          boxShadow: "0 12px 32px -14px var(--brand-primary, #2563eb)",
        },
        "&.Mui-disabled": {
          color: "rgba(239,246,255,0.58)",
          background:
            "linear-gradient(90deg, rgba(37,99,235,0.7), rgba(34,211,238,0.7))",
        },
        ...sx,
      }}
      {...props}
    >
      {children}
    </Button>
  );
}

export function GhostButton({ children, sx, ...props }) {
  return (
    <Button
      fullWidth
      variant="contained"
      sx={{
        height: 48,
        borderRadius: 4,
        color: "#f8fafc",
        fontSize: 15,
        fontWeight: 800,
        border: "1px solid rgba(226,232,240,0.12)",
        background: "rgba(30,41,59,0.58)",
        boxShadow: "none",
        "&:hover": { background: "rgba(51,65,85,0.64)", boxShadow: "none" },
        ...sx,
      }}
      {...props}
    >
      {children}
    </Button>
  );
}

export function DataRing({ percent, primary, secondary, caption, size = 132 }) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <Box sx={{ position: "relative", width: size, height: size }}>
      <Box
        component="svg"
        width={size}
        height={size}
        sx={{ transform: "rotate(-90deg)", display: "block" }}
      >
        <defs>
          <linearGradient id="vpn-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--brand-primary, #38bdf8)" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(51,65,85,0.86)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#vpn-ring-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </Box>
      <Stack
        alignItems="center"
        justifyContent="center"
        sx={{ position: "absolute", inset: 0, textAlign: "center" }}
      >
        <Typography sx={{ color: "#f8fafc", fontSize: 26, fontWeight: 850, lineHeight: 1 }}>
          {primary}
        </Typography>
        <Typography sx={{ color: "#9aa8bd", fontSize: 12, fontWeight: 700, mt: 0.65 }}>
          {secondary}
        </Typography>
        {caption ? (
          <Typography sx={{ color: "#7d8ca3", fontSize: 10.5, mt: 0.15 }}>
            {caption}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
}

export function SuccessDotIcon() {
  return <CheckCircleRoundedIcon sx={{ color: "inherit !important", fontSize: 14 }} />;
}
