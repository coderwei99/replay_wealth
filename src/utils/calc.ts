import type {
  CurrencyCode,
  DailyValue,
  InvestmentStats,
  MarketCode,
  PricePoint,
  ReplayResult,
} from "./types";

function parseISODate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function daysBetween(start: string, end: string): number {
  const ms = parseISODate(end).getTime() - parseISODate(start).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

export function findBuyIndex(prices: PricePoint[], buyDate: string): number {
  return prices.findIndex((p) => p.date >= buyDate);
}

export function buildReplaySeries(
  prices: PricePoint[],
  amount: number,
  buyDate: string,
  endDate: string,
): { series: DailyValue[]; buyPrice: number; shares: number } | null {
  if (!prices.length || amount <= 0) return null;

  const startIdx = findBuyIndex(prices, buyDate);
  if (startIdx < 0) return null;

  let endIdx = -1;
  for (let i = startIdx; i < prices.length; i++) {
    if (prices[i].date <= endDate) endIdx = i;
    else break;
  }
  if (endIdx < startIdx) return null;

  const buyPrice = prices[startIdx].close;
  if (!buyPrice || buyPrice <= 0) return null;

  const shares = amount / buyPrice;
  const series: DailyValue[] = [];

  for (let i = startIdx; i <= endIdx; i++) {
    const p = prices[i];
    const value = shares * p.close;
    const profit = value - amount;
    series.push({
      date: p.date,
      time: p.time,
      price: p.close,
      value,
      profit,
      returnPct: profit / amount,
    });
  }

  return { series, buyPrice, shares };
}

export function computeStats(
  series: DailyValue[],
  amount: number,
  buyPrice: number,
  shares: number,
): InvestmentStats | null {
  if (!series.length) return null;

  const first = series[0];
  const last = series[series.length - 1];

  let peak = first.value;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  let troughAfterPeak = first.value;

  for (const point of series) {
    if (point.value > peak) peak = point.value;
    const dd = peak - point.value;
    const ddPct = peak > 0 ? dd / peak : 0;
    if (ddPct > maxDrawdownPct) {
      maxDrawdownPct = ddPct;
      maxDrawdown = dd;
      troughAfterPeak = point.value;
    }
  }

  const daysHeld = daysBetween(first.date, last.date);
  let annualizedReturn: number | null = null;
  if (daysHeld >= 1 && amount > 0 && last.value > 0) {
    const years = daysHeld / 365.25;
    if (years > 0) {
      annualizedReturn = Math.pow(last.value / amount, 1 / years) - 1;
    }
  }

  return {
    invested: amount,
    currentValue: last.value,
    profit: last.profit,
    returnPct: last.returnPct,
    maxDrawdown,
    maxDrawdownPct,
    annualizedReturn,
    buyPrice,
    shares,
    buyDate: first.date,
    endDate: last.date,
    daysHeld,
    peakValue: peak,
    troughAfterPeak,
  };
}

export function computeReplay(
  prices: PricePoint[],
  amount: number,
  buyDate: string,
  endDate: string,
  symbol: string,
  name: string,
  market: MarketCode = "CN",
  currency: CurrencyCode = "CNY",
): ReplayResult | null {
  const built = buildReplaySeries(prices, amount, buyDate, endDate);
  if (!built) return null;
  const stats = computeStats(
    built.series,
    amount,
    built.buyPrice,
    built.shares,
  );
  if (!stats) return null;
  return {
    symbol,
    name,
    market,
    currency,
    series: built.series,
    stats,
  };
}

export function statsAtIndex(
  series: DailyValue[],
  amount: number,
  buyPrice: number,
  shares: number,
  index: number,
): InvestmentStats | null {
  if (index < 0) return null;
  const sliced = series.slice(0, Math.min(index + 1, series.length));
  return computeStats(sliced, amount, buyPrice, shares);
}
