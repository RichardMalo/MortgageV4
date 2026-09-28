/**
 * MTGV4.0 (TrueMortgage Studio v4.0)
 * Lightweight Micro-Chart Base Utilities (HiDPI Canvas & SVG Helpers)
 *
 * Replaces heavy Plotly (~3MB) with hardware-accelerated, featherweight (<150KB total)
 * Canvas & SVG micro-visualizations with zero touch traps on mobile.
 */

export interface ChartDimensions {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  plotWidth: number;
  plotHeight: number;
}

export const getChartDimensions = (
  container: HTMLElement,
  defaultHeight = 240,
  padding = { top: 20, right: 20, bottom: 30, left: 50 }
): ChartDimensions => {
  const rect = container.getBoundingClientRect();
  const width = Math.max(260, rect.width || container.clientWidth || 320);
  const height = defaultHeight;
  const plotWidth = Math.max(10, width - padding.left - padding.right);
  const plotHeight = Math.max(10, height - padding.top - padding.bottom);

  return { width, height, padding, plotWidth, plotHeight };
};

export const initHiDpiCanvas = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): CanvasRenderingContext2D | null => {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 2 : 2;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
  }
  return ctx;
};

/**
 * Draws smooth Bézier line through 2D points on a canvas.
 */
export const drawSmoothCurve = (
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  strokeColor: string,
  lineWidth = 2.5
) => {
  if (points.length < 2) return;

  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.moveTo(points[0]!.x, points[0]!.y);

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
  }
  const last = points[points.length - 1]!;
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
};

/**
 * Formats compact numbers for axis ticks (e.g. 500k, 1M).
 */
export const formatAxisTick = (val: number): string => {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${Math.round(val / 1_000)}k`;
  return String(Math.round(val));
};
