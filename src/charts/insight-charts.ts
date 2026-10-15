/**
 * TrueMortgage — Decision & motivation charts.
 *
 * Each chart is a self-contained definition (draw + hit-test + tooltip + caption + optional
 * click-to-apply) that `MortgageChartsManager` plugs into the carousel:
 *
 *  - kept       "Money Kept" race: cumulative interest, plan vs baseline, gap shaded
 *  - tipping    Interest vs principal per month, with the tipping-point date marked
 *  - extra      Extra-payment sensitivity curve (click a point to apply that amount)
 *  - strategies Strategy leaderboard (click a bar to adopt that strategy)
 *  - waiting    Cost of waiting: savings lost by starting 1, 2, 3, 5 years later
 */

import { Analysis, MortgageInputs } from '../core/types.js';
import { formatDuration, formatMoney, formatMonthYear } from '../core/format.js';
import { parseDate } from '../core/mortgage.js';
import {
  CumulativeSeries,
  DelayPoint,
  ExtraSweep,
  Strategy,
  TippingPoint,
  YearSplit,
  costOfWaiting,
  cumulativeAt,
  cumulativeInterest,
  extraPaymentSweep,
  strategyLeaderboard,
  tippingPoint
} from '../core/scenarios.js';
import {
  ChartDims,
  ChartPadding,
  ChartThemeColors,
  drawEmptyState,
  drawMoneyGrid,
  drawPill,
  drawYearAxis,
  font,
  formatCompactMoney,
  getNiceTicks
} from './chart-utils.js';

// ---------------------------------------------------------------------------
// Shared data + types
// ---------------------------------------------------------------------------

/** Example used by "cost of waiting" before the user has entered any strategy. */
export const EXAMPLE_EXTRA = 100;

export interface InsightData {
  sweep: ExtraSweep | null;
  strategies: Strategy[];
  waiting: DelayPoint[];
  /** True when `waiting` uses the +EXAMPLE_EXTRA/mo example instead of the user's plan. */
  waitingIsExample: boolean;
  planCum: CumulativeSeries;
  baseCum: CumulativeSeries;
  planTip: TippingPoint;
  baseTip: TippingPoint;
}

/** Runs every scenario once per render (~40 schedules; a few milliseconds). */
export const computeInsights = (a: Analysis): InsightData => {
  const waitingIsExample = !a.hasStrategy;
  const waiting = waitingIsExample
    ? costOfWaiting(a, undefined, {
        frequency: 'monthly',
        extraMonthly: EXAMPLE_EXTRA,
        annualLumpSum: 0,
        paymentIncrease: 0
      })
    : costOfWaiting(a);
  return {
    sweep: extraPaymentSweep(a),
    strategies: strategyLeaderboard(a),
    waiting,
    waitingIsExample,
    planCum: cumulativeInterest(a.plan),
    baseCum: cumulativeInterest(a.baseline),
    planTip: tippingPoint(a.plan, a.inputs.startDate),
    baseTip: tippingPoint(a.baseline, a.inputs.startDate)
  };
};

export interface ApplyAction {
  patch: Partial<MortgageInputs>;
  message: string;
}

export interface ChartContext {
  ctx: CanvasRenderingContext2D;
  dims: ChartDims;
  a: Analysis;
  d: InsightData;
  colors: ChartThemeColors;
  hover: number | null;
}

export interface InsightChart {
  id: string;
  height: number;
  expandedHeight: number;
  padding: ChartPadding;
  draw(c: ChartContext): void;
  /** Maps a canvas-local point to a hover index (or null when outside). */
  hit(x: number, y: number, dims: ChartDims, a: Analysis, d: InsightData): number | null;
  tooltip(i: number, a: Analysis, d: InsightData): string;
  /** One-sentence takeaway shown under the chart (HTML). */
  caption(a: Analysis, d: InsightData): string;
  /** Whether clicking the chart changes the user's plan. */
  isClickable(a: Analysis, d: InsightData): boolean;
  apply?(i: number, a: Analysis, d: InsightData): ApplyAction | null;
}

const DEFAULT_PADDING: ChartPadding = { top: 20, right: 20, bottom: 38, left: 62 };

const money = (a: Analysis, x: number) => formatMoney(x, a.inputs.country);
const compact = (a: Analysis, x: number) => formatCompactMoney(x, a.inputs.country);
const b = (s: string) => `<strong>${s}</strong>`;

/** Calendar date `years` after the first payment. */
const dateAfter = (a: Analysis, years: number): Date => {
  const s = parseDate(a.inputs.startDate);
  return new Date(s.getFullYear(), s.getMonth() + Math.round(years * 12), s.getDate());
};
const monthYear = (a: Analysis, dt: Date | null) => formatMonthYear(dt, a.inputs.country);

const lastOf = <T>(arr: T[]): T => arr[arr.length - 1]!;

