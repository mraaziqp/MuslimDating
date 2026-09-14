import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { PageLoader } from "../shared/PageState";

type Verification = "pending" | "granted" | "denied";

/**
 * Guards /admin. The cached user is never trusted on its own: on entry the
 * token (session JWT or Firebase ID token) is re-validated by the server and
 * the role is read fresh from the database. The API enforces the same check
 * on every admin request.
 */
export function AdminProtectedRoute({ children }: { children: ReactNode }) {
  const { status, user, refresh } = useAuth();
  const [verification, setVerification] = useState<Verification>("pending");

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    void refresh().then((fresh) => {
      if (!cancelled) setVerification(fresh?.role === "ADMIN" ? "granted" : "denied");
    });
    return () => {
      cancelled = true;
    };
  }, [status, refresh]);

  if (status === "loading" || (status === "authenticated" && verification === "pending")) {
    return <PageLoader label="Verifying administrator access…" />;
  }
  if (!user) return <Navigate to="/onboarding" replace state={{ from: "/admin" }} />;
  if (verification !== "granted" || user.role !== "ADMIN") return <Navigate to="/unauthorized" replace />;
  return <>{children}</>;
}
