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

export const metadata: Metadata = {
  title: 'Dress Rental Business Management',
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
        <ServiceWorkerRegister />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
