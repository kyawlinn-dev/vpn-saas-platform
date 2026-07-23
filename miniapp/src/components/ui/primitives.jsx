/**
 * primitives.jsx — Aurora Dark VPN design-system primitives
 *
 * Tailwind/CVA equivalents of the MUI components in vpnPrimitives.jsx.
 * Ported from design-reference/components/vpn/shared.tsx and bottom-nav.tsx.
 *
 * Prop contracts are intentionally kept compatible with the MUI versions so
 * screen conversions require zero changes to call-sites.
 *
 * vpnPrimitives.jsx is NOT modified until all screens are converted (Phase 7).
 */

import { useId } from "react";
import { cva } from "class-variance-authority";
import { createElement } from "react";
import {
  ArrowRight,
  ChevronLeft,
  Home,
  Package,
  Server,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "../../i18n/language";

// ── BrandLogo ──────────────────────────────────────────────────────────────────
// Gradient avatar with shield icon. Three sizes: sm / md (default) / lg.

export function BrandLogo({ size = "md" }) {
  const dims =
    size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const iconSize = size === "lg" ? 24 : size === "sm" ? 16 : 20;
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-2xl",
        "bg-gradient-to-br from-primary to-cyan text-primary-foreground",
        "shadow-[0_0_20px_-2px_var(--primary)]",
        dims,
      )}
      aria-hidden="true"
    >
      <ShieldCheck size={iconSize} strokeWidth={2.4} />
    </div>
  );
}

