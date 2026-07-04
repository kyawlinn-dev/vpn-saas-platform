import { useState } from "react";
import { Package, Users, TrendingUp, DollarSign, Wifi } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/ui/form-field";
import { Chip } from "@/components/ui/chip";
import { FilterChips } from "@/components/ui/filter-chips";
import { Switch } from "@/components/ui/switch";
import { UsageBar } from "@/components/ui/usage-bar";
import { StatCard } from "@/components/ui/stat-card";
import { PlanCard } from "@/components/ui/plan-card";

type FilterValue = "all" | "active" | "pending" | "stopped";

const FILTER_OPTIONS: { value: FilterValue; label: string; count: number }[] = [
  { value: "all", label: "All", count: 42 },
  { value: "active", label: "Active", count: 28 },
  { value: "pending", label: "Pending", count: 9 },
  { value: "stopped", label: "Stopped", count: 5 },
];

const FAKE_ROWS = [
  { id: "1", name: "Kyaw Zin", plan: "30GB / 30d", status: "active", expiry: "2026-07-30" },
  { id: "2", name: "Mg Mg", plan: "10GB / 7d", status: "pending_review", expiry: "2026-07-10" },
  { id: "3", name: "Ma Aye", plan: "Unlimited / 30d", status: "expired", expiry: "2026-06-01" },
];

const SAMPLE_PLANS = [
  { name: "Starter 10GB", price_mmk: 5000, duration_days: 30, data_limit_gb: 10, max_devices: 2, is_active: true },
  { name: "Pro 50GB", price_mmk: 15000, duration_days: 30, data_limit_gb: 50, max_devices: 5, is_active: true },
  { name: "Legacy", price_mmk: 3000, duration_days: 7, data_limit_gb: null, max_devices: null, is_active: false },
];

const ALL_STATUSES = [
  "active", "paid", "confirmed",
  "pending", "pending_review", "overdue",
  "expired", "rejected",
  "stopped", "deleted", "unpaid", "refunded",
  "trial", "purchase",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-lg font-semibold text-foreground border-b border-border pb-2">{title}</h2>
      {children}
    </section>
  );
}

