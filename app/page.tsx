'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ClipboardList, ClipboardPlus, Database, LogIn } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePageVisibility } from '@/hooks/usePageVisibility';

const TEAM_LOGO = '/logo.png';

export const dynamic = 'force-dynamic';

const navItems = [
  {
    href: '/dashboard',
    label: 'Assignments',
    icon: ClipboardList,
  },
  {
    href: '/pit-scout',
    label: 'Pit Scout',
    icon: ClipboardPlus,
  },
  {
    href: '/superscout',
    label: 'Super Scout',
    icon: Database,
  },
];

export default function Home() {
  const { user, isAuthChecking } = useAuth();
  const { pageVisibility } = usePageVisibility();
  const visibleNavItems = navItems.filter((item) => item.href !== '/superscout' || pageVisibility.showSuperScoutViewer);

  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-purple-50 text-purple-950 dark:bg-zinc-950 dark:text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.24),transparent_28%),radial-gradient(circle_at_78%_20%,rgba(147,51,234,0.18),transparent_25%),radial-gradient(circle_at_bottom,rgba(221,214,254,0.95),transparent_35%)] dark:hidden" />
        <div className="absolute -left-24 top-8 h-80 w-80 rounded-full bg-white/45 blur-3xl dark:hidden" />
        <div className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-purple-200/50 blur-3xl dark:hidden" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-5xl items-center px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid w-full items-stretch gap-4 lg:grid-cols-2">
          <div className="flex min-h-[220px] h-full flex-col items-center justify-center rounded-xl border border-purple-200/80 bg-white/80 px-6 py-8 text-center shadow-xl shadow-purple-900/10 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80 sm:px-10">
          <div className="relative h-28 w-28 rounded-xl border border-purple-200 bg-purple-100/80 p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
            <Image
              src={TEAM_LOGO}
              alt="MVRT logo"
              fill
              className="object-contain p-3"
              referrerPolicy="no-referrer"
            />
          </div>

          <h1 className="mt-5 text-center text-4xl font-black tracking-tight text-purple-950 dark:text-white sm:text-5xl">
            MVRT Super Scout
          </h1>

          <p className="mt-3 text-center text-sm font-medium text-purple-700 dark:text-zinc-300">
            {isAuthChecking ? 'Checking login...' : user ? `Signed in as ${user.displayName || user.email}` : 'Not signed in'}
          </p>

          <Link
            href={user ? '/dashboard' : '/login'}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-purple-700"
          >
            <LogIn className="h-4 w-4" />
            {user ? 'Open Dashboard' : 'Login'}
          </Link>
          </div>

          <div className="grid h-full gap-4 sm:grid-cols-3 lg:grid-cols-1">
          {visibleNavItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-[64px] h-full items-center justify-center gap-3 rounded-lg border border-purple-200 bg-white/85 px-4 py-5 text-sm font-bold text-purple-900 shadow-md shadow-purple-900/5 transition-all hover:-translate-y-0.5 hover:bg-purple-100 dark:border-zinc-800 dark:bg-zinc-900/85 dark:text-purple-200 dark:hover:bg-zinc-800"
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </div>
        </div>
      </section>
    </main>
  );
}
