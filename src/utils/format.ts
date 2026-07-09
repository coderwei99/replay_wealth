import type { CurrencyCode } from "./types";

const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: "¥",
  USD: "$",
  USDT: "$",
};

export function formatCurrency(
  value: number,
  currency: CurrencyCode = "CNY",
  options: { compact?: boolean; digits?: number } = {},
): string {
  const { compact = false, digits } = options;
  const abs = Math.abs(value);
  const fractionDigits =
    digits ??
    (currency === "CNY"
      ? abs >= 1000
        ? 0
        : 2
      : abs >= 1000
        ? 0
        : abs >= 1
          ? 2
          : abs >= 0.01
            ? 4
            : 6);

  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;

  if (compact && abs >= 1_000_000) {
    const sign = value < 0 ? "-" : "";
    return `${sign}${symbol}${(abs / 1_000_000).toFixed(2)}M`;
  }

  if (compact && abs >= 10_000 && currency === "CNY") {
    const sign = value < 0 ? "-" : "";
    return `${sign}${symbol}${(abs / 10_000).toFixed(2)}万`;
  }

  const fixed = value.toFixed(fractionDigits);
  const [intPart, decPart] = fixed.split(".");
  const withComma = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart != null
    ? `${symbol}${withComma}.${decPart}`
    : `${symbol}${withComma}`;
}

export function formatPercent(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

export function formatDateCN(date: string): string {
  const [y, m, d] = date.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function yearsAgoISO(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD → YYYYMMDD */
export function toCompactDate(date: string): string {
  return date.replace(/-/g, "");
}
