import { useState } from "react";
import { Check, Plus, Trash2, Bot } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
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
  const { save, saving, saved, error } = useSave(patch);

  return (
    <SectionCard
      title="Brand & Contact"
      description="Displayed in your customer miniapp — brand name and support handle."
    >
      <div className="space-y-3">
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
            })
          }
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save Brand Settings"}
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

// ─── Telegram Bot (read-only status) ──────────────────────────────────────────

function getBotStatusLabel(status: BotStatus | undefined) {
  if (!status?.token_saved) return "Not set up yet";
  if (status.connected) {
    return status.bot_username ? `Connected @${status.bot_username}` : "Connected";
  }
  return "Not connected";
}

function BotStatusSection({ settings }: { settings: WorkspaceSettings }) {
  const botStatus = settings.bot_status;
  const connected = Boolean(botStatus?.connected);

  return (
    <SectionCard
      title="Telegram Bot"
      description="Your bot is set up by the NovaNet admin — this is a read-only status."
    >
      <div className="flex items-center gap-3">
        <Bot size={26} className={connected ? "text-[color:var(--success)]" : "text-muted-foreground"} />
        <div>
          <div className="text-sm font-medium text-foreground">Bot Status</div>
          <div className="mt-1">
            <Badge variant={connected ? "success" : "warning"}>{getBotStatusLabel(botStatus)}</Badge>
          </div>
        </div>
      </div>
      {!connected ? (
        <p className="mt-3 text-xs text-muted-foreground">
          If this should be connected, message the admin to set up or fix your bot token.
        </p>
      ) : null}
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
        {Array.from({ length: 3 }).map((_, i) => (
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
          Brand contact info and payment details customers see in your miniapp.
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <BrandSection settings={settings} patch={patch} />
        <BotStatusSection settings={settings} />
        <PaymentSection settings={settings} patch={patch} />
      </div>
    </div>
  );
}
