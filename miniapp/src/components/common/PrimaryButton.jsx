import Button from "@mui/material/Button";

export default function PrimaryButton({ children, sx, ...props }) {
  return (
    <Button
      fullWidth
      variant="contained"
      sx={{
        py: 1.65,
        fontSize: 15,
        color: "#fff",
        background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 52%, #38bdf8 100%)",
        boxShadow: "0 14px 32px rgba(37,99,235,0.34)",
        transition: "transform 140ms ease, box-shadow 140ms ease, filter 140ms ease",
        "&:hover": {
          background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 52%, #38bdf8 100%)",
          boxShadow: "0 16px 36px rgba(37,99,235,0.42)",
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
