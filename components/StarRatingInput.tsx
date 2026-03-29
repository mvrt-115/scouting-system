'use client';

import { Star } from 'lucide-react';

type StarRatingInputProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

export function StarRatingInput({ label, value, onChange }: StarRatingInputProps) {
  const normalizedValue = Math.max(0, Math.min(10, Math.round(value)));

  return (
    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
      <span className="mb-2 block">{label}</span>
      <div className="rounded-lg border border-purple-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="grid grid-cols-5 gap-1 text-purple-500 dark:text-purple-300 lg:grid-cols-10">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((position) => (
            <button
              key={position}
              type="button"
              onClick={() => onChange(position)}
              className="flex h-10 w-full items-center justify-center rounded-md hover:bg-purple-50 dark:hover:bg-zinc-800 lg:h-11"
              aria-label={`${label} ${position} stars`}
            >
              <Star className={`h-5 w-5 ${normalizedValue >= position ? 'fill-current' : ''}`} />
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => onChange(0)}
            className="rounded-md border border-purple-200 px-3 py-1 text-xs font-bold text-purple-700 dark:border-zinc-700 dark:text-purple-200"
          >
            {normalizedValue}/10
          </button>
        </div>
      </div>
    </label>
  );
}
