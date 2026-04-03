'use client';

import { useState, useEffect } from 'react';

export function useOfflineMode() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);

  useEffect(() => {
    // Check initial online status
    setIsOnline(navigator.onLine);
    
    // Check if user has enabled offline mode in localStorage
    const offlineModeEnabled = localStorage.getItem('offline-mode') === 'true';
    setIsOfflineMode(offlineModeEnabled);

    const handleOnline = () => {
      setIsOnline(true);
      // Don't automatically disable offline mode when coming back online
      // User should manually sync and disable
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const enableOfflineMode = () => {
    localStorage.setItem('offline-mode', 'true');
    setIsOfflineMode(true);
  };

  const disableOfflineMode = () => {
    localStorage.removeItem('offline-mode');
    setIsOfflineMode(false);
  };

  // User is effectively offline if browser is offline OR they've enabled offline mode
  const effectivelyOffline = !isOnline || isOfflineMode;

  return {
    isOnline,
    isOfflineMode,
    effectivelyOffline,
    enableOfflineMode,
    disableOfflineMode,
  };
}
