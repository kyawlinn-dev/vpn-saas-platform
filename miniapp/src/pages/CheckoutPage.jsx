import { useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Copy,
  CreditCard,
} from "lucide-react";
import { GlassCard, PageHeader, PrimaryButton, SecondaryButton } from "../components/ui/primitives";
import { cn } from "@/lib/utils";
import { formatCurrencyMmk } from "../lib/format";
import { uploadPaymentScreenshot } from "../features/access/api";
import { useSubmitPurchase } from "../features/access/hooks";
import { TAB_KEYS } from "../constants/routes";

const BRAND_KBZ = "#0A50A1";
const BRAND_WAVE = "#FDD100";

// ── Spinner ────────────────────────────────────────────────────────────────────
function Spinner({ size = "md" }) {
  return (
    <div
      className={cn(
        "animate-spin rounded-full border-2 border-primary/25 border-t-primary",
        size === "sm" ? "h-4 w-4" : "h-6 w-6",
      )}
    />
  );
}

// ── InlineError ────────────────────────────────────────────────────────────────
function InlineError({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-[13px] text-red-400">
      <AlertCircle size={14} className="shrink-0" />
      {message}
    </div>
  );
}

// ── Brand detection ────────────────────────────────────────────────────────────
function getMethodBrand(name) {
  const lower = (name || "").toLowerCase();
  if (lower.includes("kbz")) {
    return {
      icon: <img src="/kbzpay.png" alt="KBZ" className="h-[18px] w-[18px] rounded-md object-contain" />,
      color: BRAND_KBZ,
    };
  }
  if (lower.includes("wave")) {
    return {
      icon: <img src="/wave.png" alt="Wave" className="h-[18px] w-[18px] rounded-md object-contain" />,
      color: BRAND_WAVE,
    };
  }
  return {
    icon: <CreditCard size={14} />,
    color: null,
  };
}

// ── MethodPills ────────────────────────────────────────────────────────────────
function MethodPills({ methods, selectedIdx, onSelect }) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
      {methods.map((m, i) => {
        const brand = getMethodBrand(m.method);
        const isSelected = i === selectedIdx;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-2xl border px-4 py-2 text-[13px] font-medium transition-colors",
              isSelected
                ? brand.color ? "" : "border-primary/40 bg-primary/15 text-primary"
                : "glass border-border text-muted-foreground hover:border-border/60 hover:text-foreground",
            )}
            style={
              isSelected && brand.color
                ? { borderColor: `${brand.color}99`, backgroundColor: `${brand.color}26`, color: brand.color }
                : undefined
            }
          >
            {brand.icon}
            {m.method}
          </button>
        );
      })}
    </div>
  );
}

// ── AccountCard ────────────────────────────────────────────────────────────────
function AccountCard({ method, brand, onCopy }) {
  const [copied, setCopied] = useState(false);
  const accentColor = brand?.color || null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(method.account_number);
      setCopied(true);
      onCopy?.("Account number copied", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onCopy?.("Could not copy — copy manually", "warning");
    }
  };

  return (
    <GlassCard
      className="p-3"
      style={{
        background: "linear-gradient(180deg, oklch(0.28 0.06 250 / 65%), oklch(0.22 0.03 264 / 55%))",
        borderLeftColor: accentColor ? `${accentColor}70` : undefined,
        borderLeftWidth: accentColor ? "3px" : undefined,
      }}
    >
      <p
        className={cn("mb-2 text-[11px] font-bold uppercase tracking-widest", !accentColor && "text-primary/70")}
        style={accentColor ? { color: `${accentColor}cc` } : undefined}
      >
        Pay with {method.method}
      </p>

      <div className="min-w-0">
        <p className="text-[10.5px] text-muted-foreground">Account name</p>
        <p className="truncate text-[14px] font-bold text-foreground">{method.account_name}</p>

        <p className="mt-2 text-[10.5px] text-muted-foreground">Account number</p>
        <div className="flex items-center gap-3">
          <p className="flex-1 text-[16px] font-black tracking-wide text-foreground" style={{ letterSpacing: "0.04em" }}>
            {method.account_number}
          </p>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy account number"
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all",
              copied
                ? "border-success/40 bg-success/15 text-success"
                : "border-border bg-secondary/60",
            )}
            style={!copied && accentColor ? { color: accentColor } : undefined}
          >
            {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
          </button>
        </div>
      </div>

      <div className="mt-2 rounded-lg border border-success/20 bg-success/8 px-3 py-2">
        <p className="text-[12px] text-warning/80">
          <span className="font-bold">!</span>{" "}Transfer exactly{" "}
          <span className="font-bold text-warning">{formatCurrencyMmk(method.total_mmk ?? undefined)}</span>
          {" "}to this account, then upload your screenshot below.
        </p>
      </div>
    </GlassCard>
  );
}

