'use client';

import { useRef, useCallback } from 'react';
import type { MouseEvent, TouchEvent } from 'react';
import Image from 'next/image';

export type FieldSelection = {
  x: number;
  y: number;
};

export function RebuiltFieldMapSelector({
  label,
  value,
  values,
  onChange,
  onChangeMany,
  helperText = 'Tap anywhere on the field',
  showCoordinates = false,
}: {
  label: string;
  value?: FieldSelection | null;
  values?: FieldSelection[];
  onChange?: (point: FieldSelection) => void;
  onChangeMany?: (points: FieldSelection[]) => void;
  helperText?: string;
  showCoordinates?: boolean;
}) {
  const handleMapClick = (event: MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    const nextPoint = {
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
    };

    if (onChangeMany) {
      onChangeMany([...(values || []), nextPoint]);
      return;
    }

    onChange?.(nextPoint);
  };

  const handlePointRemove = (clickPoint: FieldSelection) => {
    if (!onChangeMany || !values || values.length === 0) {
      onChange?.(null as any);
      return;
    }

    // Radius for considering a dot "nearby" (in percentage of field dimensions)
    const RADIUS = 3;

    // Find all points within radius
    const nearbyIndices: number[] = [];
    values.forEach((p, index) => {
      const distance = Math.sqrt(Math.pow(p.x - clickPoint.x, 2) + Math.pow(p.y - clickPoint.y, 2));
      if (distance <= RADIUS) {
        nearbyIndices.push(index);
      }
    });

    if (nearbyIndices.length === 0) return;

    // Remove the top-most one (highest index = last added = on top)
    const indexToRemove = Math.max(...nearbyIndices);
    const newValues = values.filter((_, i) => i !== indexToRemove);
    onChangeMany(newValues);
  };

  const points = values || (value ? [value] : []);

  return (
    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
      <span className="mb-2 block">{label}</span>
      <div className="rounded-xl border border-purple-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <FieldImage activePoint={value || undefined} activePoints={values} interactive onMapClick={handleMapClick} onPointRemove={handlePointRemove} />
        <div className="mt-3 text-sm font-bold text-purple-900 dark:text-purple-200">
          {showCoordinates && points.length > 0 ? `${points.length} marked` : helperText}
        </div>
      </div>
    </label>
  );
}

export function RebuiltFieldMapDisplay({
  title,
  activePoint,
  activePoints,
}: {
  title: string;
  activePoint?: FieldSelection | null;
  activePoints?: FieldSelection[];
}) {
  return (
    <div className="rounded-xl border border-purple-200/70 bg-white/85 p-4 shadow-lg shadow-purple-900/5 dark:border-zinc-800 dark:bg-zinc-900/80">
      <h3 className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-purple-800 dark:text-purple-300">{title}</h3>
      <FieldImage activePoint={activePoint || undefined} activePoints={activePoints} />
    </div>
  );
}

function DotWithTouch({
  point,
  onRemove,
}: {
  point: FieldSelection;
  onRemove?: (point: FieldSelection) => void;
}) {
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);

  const startLongPress = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      onRemove?.(point);
    }, 400);
  }, [onRemove, point]);

  const endLongPress = useCallback((e?: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    return isLongPress.current;
  }, []);

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    startLongPress();
  };

  const handleMouseUp = (e: MouseEvent<HTMLDivElement>) => {
    const wasLongPress = endLongPress(e);
    if (!wasLongPress) {
      onRemove?.(point);
    }
  };

  const handleMouseLeave = () => {
    endLongPress();
  };

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    startLongPress();
  };

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const wasLongPress = endLongPress(e);
    if (!wasLongPress) {
      onRemove?.(point);
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    endLongPress();
  };

  return (
    <div
      className={`absolute z-20 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-purple-600 shadow-lg shadow-purple-900/30 ${onRemove ? 'w-[3%] sm:w-[1.5%] min-w-[20px] min-h-[20px] cursor-pointer touch-none ring-2 ring-purple-950/35 hover:scale-125 transition-transform active:scale-150 active:bg-red-500' : 'w-[2%] sm:w-[1%] min-w-[12px] min-h-[12px] ring-1 ring-purple-950/20'}`}
      style={{ left: `${point.x}%`, top: `${point.y}%` }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onContextMenu={(e) => e.preventDefault()}
      title={onRemove ? "Click or long-press to remove" : undefined}
      aria-label={onRemove ? `Position at ${point.x}%, ${point.y}% - click or long-press to remove` : `Position at ${point.x}%, ${point.y}%`}
    />
  );
}

function FieldImage({
  activePoint,
  activePoints,
  interactive = false,
  onMapClick,
  onPointRemove,
}: {
  activePoint?: FieldSelection;
  activePoints?: FieldSelection[];
  interactive?: boolean;
  onMapClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onPointRemove?: (point: FieldSelection) => void;
}) {
  const points = activePoints || (activePoint ? [activePoint] : []);

  return (
    <div className="relative overflow-hidden rounded-lg border border-purple-100 bg-purple-50/70 dark:border-zinc-800 dark:bg-zinc-950/60">
      <div className="relative aspect-[16/8] w-full">
        <Image src="/field.png" alt="2026 field map" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 600px" />
        <div className="absolute inset-0 bg-white/10 dark:bg-black/15" />
        {interactive ? (
          <button
            type="button"
            onClick={onMapClick}
            className="absolute inset-0 z-10 cursor-crosshair"
            aria-label="Select any field position"
          />
        ) : null}
        {points.map((point, index) => (
          <DotWithTouch
            key={`${point.x}_${point.y}_${index}`}
            point={point}
            onRemove={onPointRemove}
          />
        ))}
      </div>
    </div>
  );
}

