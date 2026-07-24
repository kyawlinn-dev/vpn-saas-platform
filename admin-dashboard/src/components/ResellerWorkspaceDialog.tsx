import { useEffect, useState } from 'react';
import { Bot, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogClose, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useResellerWorkspace } from '@/hooks/useResellerWorkspace';
import type { BotStatus, Reseller } from '@/types/api';

function useSave(patch: (data: Record<string, unknown>) => Promise<Record<string, unknown>>, onSaved?: () => void) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const save = async (data: Record<string, unknown>) => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const result = await patch(data);
      setSaved(true);
      onSaved?.();
      setTimeout(() => setSaved(false), 3000);
      return result;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Save failed');
      return null;
    } finally {
      setSaving(false);
    }
  };

  return { save, saving, saved, error };
}

function getBotStatusLabel(status?: BotStatus) {
  if (!status?.token_saved) return 'No token saved';
  if (status.connected) return status.bot_username ? `Connected @${status.bot_username}` : 'Connected';
  if (!status.token_valid) return 'Token saved but invalid';
  if (!status.webhook_registered) return 'Webhook not registered';
  if (!status.running) return 'Webhook registered, bot offline';
  return 'Token saved, not connected';
}

interface Props {
  reseller: Reseller;
  onClose: () => void;
}

export function ResellerWorkspaceDialog({ reseller, onClose }: Props) {
  const { workspace, loading, error: loadError, patch, refresh } = useResellerWorkspace(reseller.id);

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>Mini App — {reseller.name}</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>
      <DialogBody className="space-y-4">
        {loadError ? (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        ) : null}

        {loading && !workspace ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-lg bg-secondary" />
            ))}
          </div>
        ) : workspace ? (
          <>
            <MiniAppSection workspace={workspace} patch={patch} onSaved={refresh} />
            <TrialSection workspace={workspace} patch={patch} onSaved={refresh} />
            <BotTokenSection workspace={workspace} patch={patch} onSaved={refresh} />
          </>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="primary" onClick={onClose}>Close</Button>
      </DialogFooter>
    </Dialog>
  );
}

function MiniAppSection({
  workspace,
  patch,
  onSaved,
}: {
  workspace: NonNullable<ReturnType<typeof useResellerWorkspace>['workspace']>;
  patch: ReturnType<typeof useResellerWorkspace>['patch'];
  onSaved: () => void;
}) {
  const [slug, setSlug] = useState(workspace.miniapp_slug);
  const [logoUrl, setLogoUrl] = useState(workspace.brand_logo_url);
  const [color, setColor] = useState(workspace.primary_color);
  const { save, saving, saved, error } = useSave(patch, onSaved);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Mini App</h3>
        <p className="text-xs text-muted-foreground">
          Slug, logo, and brand color for {workspace.brand_name || 'this reseller'}'s customer mini app.
        </p>
      </div>
      <div className="space-y-3">
        <FormField label="Miniapp Slug" hint="Changing this breaks any links already shared with customers.">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
        </FormField>
        <FormField label="Brand Logo URL">
          <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" />
        </FormField>
        <FormField label="Primary Color">
          <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#3b82f6" />
        </FormField>

        {error ? <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}

        <Button
          variant="primary"
          size="sm"
          disabled={saving}
          leftIcon={saved ? <Check size={14} /> : undefined}
          onClick={() => void save({ miniapp_slug: slug, brand_logo_url: logoUrl, primary_color: color })}
        >
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save Mini App'}
        </Button>
      </div>
    </div>
  );
}

function TrialSection({
  workspace,
  patch,
  onSaved,
}: {
  workspace: NonNullable<ReturnType<typeof useResellerWorkspace>['workspace']>;
  patch: ReturnType<typeof useResellerWorkspace>['patch'];
  onSaved: () => void;
}) {
  const [trialEnabled, setTrialEnabled] = useState(workspace.trial_enabled);
  const [dataLimitGb, setDataLimitGb] = useState(
    workspace.trial_data_limit_gb != null ? String(workspace.trial_data_limit_gb) : ''
  );
  const [durationDays, setDurationDays] = useState(
    workspace.trial_duration_days != null ? String(workspace.trial_duration_days) : ''
  );
  const { save, saving, saved, error } = useSave(patch, onSaved);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Trial Settings</h3>
        <p className="text-xs text-muted-foreground">Free trial offered to new customers on first mini app visit.</p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-foreground">Enable free trial</div>
          <Switch checked={trialEnabled} onCheckedChange={setTrialEnabled} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <FormField label="Data Limit (GB)">
              <Input
                type="number"
                value={dataLimitGb}
                onChange={(e) => setDataLimitGb(e.target.value)}
                min={1}
                step={1}
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

        {error ? <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}

        <Button
          variant="primary"
          size="sm"
          disabled={saving}
          leftIcon={saved ? <Check size={14} /> : undefined}
          onClick={() =>
            void save({
              trial_enabled: trialEnabled,
              trial_data_limit_gb: dataLimitGb !== '' ? Number(dataLimitGb) : null,
              trial_duration_days: durationDays !== '' ? Number(durationDays) : null,
            })
          }
        >
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save Trial Settings'}
        </Button>
      </div>
    </div>
  );
}

function BotTokenSection({
  workspace,
  patch,
  onSaved,
}: {
  workspace: NonNullable<ReturnType<typeof useResellerWorkspace>['workspace']>;
  patch: ReturnType<typeof useResellerWorkspace>['patch'];
  onSaved: () => void;
}) {
  const [botToken, setBotToken] = useState('');
  const [botStatus, setBotStatus] = useState<BotStatus>(workspace.bot_status);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [regWarning, setRegWarning] = useState('');

  useEffect(() => setBotStatus(workspace.bot_status), [workspace.bot_status]);

  const handleSave = async () => {
    if (!botToken.trim()) return;
    setSaving(true);
    setSaveError('');
    setRegWarning('');
    setSaved(false);
    try {
      const result = await patch({ bot_token: botToken });
      setSaved(true);
      setBotToken('');
      setTimeout(() => setSaved(false), 3000);
      if (result?.bot_status && typeof result.bot_status === 'object') {
        setBotStatus(result.bot_status as BotStatus);
      }
      if (result?.bot_registered === false) {
        setRegWarning(String(result?.bot_error || 'Token saved but webhook registration failed — check the bot token.'));
      }
      onSaved();
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Telegram Bot</h3>
        <p className="text-xs text-muted-foreground">Bot token from @BotFather. Encrypted at rest — never shown again after saving.</p>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Bot size={22} className={botStatus.connected ? 'text-[color:var(--success)]' : 'text-muted-foreground'} />
          <Badge variant={botStatus.connected ? 'success' : 'warning'}>{getBotStatusLabel(botStatus)}</Badge>
        </div>

        <FormField label={botStatus.token_saved ? 'Replace bot token' : 'Set bot token'}>
          <Input
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="123456789:ABCdef…"
            autoComplete="new-password"
          />
        </FormField>

        {regWarning ? (
          <div className="rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-[color:var(--warning)]">{regWarning}</div>
        ) : null}
        {saveError ? (
          <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{saveError}</div>
        ) : null}

        <Button
          variant="primary"
          size="sm"
          disabled={saving || !botToken.trim()}
          leftIcon={saved ? <Check size={14} /> : undefined}
          onClick={() => void handleSave()}
        >
          {saving ? 'Saving & registering…' : saved ? 'Token Saved' : 'Save Bot Token'}
        </Button>
      </div>
    </div>
  );
}
