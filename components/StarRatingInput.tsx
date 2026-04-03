'use client';

import { Star, HelpCircle, X } from 'lucide-react';
import { useState } from 'react';

type StarRatingInputProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: {
    title: string;
    guidance: Array<{score: string; desc: string}>;
  };
};

export function StarRatingInput({ label, value, onChange, hint }: StarRatingInputProps) {
  const normalizedValue = Math.max(0, Math.min(10, Math.round(value)));
  const [showHint, setShowHint] = useState(false);

  // Find the guidance for the current value
  const currentGuidance = hint?.guidance.find((g) => {
    const [min, max] = g.score.split('-').map(Number);
    if (max) {
      return normalizedValue >= min && normalizedValue <= max;
    }
    return normalizedValue === min;
  });

  return (
    <div className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
      <span className="mb-2 block">{label}</span>
      
      {/* Hint Popup - shows above the stars */}
      {showHint && hint && (
        <div className="relative mb-2">
          <div className="absolute right-0 z-50 w-72 rounded-xl border border-purple-200 bg-white p-3 shadow-xl dark:border-purple-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-purple-900 dark:text-purple-200">{hint.title}</span>
              <button onClick={() => setShowHint(false)} className="text-purple-400 hover:text-purple-600">
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {hint.guidance.map((item) => (
                <div key={item.score} className={`flex items-start gap-2 text-xs ${normalizedValue >= Number(item.score.split('-')[0]) && normalizedValue <= (Number(item.score.split('-')[1]) || Number(item.score.split('-')[0])) ? 'bg-purple-50 dark:bg-purple-900/30 p-1 rounded' : ''}`}>
                  <span className="w-10 font-bold text-purple-700 dark:text-purple-300 shrink-0">{item.score}</span>
                  <span className="text-slate-600 dark:text-slate-400">{item.desc}</span>
                </div>
              ))}
            </div>
            {currentGuidance && (
              <div className="mt-2 border-t border-purple-100 dark:border-purple-800 pt-2">
                <div className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">Selected ({value}/10):</div>
                <div className="text-xs text-purple-700 dark:text-purple-300">{currentGuidance.desc}</div>
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="rounded-lg border border-purple-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="grid grid-cols-5 gap-1 text-purple-500 dark:text-purple-300 lg:grid-cols-10">
          {Array.from({ length: 10 }, (_, index) => index + 1).map((position) => (
            <button
              key={position}
              type="button"
              onClick={() => onChange(position)}
              className="flex h-10 w-full items-center justify-center rounded-md transition-all duration-200 hover:bg-purple-100 hover:scale-110 lg:h-11 dark:hover:bg-purple-900/30"
              aria-label={`${label} ${position} stars`}
            >
              <Star className={`h-5 w-5 transition-all duration-200 ${normalizedValue >= position ? 'fill-current' : 'hover:fill-purple-300'}`} />
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          {hint && (
            <button
              type="button"
              onClick={() => setShowHint(!showHint)}
              className="flex items-center gap-1 rounded-md border border-purple-200 px-3 py-1 text-xs font-bold text-purple-700 dark:border-zinc-700 dark:text-purple-200"
            >
              <HelpCircle className="h-3 w-3" />
              <span>?</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange(0)}
            className="rounded-md border border-purple-200 px-3 py-1 text-xs font-bold text-purple-700 dark:border-zinc-700 dark:text-purple-200"
          >
            Clear
          </button>
          <span className="rounded-md border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-purple-200">
            {normalizedValue}/10
          </span>
        </div>
      </div>
    </div>
  );
}
