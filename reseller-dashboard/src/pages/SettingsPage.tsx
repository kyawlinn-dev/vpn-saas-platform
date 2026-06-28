import { useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  Switch,
  TextField,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import { useWorkspaceSettings, type WorkspaceSettingsPatch } from "../hooks/useWorkspaceSettings";
import type { PaymentMethod, WorkspaceSettings } from "../types/api";

// ─── shared helpers ──────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="h6">{title}</Typography>
          {description ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
          ) : null}
        </Box>
        {children}
      </CardContent>
    </Card>
  );
}

function useSave(
  patch: (data: WorkspaceSettingsPatch) => Promise<Record<string, unknown>>,
  onSuccess?: () => void
) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async (data: WorkspaceSettingsPatch) => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await patch(data);
      setSaved(true);
      onSuccess?.();
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return { save, saving, saved, error };
}

// ─── Brand & Contact ─────────────────────────────────────────────────────────

function BrandSection({
  settings,
  patch,
}: {
  settings: WorkspaceSettings;
  patch: (data: WorkspaceSettingsPatch) => Promise<Record<string, unknown>>;
}) {
  const [brandName, setBrandName] = useState(settings.brand_name);
  const [supportUsername, setSupportUsername] = useState(
    settings.support_username.replace(/^@/, "")
  );
  const [brandLogoUrl, setBrandLogoUrl] = useState(settings.brand_logo_url);
  const [primaryColor, setPrimaryColor] = useState(settings.primary_color);
  const { save, saving, saved, error } = useSave(patch);

  return (
    <SectionCard
      title="Brand & Contact"
      description="Displayed in your customer miniapp — brand name, logo, and support handle."
    >
      <Stack spacing={2}>
        <TextField
          label="Miniapp Slug"
          value={settings.miniapp_slug}
          fullWidth
          disabled
          helperText="Changing the slug breaks deployed links — contact admin."
        />
        <TextField
          label="Brand Name"
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          fullWidth
        />
        <TextField
          label="Support Username"
          value={supportUsername}
          onChange={(e) => setSupportUsername(e.target.value.replace(/^@/, ""))}
          fullWidth
          placeholder="novanetvpn"
          helperText="Telegram username without @"
        />
        <TextField
          label="Brand Logo URL"
          value={brandLogoUrl}
          onChange={(e) => setBrandLogoUrl(e.target.value)}
          fullWidth
          placeholder="https://example.com/logo.png"
        />
        <TextField
          label="Primary Color"
          value={primaryColor}
          onChange={(e) => setPrimaryColor(e.target.value)}
          fullWidth
          placeholder="#3b82f6"
        />
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Box>
          <Button
            variant="contained"
            disabled={saving}
            startIcon={saved ? <CheckCircleRoundedIcon /> : undefined}
            onClick={() =>
              void save({
                brand_name: brandName,
                support_username: supportUsername,
                brand_logo_url: brandLogoUrl,
                primary_color: primaryColor,
              })
            }
          >
            {saving ? "Saving…" : saved ? "Saved" : "Save Brand Settings"}
          </Button>
        </Box>
      </Stack>
    </SectionCard>
  );
}

// ─── Trial Settings ───────────────────────────────────────────────────────────

