import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
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
  if (!plan) {
    return (
      <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
        Select a plan to see details.
      </div>
    );
  }

  const dataLabel = plan.data_limit_gb ? `${plan.data_limit_gb} GB` : "Unlimited data";
  const devicesLabel = plan.max_devices
    ? `${plan.max_devices} device${plan.max_devices > 1 ? "s" : ""}`
    : "Unlimited devices";

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-primary">{plan.name}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {plan.duration_days} days · {dataLabel} · {devicesLabel}
        </div>
      </div>
      <div className="shrink-0 whitespace-nowrap text-base font-bold text-primary">
        {formatMMK(plan.price_mmk)}
      </div>
    </div>
  );
}

export function OrderForm({ plans, onSuccess, onCancel }: Props) {
  const [form, setForm] = useState(initialForm);
  const durations = useMemo(
    () => Array.from(new Set(plans.map((plan) => plan.duration_days))).sort((a, b) => a - b),
    [plans]
  );
  const [duration, setDuration] = useState<number | "all">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const filteredPlans = useMemo(
    () => plans.filter((plan) => duration === "all" || plan.duration_days === duration),
    [plans, duration]
  );

  // Auto-select first plan once plans are available
  useEffect(() => {
    const currentVisible = filteredPlans.some((plan) => plan.id === form.plan_id);
    if ((!form.plan_id || !currentVisible) && filteredPlans[0]) {
      setForm((prev) => ({ ...prev, plan_id: filteredPlans[0].id }));
    }
  }, [filteredPlans, form.plan_id]);

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
        payment_status: "paid",
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
    <form
      className="flex min-h-full flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      ) : null}

      <div className="space-y-4 pb-4">
        <FormField label="Customer name" required>
          <Input
            value={form.full_name}
            onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
            placeholder="Enter customer name"
            maxLength={120}
          />
        </FormField>

        <FormField
          label="Phone or Telegram"
          hint="Optional. Phone number or Telegram username (with or without @)."
        >
          <Input
            value={form.contact}
            onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))}
            placeholder="09xxxxxxxx  or  @username"
            maxLength={80}
          />
        </FormField>

        {durations.length > 1 ? (
          <div>
            <div className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
              Duration
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              <Button
                variant={duration === "all" ? "primary" : "outline"}
                size="sm"
                onClick={() => setDuration("all")}
                type="button"
                className="shrink-0"
              >
                All
              </Button>
              {durations.map((days) => (
                <Button
                  key={days}
                  variant={duration === days ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setDuration(days)}
                  type="button"
                  className="shrink-0"
                >
                  {days} days
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <FormField label="Plan">
            <Select
              value={form.plan_id}
              onChange={(e) => setForm((p) => ({ ...p, plan_id: e.target.value }))}
            >
              {filteredPlans.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {formatMMK(item.price_mmk)} / {item.duration_days}d
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <PlanPreview plan={selectedPlan} />

        <FormField label="Payment note">
          <Input
            value={form.payment_note}
            onChange={(e) => setForm((p) => ({ ...p, payment_note: e.target.value }))}
            placeholder="Optional — e.g. receipt number or transaction ID"
            maxLength={255}
          />
        </FormField>

        <FormField label="Notes">
          <Textarea
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Optional — internal notes about this customer or order"
            maxLength={500}
            rows={2}
          />
        </FormField>
      </div>

      <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col-reverse gap-2 border-t border-border/70 bg-card/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:-mx-0 sm:flex-row sm:justify-end sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:backdrop-blur-none">
        {onCancel ? (
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            type="button"
            fullWidth
            className="sm:w-auto"
          >
            Cancel
          </Button>
        ) : null}
        <Button variant="primary" disabled={!canSubmit} type="submit" fullWidth className="sm:w-auto">
          {loading ? "Creating…" : "Create Order"}
        </Button>
      </div>
    </form>
  );
}
