import type { PricePoint } from "../types";

/** 按日期去重并排序 */
export function dedupePrices(prices: PricePoint[]): PricePoint[] {
  const map = new Map<string, PricePoint>();
  for (const p of prices) {
    if (p.close > 0 && Number.isFinite(p.close)) {
      map.set(p.date, p);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

/** YYYY-MM-DD → 当日 00:00 Asia/Shanghai 近似 Unix 秒 */
export function cnDateToUnix(date: string): number {
  // 用本地解析避免时区偏移导致跨日；小程序图表只用相对顺序
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d, 0, 0, 0) / 1000);
}

export function isoFromYmd(ymd: string): string {
  // "20240102" | "2024-01-02"
  if (ymd.includes("-")) return ymd;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}
