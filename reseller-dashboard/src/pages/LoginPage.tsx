import { useEffect, useState } from "react";
import { Eye, EyeOff, Zap, KeyRound, BarChart3 } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useResellerAuth } from "../providers/ResellerAuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 6.294C4.672 4.169 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, initializing } = useResellerAuth();

  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const routeState = location.state as
    | { from?: string; loggedOut?: boolean }
    | null;

  const forceOverviewAfterLogin =
    window.sessionStorage.getItem("forceOverviewAfterLogin") === "1";

  const redirectTo = forceOverviewAfterLogin
    ? "/app/overview"
    : routeState?.from || "/app/overview";

  useEffect(() => {
    if (!initializing && isAuthenticated) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuthenticated, initializing, navigate, redirectTo]);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      await login(email.trim(), password);

      window.sessionStorage.removeItem("forceOverviewAfterLogin");
      navigate("/app/overview", { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setError("");
    setSuccess("");
    setError("Sign up is not available yet. Please contact admin.");
  };

  const handleGoogle = async () => {
    try {
      setGoogleLoading(true);
      setError("");
      setSuccess("");
      setError("Google login is not supported yet.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading && email && password) {
      void (tab === "signin" ? handleSignIn() : handleSignUp());
    }
  };

  const canSubmit =
    !!email.trim() &&
    !!password &&
    (tab === "signin" || !!confirmPassword);

  const featureItems = [
    {
      icon: <Zap size={18} />,
      title: "Live order tracking",
      desc: "Real-time status for all connections",
    },
    {
      icon: <KeyRound size={18} />,
      title: "Access key management",
      desc: "One-click activate, stop & renew",
    },
    {
      icon: <BarChart3 size={18} />,
      title: "Revenue insights",
      desc: "Track usage, value & expiry in one view",
    },
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
        {/* Brand logo */}
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

        {/* Feature list */}
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
          <h2 className="font-display text-2xl font-bold text-foreground">
            {tab === "signin" ? "Welcome back" : "Create account"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tab === "signin"
              ? "Sign in to your reseller account"
              : "Start managing your VPN reseller business"}
          </p>

          {/* Segmented tab toggle */}
          <div className="mt-6 grid grid-cols-2 gap-1 rounded-md border border-border bg-secondary/50 p-1">
            <button
              type="button"
              onClick={() => { setTab("signin"); setError(""); setSuccess(""); }}
              className={`py-1.5 text-sm transition-colors ${
                tab === "signin"
                  ? "rounded-[6px] bg-card text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setError("Sign up is not available yet. Please contact admin."); setSuccess(""); }}
              className={`py-1.5 text-sm transition-colors ${
                tab === "signup"
                  ? "rounded-[6px] bg-card text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <div className="mt-5 space-y-4">
            {error ? (
              <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-md border border-success/25 bg-success/10 px-3 py-2 text-sm text-[color:var(--success)]">
                {success}
              </div>
            ) : null}

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

            {tab === "signup" && (
              <FormField label="Confirm password">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  onKeyDown={onKeyDown}
                  disabled={loading}
                />
              </FormField>
            )}

            <Button
              variant="primary"
              fullWidth
              className="h-11"
              disabled={loading || !canSubmit}
              onClick={() => void (tab === "signin" ? handleSignIn() : handleSignUp())}
            >
              {loading
                ? tab === "signin" ? "Signing in…" : "Creating account…"
                : tab === "signin" ? "Sign In" : "Create Account"}
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or continue with</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              variant="outline"
              fullWidth
              className="h-11"
              disabled={googleLoading}
              leftIcon={<GoogleIcon />}
              onClick={() => void handleGoogle()}
            >
              {googleLoading ? "Redirecting…" : "Continue with Google"}
            </Button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By signing in you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
