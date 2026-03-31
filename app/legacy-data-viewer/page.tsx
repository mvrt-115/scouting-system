'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, doc, getDoc, getDocFromServer, getDocs, getDocsFromServer } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import DataViewer from '@/components/DataViewer';

const LEGACY_YEAR_CUTOFF = 2026;

function isLegacyYear(value: string) {
  const numericYear = Number(value);
  return Number.isFinite(numericYear) && numericYear > 0 && numericYear < LEGACY_YEAR_CUTOFF;
}

function sortYearsDesc(values: string[]) {
  return [...values].sort((a, b) => Number(b) - Number(a) || b.localeCompare(a));
}

export default function LegacyDataViewerPage() {
  const router = useRouter();
  const { user, isAuthChecking, isAdmin } = useAuth();
  const { pageVisibility, isLoadingVisibility } = usePageVisibility();
  const [eventContext, setEventContext] = useState({ year: '2025', regional: 'practice' });
  const [isLoadingEvent, setIsLoadingEvent] = useState(true);

  useEffect(() => {
    if (!isAuthChecking && !user) {
      router.push('/login');
    }
  }, [isAuthChecking, router, user]);

  useEffect(() => {
    const loadEvent = async () => {
      try {
        const yearsSnapshot = await getDocsFromServer(collection(db, 'years'));
        const legacyYears = sortYearsDesc(yearsSnapshot.docs.map((entry) => entry.id).filter(isLegacyYear));
        const latestLegacyYear = legacyYears[0] || '2025';
        setEventContext({
          year: latestLegacyYear,
          regional: '',
        });
      } finally {
        setIsLoadingEvent(false);
      }
    };

    loadEvent();
  }, []);

  useEffect(() => {
    if (!isLoadingEvent && !isAdmin && !isLegacyYear(eventContext.year)) {
      router.replace('/data-viewer');
    }
  }, [eventContext.regional, eventContext.year, isAdmin, isLoadingEvent, router]);

  useEffect(() => {
    if (!isLoadingVisibility && !pageVisibility.showLegacyDataViewer && !isAdmin) {
      router.push('/dashboard');
    }
  }, [isAdmin, isLoadingVisibility, pageVisibility.showLegacyDataViewer, router]);

  if (isAuthChecking || isLoadingVisibility || isLoadingEvent) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 rounded-[2rem] border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-purple-950 dark:text-white">Regional Explorer</h1>
            <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">Browse historical team data with regional averages, tables, and graphs.</p>
          </div>
          <div className="rounded-full bg-purple-50 px-4 py-2 text-sm font-bold text-purple-900 dark:bg-zinc-950 dark:text-purple-200">
            {eventContext.year} {eventContext.regional}
          </div>
        </div>
      </div>

      <DataViewer year={eventContext.year} regional={eventContext.regional} />
    </div>
  );
}
