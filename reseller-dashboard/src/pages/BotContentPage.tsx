import { useCallback, useLayoutEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { Bell, Bot, ExternalLink, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { botContentError, useBotContent } from "../hooks/useBotContent";
import type { BotContentItem } from "../types/api";

const GROUPS = [
  { title: "User Guides", description: "Both guides are available to every customer.", links: [
    { key: "guides.shadowsocks.url", label: "Shadowsocks" },
    { key: "guides.vless.url", label: "VLESS" },
  ] },
];

function validate(item: BotContentItem, text: string): string {
  if (text.length > item.max_length) return `Maximum ${item.max_length} characters`;
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password || /[\s\x00-\x1f\x7f{}]/.test(text)
      || url.hostname === "localhost" || !url.hostname.includes(".") || url.hostname.includes(":")
      || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) return "Enter a public HTTPS URL without credentials";
  } catch { return "Enter a valid HTTPS URL"; }
  return "";
}

type RowState = { dirty: boolean; busy: boolean };
type ContentActions = Pick<ReturnType<typeof useBotContent>, "save" | "reset">;

function LinkEditor({ item, label, actions, onStateChange }: {
  item: BotContentItem;
  label: string;
  actions: ContentActions;
  onStateChange: (key: string, state: RowState | null) => void;
}) {
  const [text, setText] = useState(item.text);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const dirty = text !== item.text;
  const validation = validate(item, text);
  const inputId = `bot-link-${item.key}`;

  useLayoutEffect(() => {
    onStateChange(item.key, { dirty, busy: busy !== null });
    return () => onStateChange(item.key, null);
  }, [item.key, dirty, busy, onStateChange]);

  const perform = async (action: "save" | "reset") => {
    setBusy(action);
    setError("");
    setStatus("");
    try {
      const result = action === "save" ? await actions.save(item.key, text) : await actions.reset(item.key);
      setText(result.text);
      setStatus(action === "save" ? "Saved" : "Cleared");
    } catch (err) { setError(botContentError(err)); }
    finally { setBusy(null); }
  };

  return (
    <section aria-label={label} className="min-w-0 space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-semibold">{label}<span className="sr-only"> URL</span></label>
        {!text && <span className="text-xs text-muted-foreground">Built-in fallback</span>}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Input id={inputId} type="text" inputMode="url" autoCapitalize="none" autoComplete="off" spellCheck={false}
          value={text} disabled={!!busy} className="min-w-0 flex-1" placeholder="Optional HTTPS URL"
          aria-invalid={!!validation} aria-describedby={`${inputId}-validation ${inputId}-status`}
          onChange={event => { setText(event.target.value); setError(""); setStatus(""); }} />
        {text && !validation && (
          <a href={text} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label} link`} title="Open link"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" leftIcon={<Save className="h-4 w-4" />} disabled={!dirty || !!validation || !!busy}
          loading={busy === "save"} onClick={() => void perform("save")}>Save</Button>
        <Button size="sm" variant="ghost" leftIcon={<RotateCcw className="h-4 w-4" />} disabled={(!text && !item.is_custom) || !!busy}
          loading={busy === "reset"} onClick={() => void perform("reset")}>Clear</Button>
        <span id={`${inputId}-status`} role="status" className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : status}</span>
      </div>
      <p id={`${inputId}-validation`} role={validation ? "alert" : undefined} className="text-xs text-destructive">{validation}</p>
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    </section>
  );
}

export function BotContentPage() {
  const content = useBotContent();
  const location = useLocation();
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const onStateChange = useCallback((key: string, state: RowState | null) => {
    setRows(previous => {
      const next = { ...previous };
      if (state) next[key] = state;
      else delete next[key];
      return next;
    });
  }, []);
  const dirty = Object.values(rows).some(row => row.dirty);
  const busy = Object.values(rows).some(row => row.busy);

  // BrowserRouter has no data-router blocker. Preserve the existing link and
  // unload guards; browser Back/Forward and imperative navigation are unguarded.
  useLayoutEffect(() => {
    if (!dirty && !busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const beforeLink = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const target = new URL(anchor.href);
      if (target.origin === window.location.origin && target.pathname === location.pathname && target.search === location.search) return;
      if (busy || !window.confirm("Discard unsaved changes?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeLink, true);
    };
  }, [dirty, busy, location.pathname, location.search]);

  const hasLinks = GROUPS.some(group => group.links.some(link => content.items.some(item => item.key === link.key && item.kind === "url")));
  return (
    <div className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 font-display text-lg font-black"><Bot className="h-5 w-5 text-primary" />Bot Links</h1>
        <Link to="/app/notifications" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Bell className="h-4 w-4" />Notifications</Link>
      </header>
      <p className="text-sm text-muted-foreground">Optional HTTPS links for user guides. Leave a URL blank to use the built-in instructions.</p>
      {content.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">{content.error}<Button size="sm" variant="outline" onClick={() => void content.reload()}>Retry</Button></div>}
      {content.loading ? <div role="status" className="animate-pulse p-5 text-sm text-muted-foreground">Loading links…</div> : !content.error && (
        hasLinks ? GROUPS.map(group => (
          <section key={group.title} aria-label={group.title} className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-display text-base font-bold">{group.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
            </div>
            <div className="divide-y divide-border">
              {group.links.map(link => {
                const item = content.items.find(candidate => candidate.key === link.key && candidate.kind === "url");
                return item ? <LinkEditor key={item.key} item={item} label={link.label} actions={content} onStateChange={onStateChange} /> : null;
              })}
            </div>
          </section>
        )) : <p className="p-4 text-sm text-muted-foreground">No links available</p>
      )}
    </div>
  );
}