function TrialSection({
  settings,
  patch,
}: {
  settings: WorkspaceSettings;
  patch: (data: WorkspaceSettingsPatch) => Promise<Record<string, unknown>>;
}) {
  const [trialEnabled, setTrialEnabled] = useState(settings.trial_enabled);
  const [dataLimitGb, setDataLimitGb] = useState(
    settings.trial_data_limit_gb != null ? String(settings.trial_data_limit_gb) : ""
  );
  const [durationDays, setDurationDays] = useState(
    settings.trial_duration_days != null ? String(settings.trial_duration_days) : ""
  );
  const { save, saving, saved, error } = useSave(patch);

  return (
    <SectionCard
      title="Trial Settings"
      description="Free trial offered to new customers on first miniapp visit."
    >
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography fontWeight={600}>Enable free trial</Typography>
            <Typography variant="body2" color="text.secondary">
              New customers receive a free trial key automatically.
            </Typography>
          </Box>
          <Switch
            checked={trialEnabled}
            onChange={(e) => setTrialEnabled(e.target.checked)}
          />
        </Stack>

        <Divider />

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label="Data Limit (GB)"
            value={dataLimitGb}
            onChange={(e) => setDataLimitGb(e.target.value)}
            fullWidth
            type="number"
            disabled={!trialEnabled}
            inputProps={{ min: 0, step: 0.5 }}
          />
          <TextField
            label="Duration (days)"
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            fullWidth
            type="number"
            disabled={!trialEnabled}
            inputProps={{ min: 1, step: 1 }}
          />
        </Stack>

        {error ? <Alert severity="error">{error}</Alert> : null}
        <Box>
          <Button
            variant="contained"
            disabled={saving}
            startIcon={saved ? <CheckCircleRoundedIcon /> : undefined}
            onClick={() =>
              void save({
                trial_enabled: trialEnabled,
                trial_data_limit_gb: dataLimitGb !== "" ? Number(dataLimitGb) : null,
                trial_duration_days: durationDays !== "" ? Number(durationDays) : null,
              })
            }
          >
            {saving ? "Saving…" : saved ? "Saved" : "Save Trial Settings"}
          </Button>
        </Box>
      </Stack>
    </SectionCard>
  );
}

// ─── Payment Methods ──────────────────────────────────────────────────────────

function PaymentSection({
  settings,
  patch,
}: {
  settings: WorkspaceSettings;
  patch: (data: WorkspaceSettingsPatch) => Promise<Record<string, unknown>>;
}) {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const [methods, setMethods] = useState<PaymentMethod[]>(settings.payment_info);
  const { save, saving, saved, error } = useSave(patch);

  const addMethod = () =>
    setMethods((prev) => [
      ...prev,
      { method: "KBZPay", account_name: "", account_number: "" },
    ]);

  const removeMethod = (i: number) =>
    setMethods((prev) => prev.filter((_, idx) => idx !== i));

  const updateMethod = (i: number, field: keyof PaymentMethod, value: string) =>
    setMethods((prev) =>
      prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m))
    );

  return (
    <SectionCard
      title="Payment Methods"
      description="Customers see these in the purchase dialog. Replaces manual SQL edits to payment_info."
    >
      <Stack spacing={2}>
        {methods.length === 0 ? (
          <Alert severity="info">
            No payment methods configured. Add one below so customers can see where to pay.
          </Alert>
        ) : (
          methods.map((m, i) => (
            <Card
              key={i}
              variant="outlined"
              sx={{
                p: 2,
                bgcolor: dark ? alpha("#fff", 0.02) : alpha("#000", 0.01),
              }}
            >
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" fontWeight={700} color="text.secondary">
                    Method #{i + 1}
                  </Typography>
                  <IconButton size="small" color="error" onClick={() => removeMethod(i)}>
                    <DeleteOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <TextField
                  label="Method name (e.g. KBZPay, Wave Money)"
                  value={m.method}
                  onChange={(e) => updateMethod(i, "method", e.target.value)}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Account Name"
                  value={m.account_name}
                  onChange={(e) => updateMethod(i, "account_name", e.target.value)}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Account Number"
                  value={m.account_number}
                  onChange={(e) => updateMethod(i, "account_number", e.target.value)}
                  fullWidth
                  size="small"
                />
              </Stack>
            </Card>
          ))
        )}

        <Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddRoundedIcon />}
            onClick={addMethod}
          >
            Add Payment Method
          </Button>
        </Box>

        {error ? <Alert severity="error">{error}</Alert> : null}
        <Box>
          <Button
            variant="contained"
            disabled={saving}
            startIcon={saved ? <CheckCircleRoundedIcon /> : undefined}
            onClick={() => void save({ payment_info: methods })}
          >
            {saving ? "Saving…" : saved ? "Saved" : "Save Payment Methods"}
          </Button>
        </Box>
      </Stack>
    </SectionCard>
  );
}

