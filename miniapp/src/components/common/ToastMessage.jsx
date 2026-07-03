import { Alert, Snackbar } from "@mui/material";

export default function ToastMessage({ open, message, severity = "info", onClose }) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={1800}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert
        onClose={onClose}
        severity={severity}
        variant="filled"
        sx={{
          borderRadius: 3,
          fontWeight: 700,
          boxShadow: "0 14px 30px rgba(0,0,0,0.3)",
          fontSize: 13,
        }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
