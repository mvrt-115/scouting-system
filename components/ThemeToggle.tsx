'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

type ThemeToggleProps = {
  compact?: boolean;
};

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { setTheme, resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`inline-flex items-center gap-2 rounded-lg border transition-colors ${
        compact
          ? 'h-10 w-10 items-center justify-center border-white/10 bg-white/10 text-purple-100 hover:bg-white/15'
          : 'h-11 w-full justify-start border-purple-200 bg-purple-50 px-4 text-purple-900 hover:bg-purple-100 dark:border-white/10 dark:bg-white/8 dark:text-purple-100 dark:hover:bg-white/14'
      }`}
      aria-label="Toggle theme"
      type="button"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
      {!compact ? <span className="text-sm font-semibold">{isDark ? 'Light Mode' : 'Dark Mode'}</span> : null}
    </button>
  );
}
