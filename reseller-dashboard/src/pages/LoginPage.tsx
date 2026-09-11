import { useEffect, useState } from "react";
import { Eye, EyeOff, Zap, KeyRound, BarChart3 } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useResellerAuth } from "../providers/ResellerAuthProvider";
import { api } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

// Which sub-view the auth card is showing.
type Step = "signin" | "forgot" | "forgot-sent";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, initializing } = useResellerAuth();

  const [step, setStep] = useState<Step>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const routeState = location.state as { from?: string } | null;
  const forceOverview = window.sessionStorage.getItem("forceOverviewAfterLogin") === "1";
  const redirectTo = forceOverview ? "/app/overview" : (routeState?.from || "/app/overview");

  useEffect(() => {
    if (!initializing && isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, initializing, navigate, redirectTo]);

  // ── Sign In ───────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    try {
      setLoading(true);
      setError("");
      await login(email.trim(), password);
      window.sessionStorage.removeItem("forceOverviewAfterLogin");
      navigate("/app/overview", { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot password ───────────────────────────────────────────────────────
  const handleForgotPassword = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      await api.post("/auth/reseller/forgot-password", { email: trimmed });
      setStep("forgot-sent");
    } catch {
      // Show generic success to avoid email enumeration.
      setStep("forgot-sent");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || loading) return;
    if (step === "signin" && email && password) void handleSignIn();
    if (step === "forgot" && email) void handleForgotPassword();
  };

  const featureItems = [
    { icon: <Zap size={18} />, title: "Live order tracking", desc: "Real-time status for all connections" },
    { icon: <KeyRound size={18} />, title: "Access key management", desc: "One-click activate, stop & renew" },
    { icon: <BarChart3 size={18} />, title: "Revenue insights", desc: "Track usage, value & expiry in one view" },
  ];

  return (
    <div
      className="min-h-screen flex bg-background"
      style={{
        background:
          "radial-gradient(ellipse 100% 60% at 50% -5%, color-mix(in oklch, var(--primary) 10%, transparent), transparent), var(--background)",
      }}
    >
      {/* ── Left brand panel (desktop only) ── */}
      <div className="hidden md:flex w-[44%] flex-col justify-center px-12 py-10 bg-gradient-to-br from-primary/10 to-[color:var(--brand-blue)]/5 border-r border-border relative overflow-hidden">
        <div className="grid h-13 w-13 place-items-center rounded-xl bg-gradient-to-br from-primary to-[color:var(--brand-blue)] shadow-[0_0_20px_-2px_var(--primary)]">
          <span className="font-display text-2xl font-black text-primary-foreground">R</span>
        </div>

        <h1 className="mt-6 font-display text-4xl font-black leading-tight tracking-tight text-foreground">
          Reseller
          <br />
          Dashboard
        </h1>

        <p className="mt-4 text-base text-muted-foreground leading-relaxed">
          Manage VPN orders, track customers,
          <br />
          and grow your reseller business.
        </p>

        <div className="mt-8 space-y-4">
          {featureItems.map((f) => (
            <div key={f.title} className="flex gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                {f.icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{f.title}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 md:px-12 py-10">
        {/* Mobile brand header */}
        <div className="flex flex-col items-center gap-2 mb-8 md:hidden">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-[color:var(--brand-blue)] shadow-[0_0_20px_-2px_var(--primary)]">
            <span className="font-display text-xl font-black text-primary-foreground">R</span>
          </div>
          <div className="font-display text-lg font-bold">Reseller Dashboard</div>
        </div>

        {/* Auth card */}
        <div className="w-full max-w-[420px] rounded-xl border border-border bg-card p-6 sm:p-8 shadow-[0_12px_48px_-16px_var(--primary)]">

          {/* ── Forgot-sent confirmation ── */}
          {step === "forgot-sent" ? (
            <>
              <h2 className="font-display text-2xl font-bold text-foreground">Check your email</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                If <span className="font-medium text-foreground">{email.trim()}</span> is registered,
                we've sent a password reset link. Check your inbox (and spam folder).
              </p>
              <Button
                variant="outline"
                fullWidth
                className="mt-6 h-11"
                onClick={() => { setStep("signin"); setError(""); }}
              >
                Back to Sign In
              </Button>
            </>
          ) : (
            <>
              <h2 className="font-display text-2xl font-bold text-foreground">
                {step === "forgot" ? "Reset password" : "Welcome back"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {step === "forgot"
                  ? "Enter your email and we'll send you a reset link."
                  : "Sign in to your reseller account"}
              </p>

              <div className="mt-5 space-y-4">
                {error && (
                  <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <FormField label="Email address">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    onKeyDown={onKeyDown}
                    disabled={loading}
                  />
                </FormField>

                {step === "signin" && (
                  <FormField label="Password">
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        onKeyDown={onKeyDown}
                        disabled={loading}
                        className="pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </FormField>
                )}

                {step === "signin" && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => { setStep("forgot"); setError(""); }}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <Button
                  variant="primary"
                  fullWidth
                  className="h-11"
                  disabled={
                    loading ||
                    !email.trim() ||
                    (step === "signin" && !password)
                  }
                  onClick={() => void (step === "signin" ? handleSignIn() : handleForgotPassword())}
                >
                  {loading
                    ? step === "signin" ? "Signing in…" : "Sending…"
                    : step === "signin" ? "Sign In" : "Send Reset Link"}
                </Button>

                {step === "forgot" && (
                  <button
                    type="button"
                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setStep("signin"); setError(""); }}
                  >
                    Back to Sign In
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By signing in you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