const strokePath = (
  ctx: CanvasRenderingContext2D,
  pts: Array<[number, number]>,
  color: string,
  width: number,
  dash: number[] = []
) => {
  if (pts.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.restore();
};

const guideLine = (ctx: CanvasRenderingContext2D, x: number, dims: ChartDims, colors: ChartThemeColors) => {
  ctx.save();
  ctx.strokeStyle = colors.isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(15, 23, 42, 0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x, dims.padding.top);
  ctx.lineTo(x, dims.padding.top + dims.plotHeight);
  ctx.stroke();
  ctx.restore();
};

const dot = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, ring: string, r = 5) => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ring;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
};

const relX = (x: number, dims: ChartDims): number | null => {
  const r = x - dims.padding.left;
  return r < -4 || r > dims.plotWidth + 4 ? null : Math.max(0, Math.min(dims.plotWidth, r));
};

const tipCta = (text: string) => `<div class="tip-divider"></div><div class="tip-cta">${text}</div>`;

// ---------------------------------------------------------------------------
// 1. Money Kept race
// ---------------------------------------------------------------------------

const KEPT_SAMPLES = 120;

const keptGeom = (dims: ChartDims, a: Analysis, d: InsightData) => {
  const maxYears = Math.max(lastOf(d.baseCum.years), lastOf(d.planCum.years), 1);
  const ticks = getNiceTicks(Math.max(a.baseline.totalInterest, 1), 5);
  const maxY = lastOf(ticks);
  return {
    maxYears,
    ticks,
    maxY,
    getX: (t: number) => dims.padding.left + (t / maxYears) * dims.plotWidth,
    getY: (v: number) => dims.padding.top + dims.plotHeight - (v / maxY) * dims.plotHeight,
    sampleT: (i: number) => (i / KEPT_SAMPLES) * maxYears
  };
};

export const keptChart: InsightChart = {
  id: 'kept',
  height: 240,
  expandedHeight: 420,
  padding: DEFAULT_PADDING,

  draw({ ctx, dims, a, d, colors, hover }) {
    const g = keptGeom(dims, a, d);
    drawMoneyGrid(ctx, dims, colors, g.ticks, g.maxY, a.inputs.country);
    drawYearAxis(ctx, dims, colors, g.maxYears);

    const seriesPts = (s: CumulativeSeries, extendTo: number): Array<[number, number]> => {
      const pts = s.years.map((t, i) => [g.getX(t), g.getY(s.interest[i]!)] as [number, number]);
      if (lastOf(s.years) < extendTo) pts.push([g.getX(extendTo), g.getY(lastOf(s.interest))]);
      return pts;
    };

    if (a.hasStrategy) {
      // Shaded gap = interest you keep
      ctx.beginPath();
      for (let i = 0; i <= KEPT_SAMPLES; i++) {
        const t = g.sampleT(i);
        const x = g.getX(t);
        const y = g.getY(cumulativeAt(d.baseCum, t));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = KEPT_SAMPLES; i >= 0; i--) {
        const t = g.sampleT(i);
        ctx.lineTo(g.getX(t), g.getY(cumulativeAt(d.planCum, t)));
      }
      ctx.closePath();
      ctx.fillStyle = colors.extraSoft;
      ctx.fill();

      strokePath(ctx, seriesPts(d.baseCum, g.maxYears), colors.baselineColor, 1.6, [5, 4]);
    }

    strokePath(ctx, seriesPts(d.planCum, g.maxYears), colors.interestColor, 2.6);

    if (a.hasStrategy) {
      // Debt-free marker
      const payoffX = g.getX(lastOf(d.planCum.years));
      guideLine(ctx, payoffX, dims, colors);
      drawPill(ctx, 'Debt-free', payoffX, dims.padding.top + 16, colors.accentColor, '#ffffff', dims);

      // Total kept label at the right edge
      if (a.interestSaved >= 1) {
        const yMid = (g.getY(a.baseline.totalInterest) + g.getY(a.plan.totalInterest)) / 2;
        drawPill(
          ctx,
          `+${compact(a, a.interestSaved)} kept`,
          dims.padding.left + dims.plotWidth - 50,
          yMid + 9,
          colors.extraColor,
          '#ffffff',
          dims
        );
      }
    }

    if (hover !== null) {
      const t = g.sampleT(hover);
      const x = g.getX(t);
      guideLine(ctx, x, dims, colors);
      if (a.hasStrategy) dot(ctx, x, g.getY(cumulativeAt(d.baseCum, t)), colors.baselineColor, colors.cardBg, 4);
      dot(ctx, x, g.getY(cumulativeAt(d.planCum, t)), colors.interestColor, colors.cardBg);
    }
  },

  hit(x, _y, dims) {
    const r = relX(x, dims);
    return r === null ? null : Math.round((r / dims.plotWidth) * KEPT_SAMPLES);
  },

  tooltip(i, a, d) {
    const maxYears = Math.max(lastOf(d.baseCum.years), lastOf(d.planCum.years), 1);
    const t = (i / KEPT_SAMPLES) * maxYears;
    const plan = cumulativeAt(d.planCum, t);
    const base = cumulativeAt(d.baseCum, t);
    const kept = Math.max(0, base - plan);
    return `
      <div class="tip-header">${monthYear(a, dateAfter(a, t))} <span class="tip-sub">· ${t.toFixed(1)} yrs in</span></div>
      <div class="tip-row interest"><span>Interest paid (your plan):</span> <strong>${money(a, plan)}</strong></div>
      ${a.hasStrategy ? `<div class="tip-row muted"><span>Without extras:</span> <strong>${money(a, base)}</strong></div>` : ''}
      ${kept >= 1 ? `<div class="tip-divider"></div><div class="tip-row good"><span>Kept so far:</span> <strong>${money(a, kept)}</strong></div>` : ''}
    `;
  },

  caption(a, d) {
    if (!a.hasStrategy || a.interestSaved < 1) {
      return `You're on track to pay ${b(money(a, a.plan.totalInterest))} in interest. Add any extra payment and watch the green "money kept" gap open up.`;
    }
    const t = Math.min(5, lastOf(d.planCum.years));
    const keptEarly = Math.max(0, cumulativeAt(d.baseCum, t) - cumulativeAt(d.planCum, t));
    return `By ${b(monthYear(a, dateAfter(a, t)))} you'll have kept ${b(money(a, keptEarly))} — and by payoff ${b(
      money(a, a.interestSaved)
    )} stays in your pocket instead of going to the bank.`;
  },

  isClickable: () => false
};

