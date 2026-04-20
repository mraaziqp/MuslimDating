import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { Onboarding } from './components/Onboarding';
import { Toaster } from './components/ui/sonner';
import type { UserRole } from './lib/schema';

const SeekerFeed = lazy(() => import('./components/SeekerFeed').then((m) => ({ default: m.SeekerFeed })));
const ParentDashboard = lazy(() => import('./components/ParentDashboard').then((m) => ({ default: m.ParentDashboard })));
const ReadinessHub = lazy(() => import('./components/ReadinessHub').then((m) => ({ default: m.ReadinessHub })));
const ChatList = lazy(() => import('./components/ChatList').then((m) => ({ default: m.ChatList })));
const ChatRoom = lazy(() => import('./components/ChatRoom').then((m) => ({ default: m.ChatRoom })));
const ProfilePage = lazy(() => import('./components/ProfilePage').then((m) => ({ default: m.ProfilePage })));

// Where each role lands when they try to access an unauthorized route
const ROLE_HOME: Record<UserRole, string> = {
  SOLO: '/feed',
  DEPENDENT: '/feed',
  PARENT: '/parent-dashboard',
  MAHRAM: '/chats',
};

/** Redirects unauthenticated users to /onboarding */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser, dbUser, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center">Loading...</div>;
  if (!firebaseUser && !dbUser) return <Navigate to="/onboarding" />;
  return <>{children}</>;
};

/**
 * Guards a route to specific DB roles.
 * - Not logged in → /onboarding
 * - Logged in but no DB profile yet → /onboarding (still needs role selection)
 * - Wrong role → their correct home route
 */
const RoleProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles: UserRole[];
}> = ({ children, allowedRoles }) => {
  const { firebaseUser, dbUser, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center">Loading...</div>;
  if (!firebaseUser && !dbUser) return <Navigate to="/onboarding" replace />;
  if (!dbUser) return <Navigate to="/onboarding" replace />;
  if (!allowedRoles.includes(dbUser.role)) {
    return <Navigate to={ROLE_HOME[dbUser.role]} replace />;
  }
  return <>{children}</>;
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-slate-50 font-sans antialiased">
            <Navbar />
            <main className="pb-8">
              <Suspense fallback={<div className="h-screen flex items-center justify-center">Loading...</div>}>
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/onboarding" element={<Onboarding />} />

                  <Route path="/feed" element={
                    <RoleProtectedRoute allowedRoles={['SOLO', 'DEPENDENT', 'MAHRAM']}>
                      <SeekerFeed />
                    </RoleProtectedRoute>
                  } />

                  <Route path="/parent-dashboard" element={
                    <RoleProtectedRoute allowedRoles={['PARENT']}>
                      <ParentDashboard />
                    </RoleProtectedRoute>
                  } />

                  <Route path="/readiness" element={
                    <ProtectedRoute>
                      <ReadinessHub />
                    </ProtectedRoute>
                  } />

                  <Route path="/chats" element={
                    <ProtectedRoute>
                      <ChatList />
                    </ProtectedRoute>
                  } />

                  <Route path="/chat/:connectionId" element={
                    <ProtectedRoute>
                      <ChatRoom />
                    </ProtectedRoute>
                  } />

                  <Route path="/profile" element={
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  } />
                </Routes>
              </Suspense>
            </main>
            <Toaster position="top-center" />
          </div>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
