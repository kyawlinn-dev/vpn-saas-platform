import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Calculator,
  ReceiptText,
  Users,
  Send,
  Tags,
  Bell,
  Settings,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardContext } from "@/providers/DashboardDataProvider";
import { useResellerAuth } from "@/providers/ResellerAuthProvider";
import { Sidebar, type NavItem } from "./Sidebar";
import { Topbar } from "./Topbar";

const EXPANDED_WIDTH = 188;
const COLLAPSED_WIDTH = 60;

const NAV_ITEMS: NavItem[] = [
  { label: "Overview",        to: "/app/overview",         Icon: LayoutDashboard },
  { label: "Orders",          to: "/app/orders",           Icon: ReceiptText },
  { label: "Customers",       to: "/app/customers",        Icon: Users },
  { label: "Accounting",      to: "/app/accounting",       Icon: Calculator },
  { label: "Telegram Orders", to: "/app/telegram-orders",  Icon: Send },
  { label: "Plans",           to: "/app/plans",            Icon: Tags },
  { label: "Notifications",   to: "/app/notifications",    Icon: Bell },
  { label: "Settings",        to: "/app/settings",         Icon: Settings },
];

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined"
      ? window.matchMedia("(min-width: 768px)").matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isDesktop;
}

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh, loading, error, profile, profileLoading, profileError } = useDashboardContext();
  const { logout } = useResellerAuth();
  const isDesktop = useIsDesktop();

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("reseller-sidebar-collapsed") === "true"
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleSignOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const initials = useMemo(() => {
    const name = profile?.name ?? "";
    const letters = name.split(" ").map((w) => w[0]).filter(Boolean).join("").toUpperCase().slice(0, 2);
    return letters || "R";
  }, [profile?.name]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("reseller-sidebar-collapsed", String(next));
      return next;
    });
  };

  const isActive = (to: string) => location.pathname.startsWith(to);

  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  // Miniapp-only tabs (Telegram Orders / Notifications / Settings) are hidden
  // for dashboard-only resellers — they only make sense with a connected bot.
  // Default to hidden until the profile confirms access; miniapp resellers see
  // the tabs appear after the first /me response (~200 ms), which is fine.
  const hasMiniapp = profileLoading ? false : Boolean(profile?.has_miniapp);
  const MINIAPP_ONLY = new Set(["/app/telegram-orders", "/app/notifications", "/app/settings"]);
  const navItems = hasMiniapp ? NAV_ITEMS : NAV_ITEMS.filter((item) => !MINIAPP_ONLY.has(item.to));

  const sharedSidebarProps = {
    navItems,
    isActive,
    profile,
    profileLoading,
    initials,
    onSignOut: () => void handleSignOut(),
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Desktop sidebar ── */}
      <div
        className="hidden md:flex fixed left-0 top-0 z-40 h-screen"
        style={{ width: sidebarWidth }}
      >
        <Sidebar
          {...sharedSidebarProps}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
      </div>

      {/* ── Mobile drawer backdrop ── */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden transition-opacity duration-200",
          drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* ── Mobile drawer panel ── */}
      <div
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-[280px] md:hidden transition-transform duration-200",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar
          {...sharedSidebarProps}
          collapsed={false}
          forceExpanded
          onNavigate={() => setDrawerOpen(false)}
        />
      </div>

      {/* ── Main column ── */}
      <div
        className="transition-[padding-left] duration-200"
        style={{ paddingLeft: isDesktop ? sidebarWidth : 0 }}
      >
        <Topbar
          onOpenDrawer={() => setDrawerOpen(true)}
          loading={loading}
          onRefresh={() => void refresh()}
        />

        <main className="mx-auto w-full max-w-[1640px] px-2.5 py-3 md:px-4 md:py-3.5">
          {error && (
            <div
              role="alert"
              className="mb-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </div>
          )}
          {profileError && (
            <div
              role="alert"
              className="mb-3 rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-[color:var(--warning)]"
            >
              {profileError}
            </div>
          )}
          {profile?.status === "pending" && (
            <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-[color:var(--warning)]">
              <Clock size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Your account is pending approval</div>
                <p className="mt-0.5 text-xs opacity-90">
                  You can explore the dashboard and set up your brand &amp; payment info in Settings.
                  Creating live customers is unlocked once we approve your account — we'll be in touch.
                </p>
              </div>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
