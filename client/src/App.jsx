import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ADMIN_ROUTE_PATH } from './lib/adminConfig';
import { ToastProvider } from './context/ToastContext';
import { trackPageView, trackPageDwell } from './lib/analytics';
import { CyberBackground } from './components/ui/CyberBackground';
import { Navbar } from './components/layout/Navbar';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { CommandPalette } from './components/ui/CommandPalette';
import { Footer } from './components/layout/Footer';
import { MaintenanceOverlay } from './components/ui/MaintenanceOverlay';
import { CookieNotificationBanner } from './components/ui/CookieNotificationBanner';
import { ChangelogModal } from './components/ui/ChangelogModal';
import { NotificationBridge } from './components/ui/NotificationBridge';

// Eagerly loaded (critical path)
import { HomePage } from './pages/HomePage';
import { AuthPage } from './pages/AuthPage';

// Lazy loaded (code split)
const PackagesPage = lazy(() => import('./pages/PackagesPage').then((m) => ({ default: m.PackagesPage })));
const DealsPage = lazy(() => import('./pages/DealsPage').then((m) => ({ default: m.DealsPage })));
const GiveawaysPage = lazy(() => import('./pages/GiveawaysPage').then((m) => ({ default: m.GiveawaysPage })));
const ServersPage = lazy(() => import('./pages/ServersPage').then((m) => ({ default: m.ServersPage })));
const ServerPanelPage = lazy(() => import('./pages/ServerPanelPage').then((m) => ({ default: m.ServerPanelPage })));
const TicketsPage = lazy(() => import('./pages/TicketsPage').then((m) => ({ default: m.TicketsPage })));
const AccountPage = lazy(() => import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })));
const LeaderboardInvitePage = lazy(() =>
  import('./pages/LeaderboardInvitePage').then((m) => ({ default: m.LeaderboardInvitePage }))
);
const StatusPage = lazy(() => import('./pages/StatusPage').then((m) => ({ default: m.StatusPage })));
const FaqPage = lazy(() => import('./pages/FaqPage').then((m) => ({ default: m.FaqPage })));
const LegalPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.LegalPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));

function PageLoader() {
  return (
    <div className="relative z-10 py-24 text-center text-zinc-400 text-sm" role="status" aria-live="polite">
      <span className="inline-block w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mr-3 align-middle" />
      Yükleniyor...
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { firebaseUser, loading } = useAuth();
  if (loading) {
    return (
      <div className="relative z-10 py-24 text-center text-zinc-400" role="status">
        Oturum doğrulanıyor...
      </div>
    );
  }
  if (!firebaseUser) return <Navigate to="/auth" replace />;
  return children;
}

function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    const currentPath = location.pathname;
    trackPageView(currentPath);
    window.scrollTo({ top: 0, behavior: 'auto' });

    let enteredAt = Date.now();
    let flushed = false;
    const flush = () => {
      if (flushed) return;
      const elapsed = Date.now() - enteredAt;
      if (elapsed >= 800) {
        trackPageDwell(currentPath, elapsed);
        flushed = true;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      } else {
        enteredAt = Date.now();
        flushed = false;
      }
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [location.pathname]);
  return null;
}

export default function App() {
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <RouteTracker />
          <div className="min-h-screen flex flex-col relative pb-20 lg:pb-0">
            <a href="#main-content" className="skip-link">
              Ana içeriğe geç
            </a>
            <CyberBackground />
            <MaintenanceOverlay />
            <NotificationBridge />
            <ChangelogModal />
            <CookieNotificationBanner />
            <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
            <Navbar onOpenCmd={() => setCmdOpen(true)} />
            <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/packages" element={<PackagesPage />} />
                  <Route path="/deals" element={<DealsPage />} />
                  <Route path="/giveaways" element={<GiveawaysPage />} />
                  <Route path="/leaderboard" element={<LeaderboardInvitePage />} />
                  <Route path="/status" element={<StatusPage />} />
                  <Route path="/sss" element={<FaqPage />} />
                  <Route path="/faq" element={<FaqPage />} />
                  <Route path="/gizlilik-politikasi" element={<LegalPage mode="privacy" />} />
                  <Route path="/privacy" element={<LegalPage mode="privacy" />} />
                  <Route path="/kvkk" element={<LegalPage mode="privacy" />} />
                  <Route path="/kullanim-sartlari" element={<LegalPage mode="terms" />} />
                  <Route path="/terms" element={<LegalPage mode="terms" />} />
                  <Route path="/tos" element={<LegalPage mode="terms" />} />
                  <Route path="/cerez-politikasi" element={<LegalPage mode="cookies" />} />
                  <Route path="/cookies" element={<LegalPage mode="cookies" />} />
                  <Route
                    path="/servers"
                    element={
                      <ProtectedRoute>
                        <ServersPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/servers/:id"
                    element={
                      <ProtectedRoute>
                        <ServerPanelPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/tickets"
                    element={
                      <ProtectedRoute>
                        <TicketsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/account"
                    element={
                      <ProtectedRoute>
                        <AccountPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path={ADMIN_ROUTE_PATH} element={<AdminPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </main>
            <Footer />
            <MobileBottomNav />
          </div>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
