import { Navigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const { lang } = useParams();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-navy-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/${lang || 'tr'}/login`} replace />;
  }

  if (requireAdmin && !profile?.is_super_admin) {
    return <Navigate to={`/${lang || 'tr'}`} replace />;
  }

  return <>{children}</>;
}
