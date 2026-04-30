import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
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
            Beklenmeyen bir hata olu\u015ftu
          </h1>
          <p className="text-gray-500 mb-8 leading-relaxed">
            Bir \u015feyler yanl\u0131\u015f gitti. Sayfay\u0131 yeniden y\u00fcklemeyi deneyin veya ana sayfaya d\u00f6n\u00fcn.
          </p>

          {process.env.NODE_ENV === 'development' && this.state.error && (
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
