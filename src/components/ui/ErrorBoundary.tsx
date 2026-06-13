import { Component, useEffect, useRef } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { captureError } from '../../lib/sentry';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryInner extends Component<Props & { locationKey: string }, State> {
  constructor(props: Props & { locationKey: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps: Props & { locationKey: string }) {
    if (prevProps.locationKey !== this.props.locationKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, { componentStack: info.componentStack ?? undefined });
  }

  private handleReload = () => {
    window.location.href = '/';
  };

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Beklenmeyen bir hata oluştu
          </h1>
          <p className="text-gray-500 mb-8 leading-relaxed">
            Bir şeyler yanlış gitti. Sayfayı yeniden yüklemeyi deneyin veya ana sayfaya dönün.
          </p>

          {import.meta.env.DEV && this.state.error && (
            <div className="mb-6 text-left bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <p className="text-red-400 text-xs font-mono break-all">
                {this.state.error.message}
              </p>
            </div>
          )}

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-navy-700 text-white text-sm font-medium hover:bg-navy-600 focus:ring-2 focus:ring-navy-500 focus:ring-offset-2 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Tekrar Dene
            </button>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 focus:ring-2 focus:ring-navy-500 focus:ring-offset-2 transition-all"
            >
              Ana Sayfa
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default function ErrorBoundary({ children }: Props) {
  const location = useLocation();
  return (
    <ErrorBoundaryInner locationKey={location.key}>
      {children}
    </ErrorBoundaryInner>
  );
}
