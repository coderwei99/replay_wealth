/**
 * 市场编码：后续扩展美股 / 加密货币时沿用同一套返回结构
 * - CN:  A 股（沪/深/北）
 * - US:  美股 / 美股 ETF
 * - CRYPTO: 加密货币
 */
export type MarketCode = "CN" | "US" | "CRYPTO";

export type CurrencyCode = "CNY" | "USD" | string;

export type AssetCategory =
  | "a_share"
  | "etf"
  | "index"
  | "us_stock"
  | "us_etf"
  | "crypto";

export interface AssetPreset {
  /** 展示用代码，如 600519 / AAPL / BTC */
  symbol: string;
  name: string;
  market: MarketCode;
  category: AssetCategory;
  color: string;
  currency: CurrencyCode;
  /**
   * 各数据源专用标识（可选）
   * CN: 东方财富 secid，如 1.600519
   * US: Yahoo 代码，如 AAPL
   * CRYPTO: CoinGecko id，如 bitcoin
   */
  providerIds?: {
    eastmoneySecid?: string;
    yahoo?: string;
    coingecko?: string;
  };
}

/** 统一日线价格点（各市场适配器最终都映射到此结构） */
export interface PricePoint {
  /** YYYY-MM-DD */
  date: string;
  /** Unix 秒（本地/UTC 由适配器约定，CN 用当日 00:00+08 近似） */
  time: number;
  /** 收盘价（或复权收盘） */
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  amount?: number;
}

export interface DailyValue {
  date: string;
  time: number;
  price: number;
  value: number;
  profit: number;
  returnPct: number;
}

export interface InvestmentStats {
  invested: number;
  currentValue: number;
  profit: number;
  returnPct: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  annualizedReturn: number | null;
  buyPrice: number;
  shares: number;
  buyDate: string;
  endDate: string;
  daysHeld: number;
  peakValue: number;
  troughAfterPeak: number;
}

/** 统一历史行情响应：A股 / 美股 / 加密货币共用 */
export interface HistoryResponse {
  symbol: string;
  name: string;
  market: MarketCode;
  currency: CurrencyCode;
  /** 数据源标识，便于排查 */
  provider: string;
  prices: PricePoint[];
  /** 原始扩展字段（可选，便于后续展示） */
  meta?: Record<string, unknown>;
}

export interface ReplayResult {
  symbol: string;
  name: string;
  market: MarketCode;
  currency: CurrencyCode;
  series: DailyValue[];
  stats: InvestmentStats;
}

export interface CompareResultItem {
  symbol: string;
  name: string;
  market: MarketCode;
  currency: CurrencyCode;
  stats: InvestmentStats;
  series: DailyValue[];
  color: string;
}

export type ViewMode = "idle" | "single" | "compare";
