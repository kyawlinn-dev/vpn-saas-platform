import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

/**
 * Handles the Supabase password-recovery link.
 *
 * The backend sends the reset email using Supabase's implicit flow, so the
 * recovery link arrives with the access_token in the URL hash fragment:
 *   /reset-password#access_token=xxx&type=recovery&refresh_token=xxx
 *
 * We extract the token here, let the reseller choose a new password, then
 * POST to /api/auth/reseller/confirm-reset.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenType, setTokenType] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Parse the URL hash that Supabase appends to the redirect URL.
  useEffect(() => {
    const hash = window.location.hash.slice(1); // strip leading #
    const params = new URLSearchParams(hash);
    const token = params.get("access_token");
    const type = params.get("type");

    setAccessToken(token);
    setTokenType(type);

    // Clear the hash so the token isn't visible in the address bar.
    if (token) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const handleSubmit = async () => {
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      await api.post("/auth/reseller/confirm-reset", {
        access_token: accessToken,
        password,
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to reset password. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) void handleSubmit();
  };

  const isInvalidLink = !accessToken || tokenType !== "recovery";

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background px-4"
      style={{
        background:
          "radial-gradient(ellipse 100% 60% at 50% -5%, color-mix(in oklch, var(--primary) 10%, transparent), transparent), var(--background)",
      }}
    >
      <div className="w-full max-w-[420px] rounded-xl border border-border bg-card p-6 sm:p-8 shadow-[0_12px_48px_-16px_var(--primary)]">
        {/* Header */}
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-[color:var(--brand-blue)] shadow-[0_0_20px_-2px_var(--primary)] mb-5">
          <span className="font-display text-xl font-black text-primary-foreground">R</span>
        </div>

        {isInvalidLink ? (
          <>
            <h2 className="font-display text-2xl font-bold text-foreground">Invalid link</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This password reset link is invalid or has already been used. Please request a new one.
            </p>
            <Button
              variant="primary"
              fullWidth
              className="mt-6 h-11"
              onClick={() => navigate("/login")}
            >
              Back to Sign In
            </Button>
          </>
        ) : done ? (
          <>
            <h2 className="font-display text-2xl font-bold text-foreground">Password updated</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your password has been set successfully. You can now sign in with your new password.
            </p>
            <Button
              variant="primary"
              fullWidth
              className="mt-6 h-11"
              onClick={() => navigate("/login")}
            >
              Sign In
            </Button>
          </>
        ) : (
          <>
            <h2 className="font-display text-2xl font-bold text-foreground">Set new password</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a strong password for your reseller account.
            </p>

            <div className="mt-5 space-y-4">
              {error && (
                <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <FormField label="New password">
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    onKeyDown={onKeyDown}
                    disabled={loading}
                    className="pr-9"
                    autoFocus
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

              <Button
                variant="primary"
                fullWidth
                className="h-11"
                disabled={loading || !password || !confirmPassword}
                onClick={() => void handleSubmit()}
              >
                {loading ? "Updating…" : "Update Password"}
              </Button>

              <button
                type="button"
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => navigate("/login")}
              >
                Back to Sign In
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
