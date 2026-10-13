/**
 * TrueMortgage — shared canvas chart utilities (theme, ticks, axes, HiDPI setup).
 */

import { Country } from '../core/types.js';
import { formatMoney } from '../core/format.js';
import { REGIONS } from '../core/regions.js';

export const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
export const font = (size: number, weight: number | string = 400) => `${weight} ${size}px ${FONT_STACK}`;

export interface ChartThemeColors {
  isDark: boolean;
  textColor: string;
  mutedColor: string;
  gridColor: string;
  cardBg: string;
  accentColor: string;
  accentSoft: string;
  extraColor: string;
  extraHover: string;
  extraSoft: string;
  principalColor: string;
  principalHover: string;
  interestColor: string;
  interestHover: string;
  interestSoft: string;
  baselineColor: string;
  warnSoft: string;
  warnColor: string;
}

export const getThemeColors = (): ChartThemeColors => {
  let isDark = false;
  if (typeof window !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark') {
      isDark = true;
    } else if (attr === 'light') {
      isDark = false;
    } else {
      isDark =
        window.matchMedia('(prefers-color-scheme: dark)').matches ||
        document.documentElement.classList.contains('dark');
    }
  }

  return {
    isDark,
    textColor: isDark ? '#f1f5f9' : '#0f172a',
    mutedColor: isDark ? '#94a3b8' : '#64748b',
    gridColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(15, 23, 42, 0.06)',
    cardBg: isDark ? '#11141c' : '#ffffff',
    accentColor: isDark ? '#60a5fa' : '#2563eb',
    accentSoft: isDark ? 'rgba(96, 165, 250, 0.2)' : 'rgba(37, 99, 235, 0.1)',
    extraColor: isDark ? '#34d399' : '#059669',
    extraHover: isDark ? '#6ee7b7' : '#10b981',
    extraSoft: isDark ? 'rgba(52, 211, 153, 0.22)' : 'rgba(5, 150, 105, 0.16)',
    principalColor: isDark ? '#60a5fa' : '#2563eb',
    principalHover: isDark ? '#93c5fd' : '#3b82f6',
    interestColor: isDark ? '#fb7185' : '#e11d48',
    interestHover: isDark ? '#fda4af' : '#be123c',
    interestSoft: isDark ? 'rgba(251, 113, 133, 0.18)' : 'rgba(225, 29, 72, 0.12)',
    baselineColor: isDark ? '#94a3b8' : '#64748b',
    warnSoft: isDark ? 'rgba(251, 191, 36, 0.12)' : 'rgba(217, 119, 6, 0.09)',
    warnColor: isDark ? '#fbbf24' : '#b45309'
  };
};

/**
 * Calculates human-friendly round tick intervals (e.g. 20k, 50k, 100k, 200k).
 */
export const getNiceTicks = (maxValue: number, maxTicks = 5): number[] => {
  if (maxValue <= 0) return [0];
  const roughStep = maxValue / (maxTicks - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;

  let step: number;
  if (normalized < 1.5) step = 1 * magnitude;
  else if (normalized < 3) step = 2 * magnitude;
  else if (normalized < 7) step = 5 * magnitude;
  else step = 10 * magnitude;

  const ticks: number[] = [];
  for (let val = 0; val <= maxValue + step * 0.05; val += step) {
    ticks.push(Math.round(val));
  }
  if (ticks.length > 0 && ticks[ticks.length - 1]! < maxValue) {
    ticks.push(ticks[ticks.length - 1]! + step);
  }
  return ticks;
};

/**
 * Formats compact numbers for axis labels (e.g. $20k, $40k, $600k, $1.2M).
 */
export const formatCompactMoney = (val: number, country: Country = 'CA'): string => {
  const r = REGIONS[country] || REGIONS.CA;
  const sym = r.currency === 'GBP' ? '£' : '$';
  if (val === 0) return `${sym}0`;
  if (val >= 1_000_000) {
    const m = val / 1_000_000;
    return `${sym}${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (val >= 1_000) {
    const k = val / 1_000;
    return `${sym}${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `${sym}${Math.round(val)}`;
};

/**
 * Initializes a canvas for HiDPI/Retina screens.
 */
export const initHiDpiCanvas = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): CanvasRenderingContext2D | null => {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
  }
  return ctx;
};

export interface ChartPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartDims {
  width: number;
  height: number;
  padding: ChartPadding;
  plotWidth: number;
  plotHeight: number;
}

/** Dashed horizontal grid lines with money labels on the left axis. */
export const drawMoneyGrid = (
  ctx: CanvasRenderingContext2D,
  dims: ChartDims,
  colors: ChartThemeColors,
  ticks: number[],
  maxY: number,
  country: Country
) => {
  ctx.save();
  ctx.strokeStyle = colors.gridColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.font = font(11);
  ctx.textAlign = 'right';
  ticks.forEach((v) => {
    const y = dims.padding.top + dims.plotHeight - (v / maxY) * dims.plotHeight;
    ctx.beginPath();
    ctx.moveTo(dims.padding.left, y);
    ctx.lineTo(dims.padding.left + dims.plotWidth, y);
    ctx.stroke();
    ctx.fillStyle = colors.mutedColor;
    const label = dims.width > 480 ? formatMoney(v, country, false) : formatCompactMoney(v, country);
    ctx.fillText(label, dims.padding.left - 8, y + 4);
  });
  ctx.restore();
};

/** "Now · 5y · 10y…" labels along the bottom axis. */
export const drawYearAxis = (
  ctx: CanvasRenderingContext2D,
  dims: ChartDims,
  colors: ChartThemeColors,
  maxYears: number
) => {
  const getX = (t: number) => dims.padding.left + (t / maxYears) * dims.plotWidth;
  const step = maxYears <= 10 ? 1 : maxYears <= 20 ? 2 : 5;
  ctx.save();
  ctx.fillStyle = colors.mutedColor;
  ctx.font = font(11);
  ctx.textAlign = 'center';
  for (let t = 0; t <= maxYears + 1e-9; t += step) {
    ctx.fillText(t === 0 ? 'Now' : `${t}y`, getX(t), dims.padding.top + dims.plotHeight + 20);
  }
  ctx.restore();
};

export const drawEmptyState = (
  ctx: CanvasRenderingContext2D,
  dims: { width: number; height: number },
  message: string,
  colors: ChartThemeColors = getThemeColors()
) => {
  ctx.fillStyle = colors.mutedColor;
  ctx.font = font(14);
  ctx.textAlign = 'center';
  ctx.fillText(message, dims.width / 2, dims.height / 2);
};

/** Pill-shaped label drawn on the canvas (used for markers like "You" and "Tipping point"). */
export const drawPill = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bg: string,
  fg: string,
  dims: ChartDims
) => {
  ctx.save();
  ctx.font = font(11, 600);
  const w = ctx.measureText(text).width + 12;
  const h = 18;
  let left = x - w / 2;
  left = Math.max(dims.padding.left, Math.min(left, dims.padding.left + dims.plotWidth - w));
  const top = Math.max(2, y - h);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(left, top, w, h, 9);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.fillText(text, left + w / 2, top + 13);
  ctx.restore();
};
