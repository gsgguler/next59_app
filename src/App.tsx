import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import ErrorBoundary from './components/ui/ErrorBoundary';
import ProtectedRoute from './components/auth/ProtectedRoute';
import PublicRoute from './components/auth/PublicRoute';
import DashboardLayout from './components/layout/DashboardLayout';
import PublicLayout from './components/layout/PublicLayout';

// Public pages
import HomePage from './pages/HomePage';
import WorldCup2026Page from './pages/WorldCup2026Page';
import WorldCupHistoryPage from './pages/WorldCupHistoryPage';
import WcMatchDetailPage from './pages/WcMatchDetailPage';
import MatchDetailPage from './pages/MatchDetailPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import NotFoundPage from './pages/NotFoundPage';
import NotificationOptIn from './components/NotificationOptIn';
import UpdatePrompt from './components/UpdatePrompt';

// Archive
import ArchivePage from './pages/ArchivePage';
import LiglerPage from './pages/archive/LiglerPage';
import SezonlarPage from './pages/archive/SezonlarPage';
import TakimlarPage from './pages/archive/TakimlarPage';
import KarsilastirPage from './pages/archive/KarsilastirPage';
import HakemlerPage from './pages/archive/HakemlerPage';

// Futbol Analitiği
import FutbolAnalitigiPage from './pages/futbol-analitigi/FutbolAnalitigiPage';
import NasilCalisirPage from './pages/futbol-analitigi/NasilCalisirPage';
import MetodolojiPage from './pages/futbol-analitigi/MetodolojiPage';
import VeriKaynaklariPage from './pages/futbol-analitigi/VeriKaynaklariPage';
import BacktestPage from './pages/futbol-analitigi/BacktestPage';
import SozlukPage from './pages/futbol-analitigi/SozlukPage';

// Senaryolar
import SenaryolarPage from './pages/senaryolar/SenaryolarPage';
import GecmisMacOkumalariPage from './pages/senaryolar/GecmisMacOkumalariPage';
import FavoriNedenKaybederPage from './pages/senaryolar/FavoriNedenKaybederPage';
import MacHikayeleriPage from './pages/senaryolar/MacHikayeleriPage';

// Yazılar
import YazilarPage from './pages/yazilar/YazilarPage';
import AnalizlerPage from './pages/yazilar/AnalizlerPage';
import DunyaKupasi2026Page from './pages/yazilar/DunyaKupasi2026Page';
import EditorNotlariPage from './pages/yazilar/EditorNotlariPage';

// Next59
import Next59Page from './pages/next59/Next59Page';
import HakkimizdaPage from './pages/next59/HakkimizdaPage';
import BahisKarsitDurusPage from './pages/next59/BahisKarsitDurusPage';
import YayinIlkeleriPage from './pages/next59/YayinIlkeleriPage';
import SssPage from './pages/next59/SssPage';
import BasinPage from './pages/next59/BasinPage';
import IletisimPage from './pages/next59/IletisimPage';

// Legal
import PrivacyPage from './pages/legal/PrivacyPage';
import TermsPage from './pages/legal/TermsPage';
import KvkkPage from './pages/legal/KvkkPage';
import CookiesPage from './pages/legal/CookiesPage';
import YasalUyariPage from './pages/legal/YasalUyariPage';