// ── ScreenshotUpload ───────────────────────────────────────────────────────────
function ScreenshotUpload({ previewSrc, isUploading, error, onSelect }) {
  const inputRef = useRef(null);

  const handleClick = () => inputRef.current?.click();
  const handleChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onSelect(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleChange}
      />

      {isUploading ? (
        <div className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-4 py-3">
          <Spinner size="sm" />
          <p className="text-[13px] text-muted-foreground">Uploading screenshot…</p>
        </div>
      ) : previewSrc ? (
        <div className="flex w-full items-center gap-3 rounded-2xl border border-border bg-secondary/40 px-3 py-2.5">
          <img
            src={previewSrc}
            alt="Payment screenshot preview"
            className="h-10 w-10 shrink-0 rounded-lg border border-border bg-black/30 object-cover"
          />
          <p className="flex-1 truncate text-[13px] font-medium text-foreground">Screenshot ready</p>
          <button
            type="button"
            onClick={handleClick}
            className="shrink-0 rounded-lg border border-border bg-secondary/60 px-3 py-1.5 text-[12px] font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            Change
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-4 py-3 transition-colors hover:border-cyan/40 hover:bg-cyan/5 active:scale-[0.99]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Camera size={18} />
          </div>
          <div className="text-left">
            <p className="text-[13px] font-semibold text-foreground">Upload payment screenshot</p>
            <p className="text-[11px] text-muted-foreground">JPEG · PNG · WebP · max 5 MB</p>
          </div>
        </button>
      )}

      <InlineError message={error} />
    </div>
  );
}

