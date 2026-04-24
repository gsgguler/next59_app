import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import ProtectedRoute from './components/auth/ProtectedRoute';
import PublicRoute from './components/auth/PublicRoute';
import DashboardLayout from './components/layout/DashboardLayout';
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

function RootRoute() {
  const auth = localStorage.getItem('sb-jsordrrshzivxayryryi-auth-token');
  if (auth) return <Navigate to="/dashboard" replace />;
  return (
    <div className="min-h-screen bg-[#0a1628] text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-5xl font-serif mb-4">Next59</h1>
      <p className="text-xl text-gray-300 mb-2">AI Futbol Gazetesi</p>
      <p className="text-sm text-gray-400 mb-8">Maçın 90 dakikasını, maç başlamadan yazıyoruz.</p>
      <div className="flex gap-4">
        <a href="/login" className="bg-[#c5a572] text-[#0a1628] px-6 py-2 rounded font-semibold">Giriş Yap</a>
        <a href="/register" className="border border-[#c5a572] text-[#c5a572] px-6 py-2 rounded">Üye Ol</a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

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

            <Route path="/admin" element={<ProtectedRoute requireAdmin><DashboardLayout /></ProtectedRoute>}>
              <Route index element={<AdminPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