// ─── Telegram Bot ─────────────────────────────────────────────────────────────

function BotTokenSection({
  settings,
  patch,
}: {
  settings: WorkspaceSettings;
  patch: (data: WorkspaceSettingsPatch) => Promise<Record<string, unknown>>;
}) {
  const [botToken, setBotToken] = useState("");
  const [botConnected, setBotConnected] = useState(settings.bot_connected);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [regWarning, setRegWarning] = useState("");

  const handleSave = async () => {
    if (!botToken.trim()) return;
    setSaving(true);
    setSaveError("");
    setRegWarning("");
    setSaved(false);
    try {
      const result = await patch({ bot_token: botToken });
      setSaved(true);
      setBotToken("");
      setTimeout(() => setSaved(false), 3000);
      if (result?.bot_registered === true) {
        setBotConnected(true);
      } else if (result?.bot_registered === false) {
        setRegWarning(
          String(result?.bot_error || "Token saved but webhook registration failed — check your bot token.")
        );
        setBotConnected(false);
      }
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Telegram Bot"
      description="Your bot token from @BotFather. Encrypted at rest — never shown again after saving."
    >
      <Stack spacing={2.5}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <SmartToyRoundedIcon
            sx={{ color: botConnected ? "success.main" : "text.disabled", fontSize: 28 }}
          />
          <Box>
            <Typography fontWeight={600}>Bot Token Status</Typography>
            <Chip
              size="small"
              label={botConnected ? "Token configured & webhook active" : "No token set"}
              sx={{
                mt: 0.5,
                fontWeight: 700,
                ...(botConnected
                  ? {
                      bgcolor: "rgba(16,185,129,0.14)",
                      color: "#10b981",
                      border: "1px solid rgba(16,185,129,0.3)",
                    }
                  : {
                      bgcolor: "rgba(245,158,11,0.14)",
                      color: "#f59e0b",
                      border: "1px solid rgba(245,158,11,0.3)",
                    }),
              }}
            />
          </Box>
        </Stack>

        <Divider />

        <Stack spacing={1}>
          <Typography variant="body2" fontWeight={600}>
            {botConnected ? "Replace bot token" : "Set bot token"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {botConnected
              ? "The current token is encrypted and never shown. Enter a new token to replace it."
              : "Paste the token from @BotFather. It will be encrypted before storage."}
          </Typography>
          <TextField
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            fullWidth
            placeholder="123456789:ABCdef…"
            autoComplete="new-password"
          />
        </Stack>

        <Alert severity="info" sx={{ fontSize: "0.82rem" }}>
          Write-only. Tokens are encrypted with AES-256-GCM and never returned by the API.
          The bot goes live immediately — webhook registration happens on save.
        </Alert>

        {regWarning ? <Alert severity="warning">{regWarning}</Alert> : null}
        {saveError ? <Alert severity="error">{saveError}</Alert> : null}

        <Box>
          <Button
            variant="contained"
            disabled={saving || !botToken.trim()}
            startIcon={saved ? <CheckCircleRoundedIcon /> : undefined}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving & registering…" : saved ? "Token Saved" : "Save Bot Token"}
          </Button>
        </Box>
      </Stack>
    </SectionCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { settings, loading, error, patch } = useWorkspaceSettings();

  if (loading) return <LinearProgress />;

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!settings) return null;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Workspace Settings</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          Configure your branded miniapp, trial offer, payment details, and Telegram bot.
        </Typography>
      </Box>

      <BrandSection settings={settings} patch={patch} />
      <TrialSection settings={settings} patch={patch} />
      <PaymentSection settings={settings} patch={patch} />
      <BotTokenSection settings={settings} patch={patch} />
    </Stack>
  );
}
