import { useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  Send,
  Shield,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ROLE_HOME, ROLE_LABELS } from "../../lib/constants";
import type { UserRole } from "../../lib/contracts";
import { initials } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Button, buttonVariants } from "../ui/button";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

function navItemsFor(role: UserRole): NavItem[] {
  const chats: NavItem = { to: "/chats", label: "Chats", icon: <MessageSquare className="size-4" /> };
  const family: NavItem = { to: "/family", label: "Family", icon: <Users className="size-4" /> };
  const readiness: NavItem = { to: "/readiness", label: "Readiness", icon: <BookOpen className="size-4" /> };
  switch (role) {
    case "SOLO":
    case "DEPENDENT":
      return [
        { to: "/feed", label: "Matches", icon: <Heart className="size-4" /> },
        { to: "/search", label: "Search", icon: <Search className="size-4" /> },
        { to: "/requests", label: "Requests", icon: <Send className="size-4" /> },
        chats,
        readiness,
        family,
      ];
    case "PARENT":
      return [{ to: "/parent-dashboard", label: "Wali Dashboard", icon: <Shield className="size-4" /> }, chats, family, readiness];
    case "MAHRAM":
      return [chats, family, readiness];
    case "ADMIN":
      return [
        { to: "/search", label: "Search", icon: <Search className="size-4" /> },
        { to: "/feed", label: "Matches", icon: <Heart className="size-4" /> },
        chats,
        { to: "/admin", label: "Admin", icon: <LayoutDashboard className="size-4" /> },
      ];
  }
}

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const items = user?.onboardingCompleted ? navItemsFor(user.role) : [];
  const home = user?.onboardingCompleted ? ROLE_HOME[user.role] : "/";

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate("/");
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
      isActive ? "bg-rose-50 text-rose-700" : "text-slate-600 hover:text-rose-600",
    );

  return (
    <nav className="sticky top-0 z-40 border-b bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to={home} className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <Heart className="size-7 fill-rose-600 text-rose-600" aria-hidden />
          <span className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">NikahPath</span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              {user.onboardingCompleted && (
                <NavLink
                  to="/profile"
                  className="hidden items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm hover:bg-slate-100 sm:flex"
                  title={ROLE_LABELS[user.role]}
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-700">
                    {initials(user.displayName ?? user.email)}
                  </span>
                  <span className="max-w-32 truncate font-medium text-slate-700">{user.displayName ?? "Profile"}</span>
                </NavLink>
              )}
              <Button variant="ghost" size="icon" onClick={handleLogout} className="hidden lg:flex" aria-label="Sign out">
                <LogOut className="size-5 text-slate-600" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setOpen((v) => !v)}
                aria-label="Toggle menu"
                aria-expanded={open}
              >
                {open ? <X className="size-5" /> : <Menu className="size-5" />}
              </Button>
            </>
          ) : (
            <Link to="/onboarding" className={cn(buttonVariants(), "bg-rose-600 px-4 text-white hover:bg-rose-700")}>
              Get Started
            </Link>
          )}
        </div>
      </div>

      {open && user && (
        <div className="border-t bg-white shadow-lg lg:hidden">
          <div className="space-y-0.5 px-4 py-2">
            {[...items, { to: "/profile", label: "Profile", icon: <UserCircle className="size-4" /> }]
              .filter((item) => user.onboardingCompleted || item.to !== "/profile")
              .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium",
                      isActive ? "bg-rose-50 text-rose-700" : "text-slate-700 hover:bg-rose-50",
                    )
                  }
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
