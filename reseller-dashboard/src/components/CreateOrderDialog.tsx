import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { OrderForm } from "./OrderForm";
import type { Plan } from "../types/api";

interface Props {
  open: boolean;
  plans: Plan[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}

export function CreateOrderDialog({ open, plans, onClose, onCreated }: Props) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={mobile}
      PaperProps={{
        sx: {
          borderRadius: mobile ? 0 : 4,
          backgroundImage: "none",
        },
      }}
    >
      <DialogTitle sx={{ pb: 1.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
          <Stack spacing={0.5}>
            <Typography variant="h6">Create Order</Typography>
            <Typography variant="body2" color="text.secondary">
              Fast reseller order entry. Name is required. Contact is optional.
            </Typography>
          </Stack>

          <IconButton onClick={onClose} size="small">
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ pt: 3 }}>
        <OrderForm plans={plans} onSuccess={onCreated} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}