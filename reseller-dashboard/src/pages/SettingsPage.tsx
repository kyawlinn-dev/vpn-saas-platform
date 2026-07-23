import { useState } from "react";
import { Check, Plus, Trash2, Bot } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useWorkspaceSettings, type WorkspaceSettingsPatch } from "../hooks/useWorkspaceSettings";
import type { BotStatus, PaymentMethod, WorkspaceSettings } from "../types/api";

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
    <Card className="p-4">
      <div className="mb-3">
        <h2 className="text-sm font-black font-display text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
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
      <div className="space-y-3">
        <FormField label="Miniapp Slug" hint="Changing the slug breaks deployed links — contact admin.">
          <Input value={settings.miniapp_slug} disabled />
        </FormField>

        <FormField label="Brand Name">
          <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} />
        </FormField>

        <FormField label="Support Username" hint="Telegram username without @">
          <Input
            value={supportUsername}
            onChange={(e) => setSupportUsername(e.target.value.replace(/^@/, ""))}
            placeholder="novanetvpn"
          />
        </FormField>

        <FormField label="Brand Logo URL">
          <Input
            value={brandLogoUrl}
            onChange={(e) => setBrandLogoUrl(e.target.value)}
            placeholder="https://example.com/logo.png"
          />
        </FormField>

        <FormField label="Primary Color">
          <Input
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            placeholder="#3b82f6"
          />
        </FormField>

        {error ? (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <Button
          variant="primary"
          disabled={saving}
          leftIcon={saved ? <Check size={16} /> : undefined}
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
      </div>
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
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-foreground">Enable free trial</div>
            <div className="text-sm text-muted-foreground">
              New customers receive a free trial key automatically.
            </div>
          </div>
          <Switch checked={trialEnabled} onCheckedChange={setTrialEnabled} />
        </div>

        <div className="h-px bg-border" />

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <FormField label="Data Limit (GB)">
              <Input
                type="number"
                value={dataLimitGb}
                onChange={(e) => setDataLimitGb(e.target.value)}
                min={0}
                step={0.5}
                disabled={!trialEnabled}
              />
            </FormField>
          </div>
          <div className="flex-1">
            <FormField label="Duration (days)">
              <Input
                type="number"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                min={1}
                step={1}
                disabled={!trialEnabled}
              />
            </FormField>
          </div>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <Button
          variant="primary"
          disabled={saving}
          leftIcon={saved ? <Check size={16} /> : undefined}
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
      </div>
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
      <div className="space-y-4">
        {methods.length === 0 ? (
          <div className="rounded-md border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
            No payment methods configured. Add one below so customers can see where to pay.
          </div>
        ) : (
          methods.map((m, i) => (
            <div key={i} className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">Method #{i + 1}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  onClick={() => removeMethod(i)}
                  title="Remove"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
              <FormField label="Method name (e.g. KBZPay, Wave Money)">
                <Input
                  value={m.method}
                  onChange={(e) => updateMethod(i, "method", e.target.value)}
                />
              </FormField>
              <FormField label="Account Name">
                <Input
                  value={m.account_name}
                  onChange={(e) => updateMethod(i, "account_name", e.target.value)}
                />
              </FormField>
              <FormField label="Account Number">
                <Input
                  value={m.account_number}
                  onChange={(e) => updateMethod(i, "account_number", e.target.value)}
                />
              </FormField>
            </div>
          ))
        )}

        <Button variant="outline" size="sm" leftIcon={<Plus size={15} />} onClick={addMethod}>
          Add Payment Method
        </Button>

        {error ? (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <Button
          variant="primary"
          disabled={saving}
          leftIcon={saved ? <Check size={16} /> : undefined}
          onClick={() => void save({ payment_info: methods })}
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save Payment Methods"}
        </Button>
      </div>
    </SectionCard>
  );
}

// ─── Telegram Bot ─────────────────────────────────────────────────────────────

function getBotStatusLabel(status: BotStatus | undefined) {
  if (!status?.token_saved) return "No token saved";
  if (status.connected) {
    return status.bot_username ? `Connected @${status.bot_username}` : "Connected";
  }
  if (!status.token_valid) return "Token saved but invalid";
  if (!status.webhook_registered) return "Webhook not registered";
  if (!status.running) return "Webhook registered, bot offline";
  return "Token saved, not connected";
}

function getBotStatusHelp(status: BotStatus | undefined) {
  if (!status?.token_saved) return "Paste the token from @BotFather. It will be encrypted before storage.";
  if (status.connected) {
    const idText = status.bot_id ? `Bot ID ${status.bot_id}` : "Telegram identity verified";
    return `${idText}. The token remains encrypted and is never shown.`;
  }
  if (!status.token_valid) return "Telegram rejected the token during registration. Replace it with a valid bot token.";
  if (!status.webhook_registered) return "Token is saved, but Telegram webhook registration did not complete.";
  if (!status.running) return "Webhook is saved, but the backend bot manager is not currently running this bot.";
  return "Token is saved, but the bot is not fully connected.";
}

function BotTokenSection({
  settings,
  patch,
}: {
  settings: WorkspaceSettings;
  patch: (data: WorkspaceSettingsPatch) => Promise<Record<string, unknown>>;
}) {
  const [botToken, setBotToken] = useState("");
  const [botStatus, setBotStatus] = useState<BotStatus>(
    settings.bot_status ?? {
      token_saved: settings.bot_connected,
      token_valid: settings.bot_connected,
      webhook_registered: settings.bot_connected,
      running: settings.bot_connected,
      connected: settings.bot_connected,
      bot_username: null,
      bot_id: null,
      webhook_registered_at: null,
    }
  );
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
      if (result?.bot_status && typeof result.bot_status === "object") {
        setBotStatus(result.bot_status as BotStatus);
      }
      if (result?.bot_registered === true) {
        setBotStatus((prev) => ({
          ...prev,
          token_saved: true,
          token_valid: true,
          webhook_registered: true,
          running: true,
          connected: true,
        }));
      } else if (result?.bot_registered === false) {
        setRegWarning(
          String(result?.bot_error || "Token saved but webhook registration failed — check your bot token.")
        );
        setBotStatus((prev) => ({
          ...prev,
          token_saved: true,
          token_valid: false,
          webhook_registered: false,
          running: false,
          connected: false,
        }));
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
      <div className="space-y-4">
        {/* Status row */}
        <div className="flex items-center gap-3">
          <Bot
            size={26}
            className={botStatus.connected ? "text-[color:var(--success)]" : "text-muted-foreground"}
          />
          <div>
            <div className="text-sm font-medium text-foreground">Bot Token Status</div>
            <div className="mt-1">
              <Badge variant={botStatus.connected ? "success" : "warning"}>
                {getBotStatusLabel(botStatus)}
              </Badge>
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Token input */}
        <div className="space-y-1">
          <div className="text-sm font-medium">
            {botStatus.token_saved ? "Replace bot token" : "Set bot token"}
          </div>
          <div className="text-xs text-muted-foreground">{getBotStatusHelp(botStatus)}</div>
          <Input
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="123456789:ABCdef…"
            autoComplete="new-password"
          />
        </div>

        {/* AES info */}
        <div className="rounded-md border border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
          Write-only. Tokens are encrypted with AES-256-GCM and never returned by the API. The bot
          goes live immediately — webhook registration happens on save.
        </div>

        {regWarning ? (
          <div className="rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-[color:var(--warning)]">
            {regWarning}
          </div>
        ) : null}

        {saveError ? (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {saveError}
          </div>
        ) : null}

        <Button
          variant="primary"
          disabled={saving || !botToken.trim()}
          leftIcon={saved ? <Check size={16} /> : undefined}
          onClick={() => void handleSave()}
        >
          {saving ? "Saving & registering…" : saved ? "Token Saved" : "Save Bot Token"}
        </Button>
      </div>
    </SectionCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { settings, loading, error, patch } = useWorkspaceSettings();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 rounded bg-secondary animate-pulse" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 rounded-lg bg-secondary animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display text-[18px] font-black tracking-tight text-foreground">
          Workspace Settings
        </h1>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Configure your branded miniapp, trial offer, payment details, and Telegram bot.
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <BrandSection settings={settings} patch={patch} />
        <BotTokenSection settings={settings} patch={patch} />
        <TrialSection settings={settings} patch={patch} />
        <PaymentSection settings={settings} patch={patch} />
      </div>
    </div>
  );
}