export default function UiPreview() {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [switchA, setSwitchA] = useState(false);
  const [switchB, setSwitchB] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(0);

  return (
    <div className="bg-background min-h-screen p-8 space-y-12">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">UI Preview</h1>
        <p className="text-muted-foreground mt-1">Phase 1 primitive component gallery — light Flup style</p>
      </div>

      {/* ── Buttons ── */}
      <Section title="Button — variants">
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="destructiveOutline">Destructive Outline</Button>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <Button size="sm" variant="primary">Small</Button>
          <Button size="md" variant="primary">Medium</Button>
          <Button size="lg" variant="primary">Large</Button>
          <Button size="icon" variant="outline"><Package className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <Button loading>Loading</Button>
          <Button loading variant="secondary">Loading secondary</Button>
          <Button leftIcon={<Package className="h-4 w-4" />} variant="outline">Left icon</Button>
          <Button rightIcon={<TrendingUp className="h-4 w-4" />} variant="primary">Right icon</Button>
          <Button fullWidth variant="secondary">Full width</Button>
        </div>
      </Section>

      {/* ── Action Button ── */}
      <Section title="ActionButton">
        <div className="flex flex-wrap gap-3">
          <ActionButton variant="primary">Activate</ActionButton>
          <ActionButton variant="secondary">Edit</ActionButton>
          <ActionButton variant="destructiveOutline">Stop</ActionButton>
          <ActionButton loading loadingText="Activating…" variant="primary">Activate</ActionButton>
        </div>
      </Section>

      {/* ── Badges ── */}
      <Section title="Badge — variants">
        <div className="flex flex-wrap gap-2">
          <Badge variant="default">Default</Badge>
          <Badge variant="primary">Primary</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </Section>

      {/* ── StatusBadge ── */}
      <Section title="StatusBadge — all statuses">
        <div className="flex flex-wrap gap-2">
          {ALL_STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </Section>

      {/* ── Chips ── */}
      <Section title="Chip — tones">
        <div className="flex flex-wrap gap-2">
          <Chip tone="primary">Primary</Chip>
          <Chip tone="blue">Blue</Chip>
          <Chip tone="success">Success</Chip>
          <Chip tone="warning">Warning</Chip>
          <Chip tone="muted">Muted</Chip>
          <Chip tone="muted" icon={<Wifi className="h-3 w-3" />}>With icon</Chip>
        </div>
      </Section>

      {/* ── FilterChips ── */}
      <Section title="FilterChips">
        <FilterChips value={filter} onChange={setFilter} options={FILTER_OPTIONS} />
        <p className="text-xs text-muted-foreground">Selected: {filter}</p>
      </Section>

      {/* ── Switch ── */}
      <Section title="Switch">
        <div className="flex flex-wrap gap-6 items-center">
          <div className="flex items-center gap-2">
            <Switch checked={switchA} onCheckedChange={setSwitchA} id="sw-a" />
            <Label htmlFor="sw-a">{switchA ? "On" : "Off"}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={switchB} onCheckedChange={setSwitchB} id="sw-b" />
            <Label htmlFor="sw-b">Toggle me</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked disabled onCheckedChange={() => {}} />
            <Label>Disabled on</Label>
          </div>
        </div>
      </Section>

      {/* ── Card ── */}
      <Section title="Card">
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Order #12345</CardTitle>
            <CardDescription>Created 3 days ago · expires July 30</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">30 GB plan · 2 devices</p>
          </CardContent>
          <CardFooter className="gap-2">
            <Button size="sm" variant="outline">Edit</Button>
            <Button size="sm" variant="primary">Renew</Button>
          </CardFooter>
        </Card>
      </Section>

      {/* ── StatCards ── */}
      <Section title="StatCard — all 5 accents">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label="Total Orders"
            value="1,284"
            delta={{ label: "+12% this month", trend: "up" }}
            caption="vs last month"
            icon={<Package className="h-5 w-5" />}
            accent="violet"
          />
          <StatCard
            label="Active Customers"
            value="847"
            delta={{ label: "+5 today", trend: "up" }}
            icon={<Users className="h-5 w-5" />}
            accent="blue"
          />
          <StatCard
            label="Revenue"
            value="4.2M MMK"
            delta={{ label: "−8% this week", trend: "down" }}
            icon={<DollarSign className="h-5 w-5" />}
            accent="emerald"
          />
          <StatCard
            label="Pending Review"
            value="23"
            caption="needs action"
            icon={<TrendingUp className="h-5 w-5" />}
            accent="amber"
          />
          <StatCard
            label="Servers"
            value="5"
            delta={{ label: "no change", trend: "neutral" }}
            icon={<Wifi className="h-5 w-5" />}
            accent="slate"
          />
        </div>
      </Section>

      {/* ── DataTable ── */}
      <Section title="DataTable">
        <DataTable
          columns={[
            { key: "name", header: "Customer", render: (r) => r.name },
            { key: "plan", header: "Plan", render: (r) => r.plan },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
            { key: "expiry", header: "Expiry", render: (r) => r.expiry },
            {
              key: "action",
              header: "",
              render: () => <ActionButton variant="outline">View</ActionButton>,
            },
          ]}
          rows={FAKE_ROWS}
          getRowKey={(r) => r.id}
        />
      </Section>

      {/* ── PlanCards ── */}
      <Section title="PlanCard">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 max-w-2xl">
          {SAMPLE_PLANS.map((p, i) => (
            <PlanCard
              key={p.name}
              plan={p}
              selected={selectedPlan === i}
              onSelect={() => setSelectedPlan(i)}
            />
          ))}
        </div>
      </Section>

      {/* ── UsageBar ── */}
      <Section title="UsageBar — thresholds">
        <div className="max-w-sm space-y-6">
          <div>
            <p className="text-xs text-muted-foreground mb-2">~40% used</p>
            <UsageBar used={4} limit={10} remaining={6} connections={12} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">~75% used (warning)</p>
            <UsageBar used={7.5} limit={10} remaining={2.5} connections={3} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">~95% used (critical)</p>
            <UsageBar used={9.5} limit={10} remaining={0.5} connections={1} />
          </div>
        </div>
      </Section>

      {/* ── Form Fields ── */}
      <Section title="FormField + Input / Textarea / Select">
        <div className="max-w-sm space-y-4">
          <FormField label="Customer name" htmlFor="f-name" required>
            <Input id="f-name" placeholder="e.g. Kyaw Zin" />
          </FormField>
          <FormField label="Notes" htmlFor="f-notes" hint="Optional internal notes">
            <Textarea id="f-notes" placeholder="Write something…" />
          </FormField>
          <FormField label="Plan" htmlFor="f-plan" required error="Please select a plan">
            <Select id="f-plan">
              <option value="">Choose plan…</option>
              <option value="starter">Starter 10GB</option>
              <option value="pro">Pro 50GB</option>
            </Select>
          </FormField>
        </div>
      </Section>

      {/* ── Dialog ── */}
      <Section title="Dialog">
        <Button variant="primary" onClick={() => setDialogOpen(true)}>
          Open Dialog
        </Button>
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} size="md">
          <DialogClose />
          <DialogHeader>
            <DialogTitle>Create new order</DialogTitle>
            <DialogDescription>Fill in the details below to provision a new VPN key.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <FormField label="Customer" htmlFor="d-customer" required>
                <Input id="d-customer" placeholder="Customer name or phone" />
              </FormField>
              <FormField label="Plan" htmlFor="d-plan">
                <Select id="d-plan">
                  <option value="">Choose plan…</option>
                  <option value="starter">Starter 10GB</option>
                  <option value="pro">Pro 50GB</option>
                </Select>
              </FormField>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="primary">Create Order</Button>
          </DialogFooter>
        </Dialog>
      </Section>
    </div>
  );
}