// ── PlanSummaryCard ────────────────────────────────────────────────────────────
function PlanSummaryCard({ plan }) {
  const dataLabel = plan?.data_limit_gb ? `${plan.data_limit_gb} GB` : "Unlimited";
  const daysLabel = plan?.duration_days ? `${plan.duration_days} days` : "";

  return (
    <GlassCard glow className="aurora-glow p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Selected plan
          </p>
          <p className="truncate text-[17px] font-bold leading-tight text-foreground">
            {plan?.name || "Premium Plan"}
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {dataLabel}{daysLabel ? ` · ${daysLabel}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[17px] font-black text-warning leading-tight">
            {Number(plan?.price_mmk || 0).toLocaleString("en-US")}
          </p>
          <p className="text-[11px] text-muted-foreground">MMK</p>
        </div>
      </div>
    </GlassCard>
  );
}

// ── Section label ──────────────────────────────────────────────────────────────
function SectionLabel({ children, required }) {
  return (
    <p className="text-[13px] font-semibold text-foreground">
      {children}
      {required && <span className="ml-1 text-red-400">*</span>}
    </p>
  );
}

// ── CheckoutPage ───────────────────────────────────────────────────────────────
export default function CheckoutPage({
  data,
  checkoutPlan,
  onToast,
  onTabChange,
  onRefreshAuth,
}) {
  const paymentMethods = data?.config?.payment || [];
  const telegramUserId = data?.user?.telegram_user_id;

  const [selectedMethodIdx, setSelectedMethodIdx] = useState(0);
  const [uploadedPath, setUploadedPath] = useState(null);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [paymentNote, setPaymentNote] = useState("");

  // Guard: no plan selected → bounce back to packages
  if (!checkoutPlan) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-20">
        <p className="text-[15px] text-muted-foreground">No plan selected.</p>
        <SecondaryButton onClick={() => onTabChange(TAB_KEYS.PACKAGES)} className="w-auto px-6">
          Back to Packages
        </SecondaryButton>
      </div>
    );
  }

  const selectedMethod = paymentMethods[selectedMethodIdx] ?? null;
  const canSubmit = Boolean(uploadedPath) && !isUploading;

  const handleFileSelect = async (file) => {
    setUploadedPath(null);
    setPreviewSrc(null);
    setUploadError(null);
    setIsUploading(true);
    setPreviewSrc(URL.createObjectURL(file));

    try {
      const result = await uploadPaymentScreenshot({ file, telegramUserId });
      setUploadedPath(result.path);
    } catch (err) {
      setUploadError(err.message || "Upload failed. Please try again.");
      setPreviewSrc(null);
    } finally {
      setIsUploading(false);
    }
  };

  // ── Mutation (payload unchanged from PurchaseDialog) ─────────────────────────
  const submitMutation = useSubmitPurchase({
    onSuccess: async () => {
      if (onRefreshAuth) await onRefreshAuth();
      onTabChange(TAB_KEYS.PAYMENT_STATUS);
    },
    onError: (err) => {
      onToast(err?.message || "Failed to submit purchase", "error");
    },
  });

  const handleSubmit = () => {
    if (!canSubmit || submitMutation.isPending) return;
    submitMutation.mutate({
      telegram_user_id: telegramUserId,
      plan_id: checkoutPlan?.id,
      payment_screenshot_url: uploadedPath,
      payment_note: paymentNote.trim() || undefined,
    });
  };

  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-8">
      <PageHeader title="Checkout" onBack={() => onTabChange(TAB_KEYS.PACKAGES)} centerTitle />

      {/* 1 — Plan summary */}
      <PlanSummaryCard plan={checkoutPlan} />

      {/* 2 — Payment method selector */}
      {paymentMethods.length > 0 ? (
        <div className="flex flex-col gap-3">
          <SectionLabel>Payment Method</SectionLabel>
          <MethodPills
            methods={paymentMethods}
            selectedIdx={selectedMethodIdx}
            onSelect={setSelectedMethodIdx}
          />
          {selectedMethod && (
            <AccountCard
              method={{ ...selectedMethod, total_mmk: checkoutPlan?.price_mmk }}
              brand={getMethodBrand(selectedMethod.method)}
              onCopy={onToast}
            />
          )}
        </div>
      ) : (
        <GlassCard className="p-4">
          <p className="text-[13px] text-muted-foreground">
            No payment methods configured. Please contact support.
          </p>
        </GlassCard>
      )}

      {/* 3 — Screenshot upload */}
      <div className="flex flex-col gap-2">
        <SectionLabel required>Payment Screenshot</SectionLabel>
        <ScreenshotUpload
          previewSrc={previewSrc}
          isUploading={isUploading}
          error={uploadError}
          onSelect={handleFileSelect}
        />
      </div>

      {/* 4 — Payment note */}
      <div className="flex flex-col gap-2">
        <SectionLabel>
          Payment Note{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </SectionLabel>
        <textarea
          rows={2}
          placeholder="e.g. Paid with KBZPay at 3:10 PM"
          value={paymentNote}
          onChange={(e) => setPaymentNote(e.target.value)}
          className={cn(
            "w-full resize-none rounded-xl border border-border bg-secondary/40 px-4 py-3",
            "text-[14px] text-foreground placeholder:text-muted-foreground",
            "outline-none transition-colors focus:border-primary/50 focus:bg-secondary/60",
          )}
        />
      </div>

      {/* 5 — Submit */}
      <PrimaryButton
        onClick={handleSubmit}
        disabled={!canSubmit || submitMutation.isPending}
        className="mt-1"
      >
        {submitMutation.isPending ? (
          <>
            <Spinner size="sm" />
            Submitting…
          </>
        ) : (
          <>
            <CheckCircle2 size={18} />
            Submit Payment
          </>
        )}
      </PrimaryButton>
    </div>
  );
}