// ---------------------------------------------------------------------------
// 2. Interest vs principal tipping point
// ---------------------------------------------------------------------------

const valueAt = (series: YearSplit[], x: number, key: 'interest' | 'principal'): number => {
  if (series.length === 0) return 0;
  if (x <= series[0]!.x) return series[0]![key];
  for (let i = 1; i < series.length; i++) {
    const p = series[i - 1]!;
    const c = series[i]!;
    if (x <= c.x) return p[key] + ((x - p.x) / (c.x - p.x)) * (c[key] - p[key]);
  }
  return lastOf(series)[key];
};

const tippingGeom = (dims: ChartDims, a: Analysis, d: InsightData) => {
  const all = [...d.planTip.series, ...(a.hasStrategy ? d.baseTip.series : [])];
  const maxV = Math.max(1, ...all.map((s) => Math.max(s.interest, s.principal)));
  const ticks = getNiceTicks(maxV, 5);
  const maxY = lastOf(ticks);
  const maxYears = Math.max(d.planTip.series.length, a.hasStrategy ? d.baseTip.series.length : 0, 1);
  return {
    ticks,
    maxY,
    maxYears,
    getX: (x: number) => dims.padding.left + (x / maxYears) * dims.plotWidth,
    getY: (v: number) => dims.padding.top + dims.plotHeight - (v / maxY) * dims.plotHeight
  };
};

