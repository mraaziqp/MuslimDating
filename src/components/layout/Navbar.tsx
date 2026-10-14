import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Compass, Heart, LayoutDashboard, LogOut, MessageSquare, Send, Shield, Users } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../../context/AuthContext";
import { usePolling } from "../../hooks/useAsync";
import { onActivityChanged } from "../../lib/activity";
import { api } from "../../lib/api";
import { ROLE_HOME, ROLE_LABELS } from "../../lib/constants";
import type { ActivitySummary, UserRole } from "../../lib/contracts";
import { initials } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Button, buttonVariants } from "../ui/button";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** Which activity count, if any, is shown as a badge on this item. */
  badge?: keyof Pick<ActivitySummary, "needsResponse" | "unreadMessages">;
}

function navItemsFor(role: UserRole): NavItem[] {
  const chats: NavItem = { to: "/chats", label: "Chats", icon: <MessageSquare />, badge: "unreadMessages" };
  const family: NavItem = { to: "/family", label: "Family", icon: <Users /> };
  const readiness: NavItem = { to: "/readiness", label: "Readiness", icon: <BookOpen /> };
  const discover: NavItem = { to: "/discover", label: "Discover", icon: <Compass /> };
  switch (role) {
    case "SOLO":
    case "DEPENDENT":
      return [discover, { to: "/requests", label: "Requests", icon: <Send />, badge: "needsResponse" }, chats, readiness, family];
    case "PARENT":
      return [
        { to: "/parent-dashboard", label: "Wali", icon: <Shield />, badge: "needsResponse" },
        chats,
        family,
        readiness,
      ];
    case "MAHRAM":
      return [chats, family, readiness];
    case "ADMIN":
      return [{ to: "/admin", label: "Admin", icon: <LayoutDashboard /> }, discover];
  }
}

/** Screens that take the whole viewport and bring their own navigation. */
export function isImmersiveRoute(pathname: string): boolean {
  return pathname.startsWith("/chat/");
}

/** A chat belongs to the Chats tab even though its address is /chat/:id. */
function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.to === "/chats") return pathname === "/chats" || pathname.startsWith("/chat/");
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] leading-none font-bold text-white",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
      <span className="sr-only"> waiting for you</span>
    </span>
  );
}

/**
 * True while the on-screen keyboard is (very likely) up: a text field has focus
 * on a touch device. The tab bar steps aside so it is not parked on top of the keyboard.
 */
function useTypingOnTouch(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isTextField = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      target.matches("textarea, [contenteditable='true'], input:not([type=checkbox], [type=radio], [type=file], [type=button], [type=submit], [type=range])");
    const update = () => setTyping(window.matchMedia("(pointer: coarse)").matches && isTextField(document.activeElement));
    // Focus moves between fields as blur-then-focus; wait a tick so the bar does not flicker.
    const onFocusOut = () => window.setTimeout(update, 80);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);
  return typing;
}

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const typing = useTypingOnTouch();

  const onboarded = user?.onboardingCompleted === true;
  const items = user && onboarded ? navItemsFor(user.role) : [];
  const home = user && onboarded ? ROLE_HOME[user.role] : "/";
  const userId = onboarded ? user?.id : undefined;
  const immersive = isImmersiveRoute(pathname);

  const refreshSummary = useCallback(() => {
    if (!userId) {
      setSummary(null);
      return;
    }
    // Badges are a convenience: a failed refresh simply keeps the last counts.
    api.summary().then(setSummary, () => undefined);
  }, [userId]);

  // Moving between pages is usually when a count has just changed.
  useEffect(refreshSummary, [refreshSummary, pathname]);
  // ...or a page has just told us so (a chat was read, a request answered).
  useEffect(() => onActivityChanged(refreshSummary), [refreshSummary]);
  usePolling(refreshSummary, 45_000, userId !== undefined);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const badgeFor = (item: NavItem) => (item.badge && summary ? summary[item.badge] : 0);

  return (
    <>
      {/* On phones an immersive screen (the chat room) has its own header, so the app bar gives up its space. */}
      <nav
        className={cn(
          "sticky top-0 z-40 border-b bg-white/85 pt-[env(safe-area-inset-top)] backdrop-blur-md",
          immersive && "hidden lg:block",
        )}
      >
        <div className="mx-auto flex h-(--nav-h) max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to={home} className="flex h-10 items-center gap-2">
            <Heart className="size-6 fill-rose-600 text-rose-600 sm:size-7" aria-hidden />
            <span className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">NikahPath</span>
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors [&_svg]:size-4",
                  isItemActive(item, pathname) ? "bg-rose-50 text-rose-700" : "text-slate-600 hover:text-rose-600",
                )}
              >
                {item.icon}
                {item.label}
                <CountBadge count={badgeFor(item)} />
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {user ? (
              <>
                {onboarded && (
                  <NavLink
                    to="/profile"
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2 rounded-full p-1 text-sm transition-colors hover:bg-slate-100 sm:pr-3",
                        isActive && "bg-rose-50 ring-2 ring-rose-200",
                      )
                    }
                    title={ROLE_LABELS[user.role]}
                    aria-label="Your profile"
                  >
                    <span className="flex size-9 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-700 sm:size-8">
                      {initials(user.displayName ?? user.email)}
                    </span>
                    <span className="hidden max-w-32 truncate font-medium text-slate-700 sm:inline">
                      {user.displayName ?? "Profile"}
                    </span>
                  </NavLink>
                )}
                <Button variant="ghost" size="icon" onClick={() => void handleLogout()} aria-label="Sign out" title="Sign out">
                  <LogOut className="size-5 text-slate-600" />
                </Button>
              </>
            ) : (
              <Link to="/onboarding" className={cn(buttonVariants(), "bg-rose-600 px-4 text-white hover:bg-rose-700")}>
                Get Started
              </Link>
            )}
          </div>
        </div>
      </nav>

      {items.length > 0 && !immersive && (
        <nav
          aria-label="Primary"
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 pb-(--safe-bottom) backdrop-blur-md transition-transform duration-200 lg:hidden",
            typing && "translate-y-full",
          )}
        >
          <div className="mx-auto flex h-(--tabbar-h) max-w-lg items-stretch px-1">
            {items.map((item) => {
              const active = isItemActive(item, pathname);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors active:scale-95 [&_svg]:size-5",
                    active ? "text-rose-600" : "text-slate-500",
                  )}
                >
                  <span className="relative flex h-7 w-14 items-center justify-center">
                    {active && (
                      <motion.span
                        layoutId="tabbar-indicator"
                        className="absolute inset-0 rounded-full bg-rose-100/80"
                        transition={{ type: "spring", stiffness: 480, damping: 36 }}
                      />
                    )}
                    <span className="relative">
                      {item.icon}
                      <CountBadge count={badgeFor(item)} className="absolute -top-1.5 -right-2.5" />
                    </span>
                  </span>
                  <span className="max-w-full truncate px-0.5">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
