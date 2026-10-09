import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { X } from "lucide-react";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { LandingPage } from "./components/LandingPage";
import { Navbar } from "./components/layout/Navbar";
import { AdminProtectedRoute } from "./components/routing/AdminProtectedRoute";
import { RequireAuth, RequireRole } from "./components/routing/RouteGuards";
import { PageLoader } from "./components/shared/PageState";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";

const named = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const OnboardingPage = named(() => import("./pages/OnboardingPage"), "OnboardingPage");
const SeekerFeedPage = named(() => import("./pages/SeekerFeedPage"), "SeekerFeedPage");
const SearchPage = named(() => import("./pages/SearchPage"), "SearchPage");
const RequestsPage = named(() => import("./pages/RequestsPage"), "RequestsPage");
const ParentDashboardPage = named(() => import("./pages/ParentDashboardPage"), "ParentDashboardPage");
const FamilyPage = named(() => import("./pages/FamilyPage"), "FamilyPage");
const ChatListPage = named(() => import("./pages/ChatListPage"), "ChatListPage");
const ChatRoomPage = named(() => import("./pages/ChatRoomPage"), "ChatRoomPage");
const ProfilePage = named(() => import("./pages/ProfilePage"), "ProfilePage");
const ReadinessHubPage = named(() => import("./pages/ReadinessHubPage"), "ReadinessHubPage");
const ReadinessModulePage = named(() => import("./pages/ReadinessModulePage"), "ReadinessModulePage");
const AdminDashboardPage = named(() => import("./components/admin/AdminDashboard"), "AdminDashboard");
const UnauthorizedPage = named(() => import("./pages/StatusPages"), "UnauthorizedPage");
const NotFoundPage = named(() => import("./pages/StatusPages"), "NotFoundPage");

function BlockedBanner() {
  const { blockedMessage, dismissBlocked } = useAuth();
  if (!blockedMessage) return null;
  return (
    <div role="alert" className="flex items-center justify-between gap-3 bg-rose-700 px-4 py-2 text-sm text-white">
      <span>{blockedMessage} Contact support if you believe this is a mistake.</span>
      <button type="button" onClick={dismissBlocked} aria-label="Dismiss" className="rounded p-1 hover:bg-white/10">
        <X className="size-4" />
      </button>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-slate-50 font-sans antialiased">
            <Navbar />
            <BlockedBanner />
            <main className="pb-12">
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/onboarding" element={<OnboardingPage />} />
                  <Route path="/unauthorized" element={<UnauthorizedPage />} />

                  <Route
                    path="/feed"
                    element={
                      <RequireRole roles={["SOLO", "DEPENDENT"]}>
                        <SeekerFeedPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/search"
                    element={
                      <RequireRole roles={["SOLO", "DEPENDENT"]}>
                        <SearchPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/requests"
                    element={
                      <RequireRole roles={["SOLO", "DEPENDENT"]}>
                        <RequestsPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/parent-dashboard"
                    element={
                      <RequireRole roles={["PARENT"]}>
                        <ParentDashboardPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/family"
                    element={
                      <RequireRole roles={["SOLO", "DEPENDENT", "PARENT", "MAHRAM"]}>
                        <FamilyPage />
                      </RequireRole>
                    }
                  />
                  <Route
                    path="/chats"
                    element={
                      <RequireAuth>
                        <ChatListPage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/chat/:connectionId"
                    element={
                      <RequireAuth>
                        <ChatRoomPage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/readiness"
                    element={
                      <RequireAuth>
                        <ReadinessHubPage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/readiness/:moduleId"
                    element={
                      <RequireAuth>
                        <ReadinessModulePage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <RequireAuth>
                        <ProfilePage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin"
                    element={
                      <AdminProtectedRoute>
                        <AdminDashboardPage />
                      </AdminProtectedRoute>
                    }
                  />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </main>
            <Toaster position="top-center" richColors />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