export const tippingChart: InsightChart = {
  id: 'tipping',
  height: 240,
  expandedHeight: 420,
  padding: DEFAULT_PADDING,

  draw({ ctx, dims, a, d, colors, hover }) {
    const g = tippingGeom(dims, a, d);
    drawMoneyGrid(ctx, dims, colors, g.ticks, g.maxY, a.inputs.country);
    drawYearAxis(ctx, dims, colors, g.maxYears);

    const pts = (s: YearSplit[], key: 'interest' | 'principal') =>
      s.map((p) => [g.getX(p.x), g.getY(p[key])] as [number, number]);

    if (a.hasStrategy) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      strokePath(ctx, pts(d.baseTip.series, 'interest'), colors.interestColor, 1.6, [5, 4]);
      strokePath(ctx, pts(d.baseTip.series, 'principal'), colors.principalColor, 1.6, [5, 4]);
      ctx.restore();
    }
    strokePath(ctx, pts(d.planTip.series, 'interest'), colors.interestColor, 2.6);
    strokePath(ctx, pts(d.planTip.series, 'principal'), colors.principalColor, 2.6);

    // Baseline tipping point (ghost)
    const bx = d.baseTip.crossYears;
    const px = d.planTip.crossYears;
    if (a.hasStrategy && bx !== null && (px === null || Math.abs(bx - px) > 0.25)) {
      const x = g.getX(bx);
      guideLine(ctx, x, dims, colors);
      drawPill(
        ctx,
        `Without extras · ${d.baseTip.crossDate?.getFullYear() ?? ''}`,
        x,
        dims.padding.top + 38,
        colors.isDark ? '#334155' : '#e2e8f0',
        colors.textColor,
        dims
      );
    }

    // Plan tipping point
    if (px !== null) {
      const x = g.getX(Math.max(px, d.planTip.series[0]?.x ?? 0));
      const y = g.getY(valueAt(d.planTip.series, px, 'interest'));
      guideLine(ctx, x, dims, colors);
      dot(ctx, x, y, colors.extraColor, colors.cardBg, 6);
      drawPill(
        ctx,
        px === 0 ? 'Tipping point · from day 1' : `Tipping point · ${monthYear(a, d.planTip.crossDate)}`,
        x,
        dims.padding.top + 16,
        colors.extraColor,
        '#ffffff',
        dims
      );
    }

    if (hover !== null) {
      const x = g.getX(hover + 0.5);
      guideLine(ctx, x, dims, colors);
      const p = d.planTip.series[hover];
      if (p) {
        dot(ctx, x, g.getY(p.interest), colors.interestColor, colors.cardBg, 4);
        dot(ctx, x, g.getY(p.principal), colors.principalColor, colors.cardBg, 4);
      }
    }
  },

  hit(x, _y, dims, a, d) {
    const r = relX(x, dims);
    if (r === null) return null;
    const maxYears = Math.max(d.planTip.series.length, a.hasStrategy ? d.baseTip.series.length : 0, 1);
    return Math.max(0, Math.min(maxYears - 1, Math.floor((r / dims.plotWidth) * maxYears)));
  },

  tooltip(i, a, d) {
    const p = d.planTip.series[i];
    const base = d.baseTip.series[i];
    const share = (s: YearSplit) => Math.round((s.principal / Math.max(1, s.principal + s.interest)) * 100);
    const year = dateAfter(a, i + 1).getFullYear();
    if (!p) {
      return `
        <div class="tip-header">Year ${i + 1} <span class="tip-sub">· ${year}</span></div>
        <div class="tip-row good"><span>Your plan:</span> <strong>Paid off 🎉</strong></div>
        ${base ? `<div class="tip-row muted"><span>Without extras, interest/mo:</span> <strong>${money(a, base.interest)}</strong></div>` : ''}
      `;
    }
    return `
      <div class="tip-header">Year ${i + 1} <span class="tip-sub">· ${year} · avg per month</span></div>
      <div class="tip-row principal"><span><i class="swatch chart-principal"></i>To you (principal):</span> <strong>${money(a, p.principal)}</strong></div>
      <div class="tip-row interest"><span><i class="swatch chart-interest"></i>To the bank (interest):</span> <strong>${money(a, p.interest)}</strong></div>
      <div class="tip-divider"></div>
      <div class="tip-row good"><span>Share going to you:</span> <strong>${share(p)}%</strong></div>
      ${a.hasStrategy && base ? `<div class="tip-row muted"><span>Without extras:</span> <strong>${share(base)}%</strong></div>` : ''}
    `;
  },

  caption(a, d) {
    const p = d.planTip;
    const base = d.baseTip;
    if (p.crossYears === 0) {
      return `From your very first payment, more of your money goes to ${b('you')} (principal) than to the bank (interest).`;
    }
    if (p.crossYears === null) {
      return `Interest outweighs principal for the life of this loan. Extra payments are the fastest way to flip that.`;
    }
    if (a.hasStrategy && base.crossYears !== null && base.crossYears - p.crossYears > 0.25) {
      return `From ${b(monthYear(a, p.crossDate))}, more of every payment goes to ${b('you')} than the bank — ${b(
        formatDuration((base.crossYears - p.crossYears) * 12)
      )} sooner than without extras.`;
    }
    return `Until ${b(monthYear(a, p.crossDate))}, most of each payment goes to interest. Extra payments pull this tipping point closer.`;
  },

  isClickable: () => false
};

// ---------------------------------------------------------------------------
// 3. Extra-payment sensitivity curve
// ---------------------------------------------------------------------------

const extraGeom = (dims: ChartDims, sweep: ExtraSweep) => {
  const maxSaved = Math.max(1, ...sweep.points.map((p) => p.interestSaved));
  const ticks = getNiceTicks(maxSaved, 5);
  const maxY = lastOf(ticks);
  const maxYearsSaved = Math.max(1, Math.ceil(Math.max(...sweep.points.map((p) => p.monthsSaved)) / 12));
  const yearStep = maxYearsSaved <= 5 ? 1 : maxYearsSaved <= 10 ? 2 : 5;
  const maxYrs = Math.ceil(maxYearsSaved / yearStep) * yearStep;
  return {
    ticks,
    maxY,
    maxYrs,
    yearStep,
    getX: (e: number) => dims.padding.left + (e / sweep.maxExtra) * dims.plotWidth,
    getY: (v: number) => dims.padding.top + dims.plotHeight - (v / maxY) * dims.plotHeight,
    getYm: (m: number) => dims.padding.top + dims.plotHeight - (m / 12 / maxYrs) * dims.plotHeight
  };
};

