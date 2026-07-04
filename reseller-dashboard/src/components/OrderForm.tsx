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
  if (!plan) {
    return (
      <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
        Select a plan to see details.
      </div>
    );
  }

  const dataLabel = plan.data_limit_gb ? `${plan.data_limit_gb} GB` : "Unlimited data";
  const devicesLabel = plan.max_devices
    ? `${plan.max_devices} device${plan.max_devices > 1 ? "s" : ""}`
    : "Unlimited devices";

  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 flex items-start justify-between gap-2">
      <div>
        <div className="text-sm font-semibold text-primary">{plan.name}</div>
        <div className="text-xs text-muted-foreground">
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
    <div className="space-y-5">
      {error ? (
        <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      ) : null}

      <div className="space-y-4">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Plan">
            <Select
              value={form.plan_id}
              onChange={(e) => setForm((p) => ({ ...p, plan_id: e.target.value }))}
            >
              {plans.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {formatMMK(item.price_mmk)} / {item.duration_days}d
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Payment status">
            <Select
              value={form.payment_status}
              onChange={(e) => setForm((p) => ({ ...p, payment_status: e.target.value }))}
            >
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="unpaid">Unpaid</option>
              <option value="overdue">Overdue</option>
            </Select>
          </FormField>
        </div>

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

      <PlanPreview plan={selectedPlan} />

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        {onCancel ? (
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        ) : null}
        <Button variant="primary" onClick={() => void submit()} disabled={!canSubmit}>
          {loading ? "Creating…" : "Create Order"}
        </Button>
      </div>
    </div>
  );
}
