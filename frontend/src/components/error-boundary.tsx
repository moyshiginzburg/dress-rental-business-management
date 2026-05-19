"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { reportClientError } from "@/lib/error-reporter";
import { Button } from "@/components/ui/button";
import { AlertOctagon, RefreshCcw } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Report the error to the backend
    reportClientError({
      message: error.message || String(error),
      stack: error.stack,
      component: 'ErrorBoundary',
      extra: { componentStack: errorInfo.componentStack }
    });
    
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-500">
          <div className="bg-red-50 text-red-600 p-6 rounded-full mb-6 ring-8 ring-red-50/50">
            <AlertOctagon className="h-16 w-16" />
          </div>
          <h1 className="text-3xl font-black mb-4 text-gray-900">אופס! משהו השתבש...</h1>
          <p className="text-muted-foreground font-medium mb-8 max-w-md mx-auto text-lg leading-relaxed">
            קרתה שגיאה לא צפויה במערכת. הבעיה דווחה אוטומטית לצוות הפיתוח לטיפול מהיר.
          </p>
          <Button 
            onClick={() => window.location.reload()} 
            className="h-14 px-8 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-lg gap-2 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1"
          >
            <RefreshCcw className="h-5 w-5" />
            רענון העמוד
          </Button>
          
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <div className="mt-12 p-6 bg-gray-900 text-red-400 rounded-2xl text-left text-xs overflow-auto w-full max-w-4xl" dir="ltr">
              <p className="font-bold text-white text-base mb-2">{this.state.error.message}</p>
              <pre className="whitespace-pre-wrap font-mono opacity-80">{this.state.error.stack}</pre>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
