import type { HistoryResponse, MarketCode } from "../types";

export interface FetchHistoryParams {
  /** 用户输入或预设代码 */
  symbol: string;
  /** YYYY-MM-DD */
  period1: string;
  /** YYYY-MM-DD */
  period2: string;
  /** 可选元信息，由 registry 注入 */
  name?: string;
  providerIds?: {
    eastmoneySecid?: string;
    yahoo?: string;
    coingecko?: string;
  };
}

/**
 * 市场行情适配器
 * 各市场自行请求原始数据，最终必须映射为统一的 HistoryResponse
 */
export interface MarketAdapter {
  readonly market: MarketCode;
  readonly provider: string;
  /** 是否支持该 symbol（用于路由） */
  supports(symbol: string): boolean;
  fetchHistory(params: FetchHistoryParams): Promise<HistoryResponse>;
}
