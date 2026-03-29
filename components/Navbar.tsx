'use client';

import Link from 'next/link';
import { Shield, Home, ClipboardList, ListOrdered, Settings, LogOut, Database, Menu, X, ChevronDown } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useEffect, useState } from 'react';
import { usePageVisibility } from '@/hooks/usePageVisibility';

export function Navbar() {
  const { user, userData, isAuthChecking } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { pageVisibility } = usePageVisibility();

  useEffect(() => {
    const close = () => setProfileOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setMobileOpen(false);
    router.push('/');
  };

  const navLinks = [
    { href: '/', label: 'Home', icon: Home },
    ...(user
      ? [
          { href: '/dashboard', label: 'Dashboard', icon: ClipboardList },
          ...(pageVisibility.showDataViewer ? [{ href: '/data-viewer', label: 'Data Viewer', icon: Database }] : []),
          ...(pageVisibility.showLegacyDataViewer ? [{ href: '/legacy-data-viewer', label: 'Legacy Viewer', icon: Database }] : []),
          ...(pageVisibility.showPicklist ? [{ href: '/picklist', label: 'Picklist & AI', icon: ListOrdered }] : []),
          ...(pageVisibility.showSuperScoutViewer ? [{ href: '/superscout', label: 'Super Scout', icon: Database }] : []),
          { href: '/settings', label: 'Settings', icon: Settings },
        ]
      : []),
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-purple-300/20 bg-purple-950/90 text-white shadow-lg shadow-purple-950/20 backdrop-blur dark:bg-[#1b1722]/95">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-400/15 ring-1 ring-white/10">
            <Shield className="h-5 w-5 text-purple-200" />
          </div>
          <div>
            <div className="text-sm font-black uppercase tracking-[0.22em] text-purple-200">MVRT</div>
            <div className="text-base font-semibold text-white">Super Scout</div>
          </div>
        </Link>

        <div className="hidden items-center gap-2 lg:flex">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 hover:text-white"
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {label}
              </span>
            </Link>
          ))}

          {!isAuthChecking &&
            (user ? (
              <div className="relative ml-3" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((value) => !value)}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                >
                  <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-purple-400/20 text-xs font-black text-white">
                    {userData?.photoURL ? (
                      <img
                        src={userData.photoURL || '/default-pfp.png'}
                        alt="Profile"
                        className="h-full w-full object-cover object-center"
                        onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/default-pfp.png'; }}
                      />
                    ) : (
                      <span>{(userData?.name || user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <span className="max-w-32 truncate text-sm font-medium text-slate-300">
                    {userData?.name || user.displayName || user.email}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-300" />
                </button>

                {profileOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.75rem)] w-64 rounded-lg border border-purple-200 bg-white p-3 text-slate-900 shadow-2xl shadow-purple-950/15 dark:border-white/10 dark:bg-[#211b2a] dark:text-white">
                    <div className="border-b border-purple-100 px-1 pb-3 dark:border-white/10">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{userData?.name || user.displayName || 'Account'}</div>
                      <div className="truncate text-xs text-slate-500 dark:text-slate-300">{user.email}</div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <ThemeToggle />
                      <Link href="/settings" className="flex items-center gap-3 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm font-semibold text-purple-900 dark:border-white/10 dark:bg-white/5 dark:text-white" onClick={() => setProfileOpen(false)}>
                        <Settings className="h-4 w-4" />
                        Settings
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 rounded-lg bg-purple-900 px-4 py-3 text-sm font-semibold text-white dark:bg-white dark:text-slate-900"
                        type="button"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <Link href="/login" className="ml-3 rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-400">
                Login
              </Link>
            ))}
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileOpen((value) => !value)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-white/10 bg-[#17141f] px-4 py-4 lg:hidden">
          <div className="flex flex-col gap-2">
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100"
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-purple-200" />
                  {label}
                </span>
              </Link>
            ))}

            {!isAuthChecking &&
              (user ? (
                <>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                    {userData?.name || user.displayName || user.email}
                  </div>
                  <ThemeToggle />
                  <Link
                    href="/settings"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
                  >
                    Settings
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-lg bg-white px-4 py-3 text-left text-sm font-semibold text-slate-900"
                  >
                    <span className="flex items-center gap-3">
                      <LogOut className="h-4 w-4" />
                      Logout
                    </span>
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg bg-purple-500 px-4 py-3 text-sm font-semibold text-white"
                >
                  Login
                </Link>
              ))}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
