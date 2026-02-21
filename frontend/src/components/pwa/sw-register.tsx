"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function ServiceWorkerRegister() {
  const pathname = usePathname();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext) return;

    // Public agreement pages should not present installable-app behavior.
    if (pathname?.startsWith('/agreement')) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => {
          registrations.forEach((registration) => {
            registration.unregister().catch(() => {});
          });
        })
        .catch(() => {});
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed:', error);
    });
  }, [pathname]);

  return null;
}
