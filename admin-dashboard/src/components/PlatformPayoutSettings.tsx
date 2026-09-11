import { useEffect, useState } from "react";
import { Wallet, Plus, Trash2, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

interface PayoutAccount {
  method: string;
  account_name: string;
  account_number: string;
  note: string;
}

interface PlatformSettings {
  payment_accounts: PayoutAccount[];
  settlement_instructions: string | null;
  updated_at: string | null;
}

const EMPTY_ACCOUNT: PayoutAccount = { method: "", account_name: "", account_number: "", note: "" };

// Admin config for how resellers pay the platform. Shown at the top of the
// Settlements page. Resellers see these accounts on their Accounting screen.
export function PlatformPayoutSettings() {
  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await api.get<PlatformSettings>("/admin/platform-settings");
        if (!active) return;
        setAccounts(res.data?.payment_accounts?.length ? res.data.payment_accounts : [{ ...EMPTY_ACCOUNT }]);
        setInstructions(res.data?.settlement_instructions ?? "");
      } catch (err: any) {
        if (active) setError(err?.response?.data?.error || "Failed to load platform settings");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const update = (i: number, field: keyof PayoutAccount, value: string) => {
    setAccounts((prev) => prev.map((a, idx) => (idx === i ? { ...a, [field]: value } : a)));
    setSaved(false);
  };
  const addRow = () => setAccounts((prev) => [...prev, { ...EMPTY_ACCOUNT }]);
  const removeRow = (i: number) => setAccounts((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    try {
      setSaving(true);
      setError("");
      const cleaned = accounts.filter((a) => a.method.trim() || a.account_number.trim() || a.account_name.trim());
      const res = await api.put<PlatformSettings>("/admin/platform-settings", {
        payment_accounts: cleaned,
        settlement_instructions: instructions.trim() || null,
      });
      setAccounts(res.data?.payment_accounts?.length ? res.data.payment_accounts : [{ ...EMPTY_ACCOUNT }]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Wallet size={17} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground">Platform Payout Accounts</h2>
          <p className="text-[11px] text-muted-foreground">
            Where resellers pay you. These show on every reseller's settlement screen.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-lg bg-secondary/50" />
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Instruction (optional)
            </label>
            <Textarea
              value={instructions}
              onChange={(e) => { setInstructions(e.target.value); setSaved(false); }}
              placeholder="e.g. Transfer your monthly platform amount to any account below, then upload proof."
              className="mt-1 min-h-14 resize-none text-sm"
            />
          </div>

          <div className="space-y-2">
            {accounts.map((acc, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-2.5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input value={acc.method} onChange={(e) => update(i, "method", e.target.value)} placeholder="Method (e.g. KBZ Pay)" className="h-8 text-sm" />
                  <Input value={acc.account_number} onChange={(e) => update(i, "account_number", e.target.value)} placeholder="Account number" className="h-8 text-sm" />
                  <Input value={acc.account_name} onChange={(e) => update(i, "account_name", e.target.value)} placeholder="Account name" className="h-8 text-sm" />
                  <div className="flex gap-2">
                    <Input value={acc.note} onChange={(e) => update(i, "note", e.target.value)} placeholder="Note (optional)" className="h-8 flex-1 text-sm" />
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeRow(i)} title="Remove">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" leftIcon={<Plus size={14} />} onClick={addRow}>
              Add account
            </Button>
            <Button size="sm" leftIcon={saved ? <Check size={14} /> : <Save size={14} />} loading={saving} onClick={() => void save()}>
              {saved ? "Saved" : "Save payout accounts"}
            </Button>
            {error ? <span className="text-xs text-destructive">{error}</span> : null}
          </div>
        </div>
      )}
    </Card>
  );
}
