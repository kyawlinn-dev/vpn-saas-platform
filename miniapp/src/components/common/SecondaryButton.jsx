import Button from "@mui/material/Button";

export default function SecondaryButton({ children, sx, ...props }) {
  return (
    <Button
      fullWidth
      variant="contained"
      sx={{
        minHeight: 47,
        py: 1.15,
        fontSize: 14,
        background: "rgba(148,163,184,0.12)",
        color: "#e5eefc",
        border: "1px solid rgba(148,163,184,0.18)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
        transition: "transform 140ms ease, background-color 140ms ease, border-color 140ms ease",
        "&:hover": {
          background: "rgba(148,163,184,0.18)",
          borderColor: "rgba(148,163,184,0.28)",
        },
        "&:active": {
          transform: "translateY(1px) scale(0.995)",
        },
        ...sx,
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