// ── LanguagePill ───────────────────────────────────────────────────────────────
export function LanguagePill() {
  const { language, languages, setLanguage, t } = useLanguage();
  return (
    <div className="flex rounded-full border border-border bg-secondary/60 p-0.5" role="group" aria-label={t("common.language")}>
      {languages.map(({ code, emoji, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => setLanguage(code)}
          aria-pressed={language === code}
          aria-label={label}
          className={cn(
            "rounded-full px-2 py-0.5 text-[15px] leading-none transition-all",
            language === code ? "bg-primary/20 opacity-100" : "opacity-40",
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// ── BrandBar ───────────────────────────────────────────────────────────────────
// Top header: logo + brand name/subtitle + optional language pill + settings button.
// brandName and subtitle come from data?.config?.brand (passed by AppShell).

export function BrandBar({ brandName, subtitle, onOpenSettings }) {
  const { t } = useLanguage();

  return (
    <header className="flex items-center gap-3">
      <BrandLogo />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold leading-tight text-foreground">
          {brandName}
        </h1>
        {subtitle ? (
          <p className="truncate text-[12px] leading-tight text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      <LanguagePill />
      {onOpenSettings ? (
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label={t("settings.title")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/60 text-muted-foreground transition-colors hover:text-foreground active:scale-95"
        >
          <Settings size={18} />
        </button>
      ) : null}
    </header>
  );
}

// ── PageHeader ─────────────────────────────────────────────────────────────────
// Sub-page header with back chevron + title. Used on Servers / Checkout screens.

export function PageHeader({ title, onBack, centerTitle = false }) {
  return (
    <header className="flex items-center">
      <button
        type="button"
        onClick={onBack}
        aria-label="Go back"
        className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/60 text-foreground transition-colors hover:bg-secondary active:scale-95"
      >
        <ChevronLeft size={20} />
      </button>
      <h1
        className={cn(
          "text-[18px] font-semibold text-foreground",
          centerTitle ? "flex-1 text-center" : "ml-2",
        )}
      >
        {title}
      </h1>
      {centerTitle && <div className="w-10 shrink-0" aria-hidden="true" />}
    </header>
  );
}

// ── GlassCard ─────────────────────────────────────────────────────────────────
// Glass-morphism container. Accepts all <div> props + optional glow.
// Pass className to override padding/radius (e.g. className="p-0" for custom layouts).

export function GlassCard({ className, children, glow = false, ...props }) {
  return (
    <div
      className={cn(
        "glass relative overflow-hidden rounded-[22px] p-4",
        glow && "shadow-[0_10px_40px_-12px_var(--primary)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ── Chip ───────────────────────────────────────────────────────────────────────
// Small inline tag with six tone variants.

const chipTones = {
  primary: "bg-primary/15 text-primary border-primary/25",
  cyan: "bg-cyan/15 text-cyan border-cyan/25",
  violet: "bg-violet/15 text-violet border-violet/30",
  success: "bg-success/15 text-success border-success/25",
  warning: "bg-warning/15 text-warning border-warning/25",
  danger: "bg-destructive/15 text-red-400 border-destructive/25",
  muted: "bg-secondary/70 text-muted-foreground border-border",
};

export function Chip({ children, tone = "muted", className, icon }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        chipTones[tone] ?? chipTones.muted,
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

// Maps server tag strings to Chip tone values.
export function tagTone(tag) {
  if (tag === "Premium") return "violet";
  if (tag === "High Speed") return "cyan";
  if (tag === "Streaming") return "primary";
  return "muted";
}

// ── Buttons ────────────────────────────────────────────────────────────────────
// Plain <button> elements styled with CVA. No @base-ui/react wrapper needed for
// these named variants — @base-ui/react is reserved for Dialog (Phase 6).

const buttonBase = cva(
  "flex items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold transition-all active:scale-[0.98] disabled:opacity-60",
  {
    variants: {
      fullWidth: {
        true: "w-full",
        false: "",
      },
      size: {
        md: "h-12",
        sm: "h-9 text-[13px]",
      },
    },
    defaultVariants: {
      fullWidth: true,
      size: "md",
    },
  },
);

export function PrimaryButton({ className, children, fullWidth, size, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        buttonBase({ fullWidth, size }),
        "bg-gradient-to-r from-primary to-cyan text-primary-foreground",
        "shadow-[0_8px_24px_-8px_var(--primary)] hover:brightness-105",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ className, children, fullWidth, size, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        buttonBase({ fullWidth, size }),
        "border border-border bg-secondary/60 text-foreground hover:bg-secondary",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// Alias — the existing codebase calls it GhostButton; map to SecondaryButton styling.
export const GhostButton = SecondaryButton;

// ── LatencyBadge ───────────────────────────────────────────────────────────────
// Colored dot + latency in ms. Green ≤28 ms, cyan ≤38 ms, yellow otherwise.

export function LatencyBadge({ ms }) {
  const tone =
    ms <= 28 ? "text-success" : ms <= 38 ? "text-cyan" : "text-warning";
  const dot =
    ms <= 28 ? "bg-success" : ms <= 38 ? "bg-cyan" : "bg-warning";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", tone)}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {ms} ms
    </span>
  );
}

// ── DataRing ───────────────────────────────────────────────────────────────────
// SVG circular usage gauge with a primary→cyan gradient arc.
//
// Props match the existing MUI DataRing so HomePage conversion requires no
// call-site changes:
//   percent      — 0-100 fill value
//   primary      — large center text   (e.g. "42%")
//   secondary    — small sub-text      (e.g. "2.1 / 5 GB")
//   caption      — optional tiny text  (unused currently)
//   size         — diameter in px, default 132

export function DataRing({ percent, primary, secondary, caption, size = 132 }) {
  const id = useId();
  const gradId = `ringGrad-${id}`;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, percent ?? 0));
  const offset = c - (clamped / 100) * c;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="-rotate-90 block"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--cyan)" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth={stroke}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[26px] font-semibold leading-none text-foreground">
          {primary}
        </span>
        {secondary && (
          <span className="mt-1 text-[12px] font-medium text-muted-foreground">
            {secondary}
          </span>
        )}
        {caption && (
          <span className="mt-0.5 text-[10px] text-muted-foreground">
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}

// ── BottomNav ──────────────────────────────────────────────────────────────────
// Three-tab navigation bar. Tab IDs match TAB_KEYS in constants/routes.js.
//   active    — current tab string ('home' | 'servers' | 'packages')
//   onChange  — called with the new tab string

const NAV_TABS = [
  { id: "home", labelKey: "nav.home", Icon: Home },
  { id: "servers", labelKey: "nav.servers", Icon: Server },
  { id: "packages", labelKey: "nav.packages", Icon: Package },
];

export function BottomNav({ active, onChange }) {
  const { t } = useLanguage();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/80 backdrop-blur-xl"
      aria-label="Main navigation"
    >
      <ul className="mx-auto flex h-[calc(4rem_+_var(--app-safe-bottom))] max-w-md items-stretch justify-around px-2">
        {NAV_TABS.map(({ id, labelKey, Icon }) => {
          const isActive = active === id;
          const label = t(labelKey);
          return (
            <li key={id} className="flex flex-1">
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={isActive ? "page" : undefined}
                className="flex flex-1 flex-col items-center justify-center gap-1"
              >
                <span
                  className={cn(
                    "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                    isActive ? "bg-primary/15 text-primary" : "text-muted-foreground",
                  )}
                >
                  {createElement(Icon, { size: 20, strokeWidth: isActive ? 2.4 : 2 })}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ── QuickAction ────────────────────────────────────────────────────────────────
// Two-column action tile used in HomePage's Quick Actions section.

export function QuickAction({ icon, label, onClick, disabled, trailingIcon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "glass flex items-center justify-between rounded-[20px] px-4 py-3.5 text-left",
        "transition-all hover:brightness-110 active:scale-[0.98]",
        disabled && "cursor-not-allowed opacity-55",
      )}
    >
      <span className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
          {icon}
        </span>
        <span className="text-[14px] font-medium text-foreground">{label}</span>
      </span>
      {trailingIcon ?? <ArrowRight size={16} className="text-muted-foreground" />}
    </button>
  );
}
