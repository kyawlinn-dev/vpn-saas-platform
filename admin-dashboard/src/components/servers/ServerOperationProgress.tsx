import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { serverOperationsApi, type ServerOperation } from '@/features/serverOperations/api';

const terminal = (status: string) => ['completed', 'cancelled', 'failed'].includes(status);
export function ServerOperationProgress({ initial, onComplete }: { initial: ServerOperation; onComplete?: () => void }) {
  const [operation, setOperation] = useState(initial); const [offline, setOffline] = useState(false); const [busy, setBusy] = useState(false);
  const completeRef = useRef(onComplete);
  const revision = useRef(0);
  const latest = useRef(initial);
  const notified = useRef<string | null>(null);
  completeRef.current = onComplete;
  function applySnapshot(next: ServerOperation) {
    const previous = latest.current;
    if (previous.id === next.id) {
      if (terminal(previous.status) && !terminal(next.status)) return previous;
      const before = Date.parse(previous.updated_at || '');
      const after = Date.parse(next.updated_at || '');
      if (Number.isFinite(before) && Number.isFinite(after) && after < before) return previous;
    } else notified.current = null;
    latest.current = next;
    setOperation(next);
    if (terminal(next.status) && notified.current !== next.id) {
      notified.current = next.id;
      completeRef.current?.();
    }
    return next;
  }
  useEffect(() => {
    revision.current++;
    const accepted = applySnapshot(initial); setOffline(false);
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>; let delay = 3000;
    async function refresh() {
      const version = revision.current;
      try {
        const current = await serverOperationsApi.get(initial.id, controller.signal);
        if (controller.signal.aborted) return;
        if (version === revision.current) {
          revision.current++;
          applySnapshot(current); setOffline(false); delay = 3000;
        }
      } catch {
        if (controller.signal.aborted) return;
        if (version === revision.current) { setOffline(true); delay = Math.min(delay * 2, 30000); }
      }
      if (terminal(latest.current.status)) return;
      timer = setTimeout(() => void refresh(), delay);
    }
    if (!terminal(accepted.status)) void refresh();
    return () => { revision.current++; controller.abort(); clearTimeout(timer); };
  }, [initial]);
  async function control(action: 'resume' | 'cancel') {
    if (busy) return; setBusy(true);
    const version = revision.current;
    try {
      const current = await serverOperationsApi.control(operation.id, action);
      // Polls and parent snapshots supersede a control request started earlier.
      if (version !== revision.current) return;
      revision.current++;
      applySnapshot(current); setOffline(false);
    }
    catch { if (version === revision.current) setOffline(true); } finally { setBusy(false); }
  }
  return <section className="space-y-3 border-y border-border py-4" aria-label="Server operation progress">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h2 className="flex items-center gap-2 text-sm font-semibold">{!terminal(operation.status) && <Loader2 size={15} className="animate-spin" />}Server Operation</h2>
      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{operation.id}</p></div>
      <span className="break-words text-sm">{operation.status.replace(/_/g, ' ')} / {operation.phase.replace(/_/g, ' ')}</span></div>
    <p className="text-sm">{operation.counts.verified} / {operation.counts.total} access items verified</p>
    {operation.billing_assurance?.scope==='instance-package'&&operation.billing_assurance.external_attachments_verified===false&&
      <p className="text-xs text-muted-foreground">Instance package verified. Detached resources and other account charges were not checked.</p>}
    {offline && <p role="status" className="text-sm text-warning">Status unavailable. Reconnecting; outcome not confirmed.</p>}
    {operation.error_code && <p role="alert" className="break-words text-sm text-destructive">{operation.error_code}</p>}
    {operation.error_code && operation.retirement_check && <p className="break-words text-sm text-destructive">Check: {operation.retirement_check}{operation.retirement_cause ? ` / ${operation.retirement_cause}` : ''}</p>}
    {(operation.phase === 'cleanup_pending' || operation.ongoing_charges.length > 0) && <div className="space-y-1 text-sm text-warning"><p>Ongoing charges may remain</p>{operation.ongoing_charges.map((c, i) => <p key={i} className="break-all">{c.type}: {c.id || 'Unconfirmed resource'}{c.amount != null ? ` (${c.amount} ${c.currency || ''})` : ''}</p>)}</div>}
    <div className="flex flex-wrap gap-2">{operation.allowed_actions.map(action => <Button key={action} disabled={busy} leftIcon={action === 'resume' ? <Play size={14} /> : <Pause size={14} />} onClick={() => void control(action)}>{action === 'resume' ? 'Resume' : 'Cancel'}</Button>)}</div>
  </section>;
}
