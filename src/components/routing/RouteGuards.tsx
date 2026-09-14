import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ROLE_HOME } from "../../lib/constants";
import type { UserRole } from "../../lib/contracts";
import { useAuth } from "../../context/AuthContext";
import { PageLoader } from "../shared/PageState";

/** Requires a signed-in user who has finished onboarding. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === "loading") return <PageLoader />;
  if (!user) return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />;
  if (!user.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

/** Requires one of the given roles; other roles are sent to their own home. */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { status, user } = useAuth();
  if (status === "loading") return <PageLoader />;
  if (!user) return <Navigate to="/onboarding" replace />;
  if (!user.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  if (!roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <>{children}</>;
}
