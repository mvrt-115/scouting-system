'use client';

import { useEffect, useState, useCallback } from 'react';
import { CloudOff, Cloud, RefreshCw } from 'lucide-react';
import { flushOfflineQueue, getOfflineQueueCount } from '@/lib/offlineQueue';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const updateQueueCount = useCallback(() => {
    setQueueCount(getOfflineQueueCount());
  }, []);

  const syncData = useCallback(async () => {
    const count = getOfflineQueueCount();
    if (count === 0) return;

    setIsSyncing(true);
    setSyncMessage(`Syncing ${count} item${count === 1 ? '' : 's'}...`);

    try {
      const result = await flushOfflineQueue();
      updateQueueCount();
      if (result.synced > 0) {
        setSyncMessage(`Synced ${result.synced} item${result.synced === 1 ? '' : 's'}!`);
      } else {
        setSyncMessage('');
      }
      if (result.failed > 0) {
        setSyncMessage(`Synced ${result.synced}, ${result.failed} failed`);
      }
    } catch {
      setSyncMessage('Sync failed');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(''), 3000);
    }
  }, [updateQueueCount]);

  useEffect(() => {
    // Initial state
    setIsOnline(navigator.onLine);
    updateQueueCount();

    const handleOnline = () => {
      setIsOnline(true);
      syncData();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleQueueUpdate = () => {
      updateQueueCount();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline-queue-updated', handleQueueUpdate);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-queue-updated', handleQueueUpdate);
    };
  }, [syncData, updateQueueCount]);

  if (isOnline && queueCount === 0 && !syncMessage) return null;

  return (
    <div className="sticky top-0 z-50">
      {!isOnline && (
        <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-semibold text-white">
          <CloudOff className="h-4 w-4" />
          <span>You are offline. Data will be saved locally and synced when you reconnect.</span>
          {queueCount > 0 && (
            <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs">
              {queueCount} pending
            </span>
          )}
        </div>
      )}

      {isOnline && queueCount > 0 && (
        <div className="flex items-center justify-center gap-2 bg-purple-600 px-4 py-2 text-sm font-semibold text-white">
          <Cloud className="h-4 w-4" />
          <span>{queueCount} item{queueCount === 1 ? '' : 's'} waiting to sync</span>
          <button
            onClick={syncData}
            disabled={isSyncing}
            className="ml-3 flex items-center gap-1 rounded-md bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30 disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      )}

      {syncMessage && (
        <div className="flex items-center justify-center gap-2 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
          <Cloud className="h-4 w-4" />
          <span>{syncMessage}</span>
        </div>
      )}
    </div>
  );
}