// Dashboard
import DashboardHome from './pages/DashboardHome';
import MatchListPage from './pages/MatchListPage';
import PredictionsListPage from './pages/PredictionsListPage';
import PredictionDetailPage from './pages/PredictionDetailPage';
import DebatesListPage from './pages/DebatesListPage';
import DebateDetailPage from './pages/DebateDetailPage';
import AdminPage from './pages/AdminPage';
import ModelLabPage from './pages/admin/ModelLabPage';
import ModelLabBacktestPage from './pages/admin/ModelLabBacktestPage';
import ModelLabMacIncelemePage from './pages/admin/ModelLabMacIncelemePage';
import ModelLabKalibrasyonPage from './pages/admin/ModelLabKalibrasyonPage';
import ModelLabHataAnaliziPage from './pages/admin/ModelLabHataAnaliziPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import PlaceholderPage from './pages/PlaceholderPage';
import AuthDebugPage from './pages/AuthDebugPage';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              {/* ── Public Layout ── */}
              <Route element={<PublicLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/mac/:matchId" element={<MatchDetailPage />} />
                <Route path="/world-cup-2026" element={<WorldCup2026Page />} />
                <Route path="/world-cup/tarihce" element={<WorldCupHistoryPage />} />
                <Route path="/world-cup/tarihce/mac/:matchId" element={<WcMatchDetailPage />} />

                {/* Maç Arşivi */}
                <Route path="/mac-arsivi" element={<ArchivePage />} />
                <Route path="/mac-arsivi/ligler" element={<LiglerPage />} />
                <Route path="/mac-arsivi/sezonlar" element={<SezonlarPage />} />
                <Route path="/mac-arsivi/takimlar" element={<TakimlarPage />} />
                <Route path="/mac-arsivi/karsilastir" element={<KarsilastirPage />} />
                <Route path="/mac-arsivi/hakemler" element={<HakemlerPage />} />

                {/* Legacy alias */}
                <Route path="/archive" element={<Navigate to="/mac-arsivi" replace />} />

                {/* Futbol Analitiği */}
                <Route path="/futbol-analitigi" element={<FutbolAnalitigiPage />} />
                <Route path="/futbol-analitigi/nasil-calisir" element={<NasilCalisirPage />} />
                <Route path="/futbol-analitigi/metodoloji" element={<MetodolojiPage />} />
                <Route path="/futbol-analitigi/veri-kaynaklari" element={<VeriKaynaklariPage />} />
                <Route path="/futbol-analitigi/backtest" element={<BacktestPage />} />
                <Route path="/futbol-analitigi/sozluk" element={<SozlukPage />} />

                {/* Senaryolar */}
                <Route path="/senaryolar" element={<SenaryolarPage />} />
                <Route path="/senaryolar/gecmis-mac-okumalari" element={<GecmisMacOkumalariPage />} />
                <Route path="/senaryolar/favori-neden-kaybeder" element={<FavoriNedenKaybederPage />} />
                <Route path="/senaryolar/mac-hikayeleri" element={<MacHikayeleriPage />} />

                {/* Yazılar */}
                <Route path="/yazilar" element={<YazilarPage />} />
                <Route path="/yazilar/analizler" element={<AnalizlerPage />} />
                <Route path="/yazilar/dunya-kupasi-2026" element={<DunyaKupasi2026Page />} />
                <Route path="/yazilar/editor-notlari" element={<EditorNotlariPage />} />

                {/* Next59 */}
                <Route path="/next59" element={<Next59Page />} />
                <Route path="/next59/hakkimizda" element={<HakkimizdaPage />} />
                <Route path="/next59/yayin-ilkeleri" element={<YayinIlkeleriPage />} />
                <Route path="/next59/bahis-karsiti-durus" element={<BahisKarsitDurusPage />} />
                <Route path="/next59/sss" element={<SssPage />} />
                <Route path="/next59/basin" element={<BasinPage />} />
                <Route path="/next59/iletisim" element={<IletisimPage />} />

                {/* Legal */}
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/kvkk" element={<KvkkPage />} />
                <Route path="/cookies" element={<CookiesPage />} />
                <Route path="/yasal-uyari" element={<YasalUyariPage />} />
              </Route>

              {/* ── Auth routes ── */}
              <Route path="/giris" element={<PublicRoute><LoginPage /></PublicRoute>} />
              <Route path="/kayit" element={<PublicRoute><RegisterPage /></PublicRoute>} />
              {/* Legacy aliases */}
              <Route path="/login" element={<Navigate to="/giris" replace />} />
              <Route path="/register" element={<Navigate to="/kayit" replace />} />

              {/* ── Dashboard (protected) ── */}
              <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route path="dashboard" element={<DashboardHome />} />
                <Route path="dashboard/mac-arsivi" element={<ArchivePage />} />
                <Route path="dashboard/senaryolar" element={<PlaceholderPage title="Senaryolarım" />} />
                <Route path="dashboard/izleme-listem" element={<PlaceholderPage title="İzleme Listem" />} />
                <Route path="dashboard/favori-takimlar" element={<PlaceholderPage title="Favori Takımlar" />} />
                <Route path="matches" element={<MatchListPage />} />
                <Route path="predictions" element={<PredictionsListPage />} />
                <Route path="predictions/:id" element={<PredictionDetailPage />} />
                <Route path="debates" element={<DebatesListPage />} />
                <Route path="debates/:predictionId" element={<DebateDetailPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="news" element={<PlaceholderPage title="Haberler" />} />
                <Route path="auth-debug" element={<AuthDebugPage />} />
              </Route>

              {/* ── Admin (protected + admin role) ── */}
              <Route path="/admin" element={<ProtectedRoute requireAdmin><DashboardLayout /></ProtectedRoute>}>
                <Route index element={<AdminPage />} />
                <Route path="veri-kontrol" element={<PlaceholderPage title="Veri Kontrol" />} />
                <Route path="mac-yonetimi" element={<PlaceholderPage title="Maç Yönetimi" />} />
                <Route path="takim-eslestirme" element={<PlaceholderPage title="Takım Eşleştirme" />} />
                <Route path="icerik-yonetimi" element={<PlaceholderPage title="İçerik Yönetimi" />} />
                <Route path="kullanicilar" element={<PlaceholderPage title="Kullanıcılar" />} />
                <Route path="sistem-sagligi" element={<PlaceholderPage title="Sistem Sağlığı" />} />
                {/* Model Lab */}
                <Route path="model-lab" element={<ModelLabPage />} />
                <Route path="model-lab/backtest" element={<ModelLabBacktestPage />} />
                <Route path="model-lab/mac-inceleme" element={<ModelLabMacIncelemePage />} />
                <Route path="model-lab/kalibrasyon" element={<ModelLabKalibrasyonPage />} />
                <Route path="model-lab/hata-analizi" element={<ModelLabHataAnaliziPage />} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            <UpdatePrompt />
            <NotificationOptIn />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
