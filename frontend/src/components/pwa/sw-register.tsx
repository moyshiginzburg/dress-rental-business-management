"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { pushApi } from '@/lib/api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

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

    navigator.serviceWorker.register('/sw.js')
      .then(async (registration) => {
        try {
          registration.update().catch(() => {});
          let subscription = await registration.pushManager.getSubscription();
          
          if (!subscription) {
            const response = await pushApi.getVapidKey();
            if (response?.data?.publicKey && Notification.permission !== 'denied') {
              const convertedVapidKey = urlBase64ToUint8Array(response.data.publicKey);
              subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedVapidKey
              });
            }
          }
          
          if (subscription) {
            await pushApi.subscribe(subscription);
          }
        } catch (pushError) {
          console.error('Push registration failed:', pushError);
        }
      })
      .catch((error) => {
        console.error('Service worker registration failed:', error);
      });
  }, [pathname]);

  return null;
}

export async function forceResubscribePush() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const existingSub = await registration.pushManager.getSubscription();
    if (existingSub) {
      try {
        await pushApi.unsubscribe(existingSub.endpoint);
      } catch (e) {
        console.error('Failed to unsubscribe old endpoint:', e);
      }
      await existingSub.unsubscribe();
    }
    const response = await pushApi.getVapidKey();
    if (response?.data?.publicKey) {
      const convertedVapidKey = urlBase64ToUint8Array(response.data.publicKey);
      const newSub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });
      if (newSub) {
        await pushApi.subscribe(newSub);
        return true;
      }
    }
  } catch (err) {
    console.error('Error in forceResubscribePush:', err);
  }
  return false;
}

