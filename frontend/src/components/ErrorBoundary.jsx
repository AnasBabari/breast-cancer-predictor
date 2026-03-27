import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button, Card } from "./ui";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <Card className="max-w-md w-full text-center border-red-200">
            <div className="bg-red-100 p-4 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-slate-600 mb-8">
              The application encountered an unexpected error. Please try reloading the page.
            </p>
            <Button 
              onClick={() => window.location.reload()} 
              className="w-full flex items-center gap-2 justify-center py-6"
            >
              <RotateCcw className="w-5 h-5" /> Reload Application
            </Button>
            {process.env.NODE_ENV === "development" && (
              <pre className="mt-6 p-4 bg-slate-900 text-red-400 text-xs text-left overflow-auto rounded-lg max-h-48">
                {this.state.error?.toString()}
              </pre>
            )}
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
