'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function LegacyScoutRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const year = String(params.year || '').trim();
    const regional = searchParams.get('regional') || '';
    const team = searchParams.get('team') || '';
    const match = searchParams.get('match') || '';

    const next = new URLSearchParams();
    if (year) next.set('year', year);
    if (regional) next.set('regional', regional);
    if (team) next.set('team', team);
    if (match) next.set('match', match);

    const target = next.toString() ? `/scout?${next.toString()}` : '/scout';
    router.replace(target);
  }, [params.year, router, searchParams]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      <p className="text-sm font-medium text-slate-600">Opening scout...</p>
    </div>
  );
}
