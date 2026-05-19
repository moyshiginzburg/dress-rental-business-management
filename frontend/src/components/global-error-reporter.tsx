"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/error-reporter";

export function GlobalErrorReporter() {
  useEffect(() => {
    // Catch unhandled JS errors (e.g. ReferenceError)
    const handleError = (event: ErrorEvent) => {
      reportClientError({
        message: event.message || 'Unknown JS Error',
        stack: event.error?.stack,
        component: 'GlobalHandler',
        extra: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        }
      });
    };

    // Catch unhandled promise rejections (e.g. fetch errors that weren't caught)
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportClientError({
        message: event.reason?.message || String(event.reason) || 'Unhandled Promise Rejection',
        stack: event.reason?.stack,
        component: 'UnhandledPromise',
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null; // This component doesn't render anything
}