export const extraChart: InsightChart = {
  id: 'extra',
  height: 240,
  expandedHeight: 420,
  padding: { top: 26, right: 40, bottom: 38, left: 62 },

  draw({ ctx, dims, a, d, colors, hover }) {
    const sweep = d.sweep;
    if (!sweep) {
      drawEmptyState(ctx, dims, 'No loan to analyze.', colors);
      return;
    }
    const g = extraGeom(dims, sweep);
    drawMoneyGrid(ctx, dims, colors, g.ticks, g.maxY, a.inputs.country);

    // Right axis: years saved
    ctx.save();
    ctx.font = font(11);
    ctx.textAlign = 'left';
    ctx.fillStyle = colors.accentColor;
    for (let yv = 0; yv <= g.maxYrs; yv += g.yearStep) {
      ctx.fillText(`${yv}y`, dims.padding.left + dims.plotWidth + 6, g.getYm(yv * 12) + 4);
    }
    ctx.restore();

    // X axis labels
    ctx.save();
    ctx.font = font(11);
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.mutedColor;
    const labelEvery = 4;
    sweep.points.forEach((p, i) => {
      if (i % labelEvery === 0) {
        ctx.fillText(
          i === 0 ? compact(a, 0) : `+${compact(a, p.extraMonthly)}`,
          g.getX(p.extraMonthly),
          dims.padding.top + dims.plotHeight + 20
        );
      }
    });
    ctx.restore();

    // Penalty-free prepayment limit zone
    if (sweep.capExtraMonthly !== null && sweep.capExtraMonthly < sweep.maxExtra) {
      const cx = g.getX(sweep.capExtraMonthly);
      ctx.save();
      ctx.fillStyle = colors.warnSoft;
      ctx.fillRect(cx, dims.padding.top, dims.padding.left + dims.plotWidth - cx, dims.plotHeight);
      ctx.strokeStyle = colors.warnColor;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, dims.padding.top);
      ctx.lineTo(cx, dims.padding.top + dims.plotHeight);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.warnColor;
      ctx.font = font(10, 600);
      const label = 'Over typical prepay limit';
      const w = ctx.measureText(label).width;
      const fitsRight = cx + 6 + w < dims.padding.left + dims.plotWidth;
      ctx.textAlign = fitsRight ? 'left' : 'right';
      ctx.fillText(label, fitsRight ? cx + 6 : cx - 6, dims.padding.top + dims.plotHeight - 8);
      ctx.restore();
    }

    // Interest saved (area + line)
    const pts = sweep.points.map((p) => [g.getX(p.extraMonthly), g.getY(p.interestSaved)] as [number, number]);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0]![0], dims.padding.top + dims.plotHeight);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(lastOf(pts)[0], dims.padding.top + dims.plotHeight);
    ctx.closePath();
    ctx.fillStyle = colors.extraSoft;
    ctx.fill();
    ctx.restore();
    strokePath(ctx, pts, colors.extraColor, 2.6);

    // Years saved
    strokePath(
      ctx,
      sweep.points.map((p) => [g.getX(p.extraMonthly), g.getYm(p.monthsSaved)] as [number, number]),
      colors.accentColor,
      1.8,
      [6, 4]
    );

    // You-are-here marker
    const cur = sweep.current;
    const cx = g.getX(Math.min(cur.extraMonthly, sweep.maxExtra));
    const cy = g.getY(cur.interestSaved);
    dot(ctx, cx, cy, colors.accentColor, colors.cardBg, 6);
    drawPill(
      ctx,
      cur.extraMonthly > 0 ? `You · +${money(a, cur.extraMonthly)}/mo` : 'You · no extra yet',
      cx,
      cy - 10,
      colors.accentColor,
      '#ffffff',
      dims
    );

    if (hover !== null) {
      const p = sweep.points[hover];
      if (p) {
        const x = g.getX(p.extraMonthly);
        guideLine(ctx, x, dims, colors);
        dot(ctx, x, g.getY(p.interestSaved), colors.extraColor, colors.cardBg);
        dot(ctx, x, g.getYm(p.monthsSaved), colors.accentColor, colors.cardBg, 4);
      }
    }
  },

  hit(x, _y, dims, _a, d) {
    if (!d.sweep) return null;
    const r = relX(x, dims);
    if (r === null) return null;
    const steps = d.sweep.points.length - 1;
    return Math.max(0, Math.min(steps, Math.round((r / dims.plotWidth) * steps)));
  },

  tooltip(i, a, d) {
    const p = d.sweep?.points[i];
    if (!p) return '';
    const overCap = d.sweep!.capExtraMonthly !== null && p.extraMonthly > d.sweep!.capExtraMonthly + 0.5;
    return `
      <div class="tip-header">${p.extraMonthly > 0 ? `+${money(a, p.extraMonthly)} / month extra` : 'No extra payment'}</div>
      <div class="tip-row good"><span>Interest saved:</span> <strong>${money(a, p.interestSaved)}</strong></div>
      <div class="tip-row plan"><span>Time saved:</span> <strong>${formatDuration(p.monthsSaved)}</strong></div>
      <div class="tip-row muted"><span>Debt-free:</span> <strong>${monthYear(a, p.payoffDate)}</strong></div>
      ${overCap ? `<div class="tip-row warn"><span>⚠ May exceed your lender's penalty-free limit</span></div>` : ''}
      ${tipCta('Click to use this amount')}
    `;
  },

  caption(a, d) {
    const s = d.sweep;
    if (!s) return '';
    const gain = Math.max(0, s.next.interestSaved - s.current.interestSaved);
    const gainMonths = Math.max(0, s.next.monthsSaved - s.current.monthsSaved);
    const nudge = money(a, s.nudge);
    if (s.current.extraMonthly <= 0) {
      return `Adding just ${b(`${nudge}/mo`)} saves ${b(money(a, gain))} and ${b(formatDuration(gainMonths))}. Tap the curve to try any amount.`;
    }
    const perDollar = s.perDollar !== null ? ` — every ${money(a, 1)} you prepay saves ${b(formatMoney(s.perDollar, a.inputs.country, true))}` : '';
    return `Your ${b(`${money(a, s.current.extraMonthly)}/mo`)} extra saves ${b(money(a, s.current.interestSaved))}${perDollar}. Another ${b(
      nudge
    )} would save ${b(money(a, gain))} more and ${b(formatDuration(gainMonths))}.`;
  },

  isClickable: (_a, d) => d.sweep !== null,

  apply(i, a, d) {
    const p = d.sweep?.points[i];
    if (!p) return null;
    return {
      patch: { extraMonthly: p.extraMonthly },
      message:
        p.extraMonthly > 0 ? `Extra payment set to ${money(a, p.extraMonthly)}/month` : 'Extra monthly payment removed'
    };
  }
};

// ---------------------------------------------------------------------------
// 4. Strategy leaderboard
// ---------------------------------------------------------------------------

const STRAT_PADDING: ChartPadding = { top: 6, right: 12, bottom: 6, left: 12 };

const stratRowH = (dims: ChartDims, n: number) => dims.plotHeight / Math.max(1, n);

export const strategiesChart: InsightChart = {
  id: 'strategies',
  height: 320,
  expandedHeight: 460,
  padding: STRAT_PADDING,

  draw({ ctx, dims, a, d, colors, hover }) {
    const list = d.strategies;
    if (list.length === 0) {
      drawEmptyState(ctx, dims, 'No loan to compare.', colors);
      return;
    }
    const rowH = stratRowH(dims, list.length);
    const maxSaved = Math.max(1, ...list.map((s) => s.interestSaved));
    const bestValue = list.reduce((best, s) => (s.perDollar > best.perDollar && !s.isCurrent ? s : best), list[0]!);
    const wide = dims.width > 460;

    list.forEach((s, i) => {
      const y0 = dims.padding.top + i * rowH;
      const isHover = hover === i;
      const barH = Math.max(6, Math.min(12, rowH - 24));
      const barY = y0 + rowH - barH - 5;
      const textY = barY - 6;

      if (isHover) {
        ctx.fillStyle = colors.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(37, 99, 235, 0.06)';
        ctx.beginPath();
        ctx.roundRect(dims.padding.left - 6, y0 + 1, dims.plotWidth + 12, rowH - 2, 6);
        ctx.fill();
      }

      // Label (+ tags on wide screens)
      ctx.textAlign = 'left';
      ctx.font = font(12, s.isCurrent || isHover ? 700 : 500);
      ctx.fillStyle = s.isCurrent ? colors.accentColor : colors.textColor;
      ctx.fillText(s.label, dims.padding.left, textY);
      let tagX = dims.padding.left + ctx.measureText(s.label).width + 8;

      const tag = (text: string, color: string) => {
        ctx.font = font(10, 600);
        const w = ctx.measureText(text).width + 10;
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(tagX, textY - 11, w, 15, 7);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = color;
        ctx.fillText(text, tagX + 5, textY);
        tagX += w + 6;
      };
      if (wide) {
        if (i === 0) tag('Most savings', colors.extraColor);
        if (s === bestValue && bestValue.perDollar > 0) tag('Best value', colors.warnColor);
      }

      // Value (right)
      ctx.textAlign = 'right';
      ctx.font = font(11, 600);
      ctx.fillStyle = s.isCurrent ? colors.accentColor : colors.extraColor;
      const valueText =
        s.monthsSaved >= 1
          ? dims.width < 380
            ? `${compact(a, s.interestSaved)} · −${formatDuration(s.monthsSaved)}`
            : `${wide ? money(a, s.interestSaved) : compact(a, s.interestSaved)} · ${formatDuration(s.monthsSaved)} sooner`
          : wide
            ? money(a, s.interestSaved)
            : compact(a, s.interestSaved);
      ctx.fillText(valueText, dims.padding.left + dims.plotWidth, textY);

      // Track + bar
      ctx.fillStyle = colors.gridColor;
      ctx.beginPath();
      ctx.roundRect(dims.padding.left, barY, dims.plotWidth, barH, barH / 2);
      ctx.fill();

      const w = Math.max(barH, (s.interestSaved / maxSaved) * dims.plotWidth);
      ctx.fillStyle = s.isCurrent
        ? isHover
          ? colors.principalHover
          : colors.accentColor
        : isHover
          ? colors.extraHover
          : colors.extraColor;
      ctx.beginPath();
      ctx.roundRect(dims.padding.left, barY, w, barH, barH / 2);
      ctx.fill();
    });
  },

  hit(x, y, dims, _a, d) {
    if (d.strategies.length === 0) return null;
    if (x < dims.padding.left - 6 || x > dims.padding.left + dims.plotWidth + 6) return null;
    const rowH = stratRowH(dims, d.strategies.length);
    const i = Math.floor((y - dims.padding.top) / rowH);
    return i >= 0 && i < d.strategies.length ? i : null;
  },

  tooltip(i, a, d) {
    const s = d.strategies[i];
    if (!s) return '';
    return `
      <div class="tip-header">${s.label}</div>
      <div class="tip-row muted"><span>${s.detail}</span></div>
      <div class="tip-divider"></div>
      <div class="tip-row good"><span>Interest saved:</span> <strong>${money(a, s.interestSaved)}</strong></div>
      <div class="tip-row plan"><span>Time saved:</span> <strong>${formatDuration(s.monthsSaved)}</strong></div>
      <div class="tip-row muted"><span>Extra cash per year:</span> <strong>${money(a, s.extraPerYear)}</strong></div>
      <div class="tip-row muted"><span>Debt-free:</span> <strong>${monthYear(a, s.payoffDate)}</strong></div>
      ${s.perDollar > 0 ? `<div class="tip-row muted"><span>Saved per ${money(a, 1)} extra:</span> <strong>${formatMoney(s.perDollar, a.inputs.country, true)}</strong></div>` : ''}
      ${s.isCurrent ? tipCta('This is your current plan') : tipCta('Click to apply this strategy')}
    `;
  },

  caption(a, d) {
    const list = d.strategies;
    if (list.length === 0) return '';
    const top = list[0]!;
    const candidates = list.filter((s) => !s.isCurrent && s.perDollar > 0);
    const value = candidates.length > 0
      ? candidates.reduce((best, s) => (s.perDollar > best.perDollar ? s : best), candidates[0]!)
      : null;
    const current = list.find((s) => s.isCurrent);
    const rank = current ? list.indexOf(current) + 1 : 0;
    const valuePart = value
      ? ` Best value per dollar: ${b(value.label)} at ${b(
          formatMoney(value.perDollar, a.inputs.country, true)
        )} saved per ${money(a, 1)}.`
      : '';
    const lead = `${b(top.label)} saves the most (${b(money(a, top.interestSaved))}).${valuePart}`;
    const yours = current ? ` Your plan ranks ${b(`#${rank} of ${list.length}`)}.` : ' Tap a bar to apply it.';
    return lead + yours;
  },

  isClickable: (_a, d) => d.strategies.length > 0,

  apply(i, _a, d) {
    const s = d.strategies[i];
    if (!s || !s.patch) return null;
    return { patch: s.patch, message: `Applied: ${s.label}` };
  }
};

// ---------------------------------------------------------------------------
// 5. Cost of waiting
// ---------------------------------------------------------------------------

const waitingGeom = (dims: ChartDims, pts: DelayPoint[]) => {
  const ticks = getNiceTicks(Math.max(1, pts[0]?.interestSaved ?? 1), 5);
  const maxY = lastOf(ticks);
  const slotW = dims.plotWidth / Math.max(1, pts.length);
  return {
    ticks,
    maxY,
    slotW,
    barW: Math.min(64, slotW * 0.56),
    center: (i: number) => dims.padding.left + i * slotW + slotW / 2,
    getY: (v: number) => dims.padding.top + dims.plotHeight - (v / maxY) * dims.plotHeight
  };
};

const delayLabel = (years: number, compact = false) =>
  years === 0 ? (compact ? 'Now' : 'Start now') : compact ? `+${years}y` : `Wait ${years} yr${years === 1 ? '' : 's'}`;

export const waitingChart: InsightChart = {
  id: 'waiting',
  height: 240,
  expandedHeight: 420,
  padding: { top: 24, right: 20, bottom: 38, left: 62 },

  draw({ ctx, dims, a, d, colors, hover }) {
    const pts = d.waiting;
    if (pts.length === 0) {
      drawEmptyState(ctx, dims, 'No loan to analyze.', colors);
      return;
    }
    const g = waitingGeom(dims, pts);
    drawMoneyGrid(ctx, dims, colors, g.ticks, g.maxY, a.inputs.country);
    const nowSaved = pts[0]!.interestSaved;
    const floor = dims.padding.top + dims.plotHeight;

    pts.forEach((p, i) => {
      const cx = g.center(i);
      const x = cx - g.barW / 2;
      const isHover = hover === i;
      const yNow = g.getY(nowSaved);
      const ySaved = g.getY(p.interestSaved);

      if (isHover) {
        ctx.fillStyle = colors.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(37, 99, 235, 0.06)';
        ctx.fillRect(cx - g.slotW / 2, dims.padding.top, g.slotW, dims.plotHeight);
      }

      // Lost portion (ghost of "start now")
      if (p.lostSavings > 0) {
        ctx.fillStyle = colors.interestSoft;
        ctx.beginPath();
        ctx.roundRect(x, yNow, g.barW, ySaved - yNow, [4, 4, 0, 0]);
        ctx.fill();
        ctx.save();
        ctx.strokeStyle = colors.interestColor;
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.restore();
      }

      // Kept portion
      ctx.fillStyle = isHover ? colors.extraHover : colors.extraColor;
      ctx.beginPath();
      ctx.roundRect(x, ySaved, g.barW, floor - ySaved, p.lostSavings > 0 ? 0 : [4, 4, 0, 0]);
      ctx.fill();

      // Labels
      ctx.textAlign = 'center';
      ctx.font = font(11, 600);
      if (i === 0) {
        ctx.fillStyle = colors.extraColor;
        ctx.fillText(compact(a, p.interestSaved), cx, yNow - 6);
      } else if (p.lostSavings > 0) {
        ctx.fillStyle = colors.interestColor;
        ctx.fillText(`−${compact(a, p.lostSavings)}`, cx, yNow - 6);
      }
      ctx.font = i === 0 ? font(11, 700) : font(11);
      ctx.fillStyle = i === 0 ? colors.textColor : colors.mutedColor;
      ctx.fillText(delayLabel(p.delayYears, dims.width < 400), cx, floor + 20);
    });
  },

  hit(x, _y, dims, _a, d) {
    if (d.waiting.length === 0) return null;
    const r = relX(x, dims);
    if (r === null) return null;
    const slotW = dims.plotWidth / d.waiting.length;
    return Math.max(0, Math.min(d.waiting.length - 1, Math.floor(r / slotW)));
  },

  tooltip(i, a, d) {
    const p = d.waiting[i];
    if (!p) return '';
    const header = p.delayYears === 0 ? 'Start with your next payment' : `Start in ${p.delayYears} year${p.delayYears === 1 ? '' : 's'}`;
    return `
      <div class="tip-header">${header}</div>
      ${d.waitingIsExample ? `<div class="tip-row muted"><span>Example: +${money(a, EXAMPLE_EXTRA)}/mo extra</span></div>` : ''}
      <div class="tip-row good"><span>Interest saved:</span> <strong>${money(a, p.interestSaved)}</strong></div>
      <div class="tip-row plan"><span>Time saved:</span> <strong>${formatDuration(p.monthsSaved)}</strong></div>
      ${p.lostSavings > 0 ? `<div class="tip-divider"></div><div class="tip-row interest"><span>Cost of waiting:</span> <strong>${money(a, p.lostSavings)}</strong></div>` : ''}
      ${d.waitingIsExample && i === 0 ? tipCta(`Click to start +${money(a, EXAMPLE_EXTRA)}/mo now`) : ''}
    `;
  },

  caption(a, d) {
    const pts = d.waiting;
    if (pts.length < 2) return '';
    const w1 = pts.find((p) => p.delayYears === 1);
    const w3 = pts.find((p) => p.delayYears === 3) ?? lastOf(pts);
    const prefix = d.waitingIsExample ? `Example with ${b(`+${money(a, EXAMPLE_EXTRA)}/mo`)}: ` : '';
    const parts: string[] = [];
    if (w1) parts.push(`waiting ${b('1 year')} to start costs ${b(money(a, w1.lostSavings))}`);
    if (w3 && w3 !== w1) parts.push(`waiting ${b(`${w3.delayYears} years`)} costs ${b(money(a, w3.lostSavings))}`);
    const body = parts.join('; ');
    return `${prefix}${body.charAt(0).toUpperCase()}${body.slice(1)}. Your next payment is the cheapest time to start.`;
  },

  isClickable: (_a, d) => d.waitingIsExample && d.waiting.length > 0,

  apply(i, a, d) {
    if (!d.waitingIsExample || i !== 0) return null;
    return {
      patch: { extraMonthly: EXAMPLE_EXTRA },
      message: `Started +${money(a, EXAMPLE_EXTRA)}/month extra — nice!`
    };
  }
};

export const INSIGHT_CHARTS: Record<string, InsightChart> = {
  kept: keptChart,
  tipping: tippingChart,
  extra: extraChart,
  strategies: strategiesChart,
  waiting: waitingChart
};
