import { useRef, useState } from "react";
import { Bell, Check, RotateCcw, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Textarea } from "@/components/ui/textarea";
import { useNotificationTemplates } from "../hooks/useNotificationTemplates";
import type { NotificationTemplate } from "../types/api";

function TemplateCard({
  template,
  onSave,
  onReset,
  onPreview,
}: {
  template: NotificationTemplate;
  onSave: (text: string) => Promise<void>;
  onReset: () => Promise<void>;
  onPreview: (text: string) => Promise<string>;
}) {
  const [text, setText] = useState(template.text);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const dirty = text !== template.text;

  const insertPlaceholder = (key: string) => {
    const el = textareaRef.current;
    const token = `{${key}}`;
    if (!el) {
      setText((t) => t + token);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + token + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(text);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setError("");
    try {
      await onReset();
      setText(template.default_text);
      setPreviewText(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    setError("");
    try {
      const rendered = await onPreview(text);
      setPreviewText(rendered);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black font-display text-foreground">{template.label}</h2>
            <Chip tone={template.is_custom ? "primary" : "muted"}>
              {template.is_custom ? "Customized" : "Using default"}
            </Chip>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p>
        </div>
      </div>

      <Textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        className="font-mono text-xs"
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">Insert:</span>
        {template.placeholders.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => insertPlaceholder(p)}
            className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground hover:bg-secondary/70 hover:text-foreground transition-colors"
          >
            {`{${p}}`}
          </button>
        ))}
      </div>

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

      {previewText !== null ? (
        <div className="mt-3 rounded-xl border border-border bg-secondary/40 p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Preview
          </p>
          <div
            className="text-sm text-foreground whitespace-pre-wrap"
            // Telegram HTML parse_mode subset only (b/i/u/s/code/a) — same
            // tags the backend validates on save, safe to render here.
            dangerouslySetInnerHTML={{ __html: previewText }}
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={saving || !dirty}>
          {saved ? <Check className="mr-1 h-3.5 w-3.5" /> : null}
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={handlePreview} disabled={previewLoading}>
          <Eye className="mr-1 h-3.5 w-3.5" />
          {previewLoading ? "Loading…" : "Preview"}
        </Button>
        {template.is_custom ? (
          <Button type="button" size="sm" variant="ghost" onClick={handleReset} disabled={resetting}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            {resetting ? "Resetting…" : "Reset to default"}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

export function NotificationsPage() {
  const { templates, loading, error, save, reset, preview } = useNotificationTemplates();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-black font-display text-foreground">Notifications</h1>
          <p className="text-xs text-muted-foreground">
            Customize the Burmese messages your bot sends customers automatically. Leave any
            message as-is to keep the platform default.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading || !templates ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-secondary/50" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <TemplateCard
              key={t.event_type}
              template={t}
              onSave={(text) => save(t.event_type, text).then(() => {})}
              onReset={() => reset(t.event_type).then(() => {})}
              onPreview={(text) => preview(t.event_type, text)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
