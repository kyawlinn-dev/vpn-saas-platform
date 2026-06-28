import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import { api } from "../lib/api";
import { formatMMK } from "../lib/format";
import type { Plan } from "../types/api";

interface Props {
  plans: Plan[];
  onSuccess: () => Promise<void>;
  onCancel?: () => void;
}

const initialForm = {
  full_name: "",
  contact: "",
  plan_id: "",
  payment_status: "paid",
  payment_note: "",
  notes: "",
};

function splitContact(contact: string) {
  const cleaned = contact.trim();
  if (!cleaned) {
    return { phone: "", telegram_username: "" };
  }

  // Starts with "@" or contains letters/underscores → Telegram username
  const looksLikeTelegram = cleaned.startsWith("@") || /[a-zA-Z_]/.test(cleaned);

  if (looksLikeTelegram) {
    return {
      phone: "",
      telegram_username: cleaned.replace(/^@/, ""),
    };
  }

  return {
    phone: cleaned,
    telegram_username: "",
  };
}

function PlanPreview({ plan }: { plan: Plan | undefined }) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";

  if (!plan) {
    return (
      <Alert severity="info">
        <Typography variant="body2">Select a plan to see details.</Typography>
      </Alert>
    );
  }

  const dataLabel = plan.data_limit_gb ? `${plan.data_limit_gb} GB` : "Unlimited data";
  const devicesLabel = plan.max_devices ? `${plan.max_devices} device${plan.max_devices > 1 ? "s" : ""}` : "Unlimited devices";

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: `1.5px solid ${dark ? alpha("#7c3aed", 0.25) : alpha("#7c3aed", 0.2)}`,
        bgcolor: dark ? alpha("#7c3aed", 0.07) : alpha("#7c3aed", 0.04),
        px: 2,
        py: 1.5,
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Stack spacing={0.25}>
          <Typography variant="body2" fontWeight={700} color="primary">
            {plan.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {plan.duration_days} days · {dataLabel} · {devicesLabel}
          </Typography>
        </Stack>
        <Typography variant="body1" fontWeight={800} color="primary" sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>
          {formatMMK(plan.price_mmk)}
        </Typography>
      </Stack>
    </Box>
  );
}

export function OrderForm({ plans, onSuccess, onCancel }: Props) {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Auto-select first plan once plans are available
  useEffect(() => {
    if (!form.plan_id && plans[0]) {
      setForm((prev) => ({ ...prev, plan_id: plans[0].id }));
    }
  }, [plans, form.plan_id]);

  const selectedPlan = useMemo(
    () => plans.find((item) => item.id === form.plan_id),
    [plans, form.plan_id]
  );

  const canSubmit = form.full_name.trim().length > 0 && !!form.plan_id && !loading;

  const submit = async () => {
    if (!canSubmit) return;

    try {
      setLoading(true);
      setError("");

      const { phone, telegram_username } = splitContact(form.contact);

      await api.post("/reseller/orders", {
        full_name: form.full_name.trim(),
        plan_id: form.plan_id,
        payment_status: form.payment_status,
        payment_note: form.payment_note.trim() || null,
        notes: form.notes.trim() || null,
        phone: phone || null,
        telegram_username: telegram_username || null,
      });

      setForm({
        ...initialForm,
        plan_id: plans[0]?.id || "",
      });

      await onSuccess();
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      const data = (e?.response as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
      setError((data?.error as string) || (e?.message as string) || "Failed to create order");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={2.5}>
      {error ? <Alert severity="error" onClose={() => setError("")}>{error}</Alert> : null}

      <Grid container spacing={2}>
        <Grid size={12}>
          <TextField
            fullWidth
            required
            label="Customer name"
            placeholder="Enter customer name"
            value={form.full_name}
            onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
            inputProps={{ maxLength: 120 }}
          />
        </Grid>

        <Grid size={12}>
          <TextField
            fullWidth
            label="Phone or Telegram"
            placeholder="09xxxxxxxx  or  @username"
            value={form.contact}
            onChange={(e) => setForm((prev) => ({ ...prev, contact: e.target.value }))}
            helperText="Optional. Phone number or Telegram username (with or without @)."
            inputProps={{ maxLength: 80 }}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            fullWidth
            label="Plan"
            value={form.plan_id}
            onChange={(e) => setForm((prev) => ({ ...prev, plan_id: e.target.value }))}
          >
            {plans.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.name} — {formatMMK(item.price_mmk)} / {item.duration_days}d
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            fullWidth
            label="Payment status"
            value={form.payment_status}
            onChange={(e) => setForm((prev) => ({ ...prev, payment_status: e.target.value }))}
          >
            <MenuItem value="paid">Paid</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="unpaid">Unpaid</MenuItem>
            <MenuItem value="overdue">Overdue</MenuItem>
          </TextField>
        </Grid>

        <Grid size={12}>
          <TextField
            fullWidth
            label="Payment note"
            placeholder="Optional — e.g. receipt number or transaction ID"
            value={form.payment_note}
            onChange={(e) => setForm((prev) => ({ ...prev, payment_note: e.target.value }))}
            inputProps={{ maxLength: 255 }}
          />
        </Grid>

        <Grid size={12}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Notes"
            placeholder="Optional — internal notes about this customer or order"
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            inputProps={{ maxLength: 500 }}
          />
        </Grid>
      </Grid>

      <PlanPreview plan={selectedPlan} />

      <Stack direction={{ xs: "column-reverse", sm: "row" }} justifyContent="flex-end" spacing={1.5}>
        {onCancel ? (
          <Button variant="outlined" color="inherit" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        ) : null}

        <Button
          variant="contained"
          size="large"
          onClick={() => void submit()}
          disabled={!canSubmit}
        >
          {loading ? "Creating…" : "Create Order"}
        </Button>
      </Stack>
    </Stack>
  );
}