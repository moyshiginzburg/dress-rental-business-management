/**
 * Root Layout Component
 * 
 * Purpose: Provides the base HTML structure and global styles for the entire application.
 * Includes RTL support for Hebrew content.
 */

import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { ServiceWorkerRegister } from '@/components/pwa/sw-register';
import { ErrorBoundary } from '@/components/error-boundary';
import { GlobalErrorReporter } from '@/components/global-error-reporter';

export const metadata: Metadata = {
  title: 'ישראל ישראלי - ניהול עסק',
  description: 'מערכת ניהול עסק להשכרת ותפירת שמלות ערב',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-background antialiased">
        <GlobalErrorReporter />
        <ServiceWorkerRegister />
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <Toaster />
      </body>
    </html>
  );
}
