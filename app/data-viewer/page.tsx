'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { useMatchDataCache } from '@/hooks/useMatchDataCache';
import { Year2026Viewer } from '@/components/data-viewers/2026Viewer';

export default function DataViewerPage() {
  const router = useRouter();
  const { user, userData, isAuthChecking, isAdmin } = useAuth();
  const { pageVisibility, isLoadingVisibility } = usePageVisibility();

  const { rows, reports, baMatches, eventContext, isLoading: cacheLoading, isFromCache } = useMatchDataCache(
    Boolean(userData?.approved),
    user?.uid || null
  );

  const [isPageReady, setIsPageReady] = useState(true);

  useEffect(() => {
    if (!isAuthChecking && !user) {
      router.push('/login');
    }
  }, [isAuthChecking, router, user]);

  useEffect(() => {
    if (!isLoadingVisibility && !pageVisibility.showDataViewer && !isAdmin) {
      router.push('/dashboard');
    }
  }, [isAdmin, isLoadingVisibility, pageVisibility.showDataViewer, router]);

  useEffect(() => {
    if (!cacheLoading && (Number(eventContext.year) < 2026 || eventContext.regional === 'casnv')) {
      router.replace('/legacy-data-viewer');
    }
  }, [eventContext.regional, eventContext.year, cacheLoading, router]);

  useEffect(() => {
    if (!cacheLoading && userData) {
      setIsPageReady(userData.approved || isAdmin);
    }
  }, [cacheLoading, userData, isAdmin]);

  if (isAuthChecking || isLoadingVisibility || cacheLoading || !isPageReady) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (Number(eventContext.year) < 2026 || eventContext.regional === 'casnv') return null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {isFromCache && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200">
          Showing cached data. Refresh to get latest.
        </div>
      )}
      <Year2026Viewer
        rows={rows}
        reports={reports}
        baMatches={baMatches}
        year={eventContext.year}
        regional={eventContext.regional}
        regionalCode={eventContext.regionalCode}
      />
    </div>
  );
}
