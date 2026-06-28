import Button from "@mui/material/Button";

export default function SecondaryButton({ children, sx, ...props }) {
  return (
    <Button
      fullWidth
      variant="contained"
      sx={{
        py: 1.65,
        fontSize: 15,
        background: "rgba(255,255,255,0.94)",
        color: "#101827",
        boxShadow: "none",
        transition: "transform 140ms ease, background-color 140ms ease",
        "&:hover": {
          background: "#ffffff",
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