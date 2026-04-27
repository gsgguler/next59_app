import { BrowserRouter, Routes, Route, Navigate, useParams, Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import ErrorBoundary from './components/ui/ErrorBoundary';
import ProtectedRoute from './components/auth/ProtectedRoute';
import PublicRoute from './components/auth/PublicRoute';
import DashboardLayout from './components/layout/DashboardLayout';
import PublicLayout from './components/layout/PublicLayout';
import HomePage from './pages/HomePage';
import MatchDetailPage from './pages/MatchDetailPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardHome from './pages/DashboardHome';
import MatchListPage from './pages/MatchListPage';
import PredictionsListPage from './pages/PredictionsListPage';
import PredictionDetailPage from './pages/PredictionDetailPage';
import DebatesListPage from './pages/DebatesListPage';
import DebateDetailPage from './pages/DebateDetailPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import PlaceholderPage from './pages/PlaceholderPage';
import NotFoundPage from './pages/NotFoundPage';
import PrivacyPage from './pages/legal/PrivacyPage';
import TermsPage from './pages/legal/TermsPage';
import KvkkPage from './pages/legal/KvkkPage';
import CookiesPage from './pages/legal/CookiesPage';

function LocaleSync() {
  const { lang } = useParams();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (lang && i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }
  }, [lang, i18n]);

  return <Outlet />;
}

function LocaleRoot() {
  const { lang } = useParams();
  const { i18n } = useTranslation();

  if (!lang || !['tr', 'en'].includes(lang)) {
    return <Navigate to={`/${i18n.language || 'en'}`} replace />;
  }

  return <LocaleSync />;
}

function RootRedirect() {
  const { i18n } = useTranslation();
  return <Navigate to={`/${i18n.language || 'tr'}`} replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/:lang" element={<LocaleRoot />}>
                <Route element={<PublicLayout />}>
                  <Route index element={<HomePage />} />
                  <Route path="mac/:matchId" element={<MatchDetailPage />} />
                </Route>

                <Route path="login" element={<PublicRoute><LoginPage /></PublicRoute>} />
                <Route path="register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

                <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                  <Route path="dashboard" element={<DashboardHome />} />
                  <Route path="matches" element={<MatchListPage />} />
                  <Route path="predictions" element={<PredictionsListPage />} />
                  <Route path="predictions/:id" element={<PredictionDetailPage />} />
                  <Route path="debates" element={<DebatesListPage />} />
                  <Route path="debates/:predictionId" element={<DebateDetailPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="news" element={<PlaceholderPage title="Haberler" />} />
                </Route>

                <Route path="admin" element={<ProtectedRoute requireAdmin><DashboardLayout /></ProtectedRoute>}>
                  <Route index element={<AdminPage />} />
                </Route>

                <Route path="privacy" element={<PrivacyPage />} />
                <Route path="terms" element={<TermsPage />} />
                <Route path="kvkk" element={<KvkkPage />} />
                <Route path="cookies" element={<CookiesPage />} />

                <Route path="*" element={<NotFoundPage />} />
              </Route>
              <Route path="*" element={<RootRedirect />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
