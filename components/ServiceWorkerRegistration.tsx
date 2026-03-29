'use client';

import { useEffect } from 'react';
import { flushOfflineQueue } from '@/lib/offlineQueue';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch {
        // Ignore registration errors.
      }
    };

    register();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const syncQueue = async () => {
      if (!navigator.onLine) return;
      try {
        await flushOfflineQueue();
      } catch {
        // Ignore sync errors; the queue will retry on the next load or reconnect.
      }
    };

    syncQueue();

    const handleOnline = () => {
      if (!cancelled) {
        void syncQueue();
      }
    };

    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return null;
}
