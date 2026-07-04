import { useEffect } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  success: {
    Icon: CheckCircle2,
    wrap: "border-success/30 bg-success/12 text-success",
  },
  error: {
    Icon: AlertCircle,
    wrap: "border-destructive/30 bg-destructive/12 text-red-400",
  },
  warning: {
    Icon: AlertTriangle,
    wrap: "border-warning/30 bg-warning/12 text-warning",
  },
  info: {
    Icon: Info,
    wrap: "border-primary/30 bg-primary/12 text-primary",
  },
};

const AUTO_HIDE_MS = 1800;

export default function ToastMessage({ open, message, severity = "info", onClose }) {
  // Auto-dismiss after AUTO_HIDE_MS whenever toast opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(onClose, AUTO_HIDE_MS);
    return () => clearTimeout(id);
  }, [open]); // intentional: only re-arm when open state changes

  const tone = TONES[severity] ?? TONES.info;
  const { Icon } = tone;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-x-4 top-[calc(var(--app-safe-top)_+_1rem)] z-50 mx-auto max-w-sm",
        "glass flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl",
        tone.wrap,
        "transition-all duration-200",
        open
          ? "translate-y-0 opacity-100"
          : "pointer-events-none -translate-y-3 opacity-0",
      )}
    >
      <Icon size={17} className="shrink-0" />
      <p className="flex-1 text-[13.5px] font-semibold leading-snug text-foreground">
        {message}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full opacity-60 hover:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}
