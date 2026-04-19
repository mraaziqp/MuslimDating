import React from 'react';
import { useAuth } from './AuthProvider';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) {
          errorMessage = `Firestore Error: ${parsed.error} during ${parsed.operationType} on ${parsed.path}`;
        }
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="p-8 text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Application Error</h2>
          <p className="text-gray-600 mb-6">{errorMessage}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-white rounded-md"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
