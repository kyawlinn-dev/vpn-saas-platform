import Button from "@mui/material/Button";

export default function PrimaryButton({ children, sx, ...props }) {
  return (
    <Button
      fullWidth
      variant="contained"
      sx={{
        minHeight: 47,
        py: 1.15,
        fontSize: 14,
        color: "#fff",
        background:
          "linear-gradient(135deg, var(--brand-primary, #2563eb) 0%, #2563eb 52%, #22d3ee 100%)",
        boxShadow: "0 14px 28px rgba(37,99,235,0.26)",
        transition: "transform 140ms ease, box-shadow 140ms ease, filter 140ms ease",
        "&:hover": {
          background:
            "linear-gradient(135deg, var(--brand-primary, #3b82f6) 0%, #3b82f6 52%, #67e8f9 100%)",
          boxShadow: "0 16px 34px rgba(37,99,235,0.34)",
        },
        "&:active": {
          transform: "translateY(1px) scale(0.995)",
          filter: "brightness(0.98)",
        },
        ...sx,
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
