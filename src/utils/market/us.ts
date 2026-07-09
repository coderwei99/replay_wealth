import type { HistoryResponse } from "../types";
import type { FetchHistoryParams, MarketAdapter } from "./types";

/**
 * 美股适配器（预留）
 * 统一返回 HistoryResponse，与 A 股 / 加密货币一致。
 *
 * 后续可接入：
 * - Yahoo Finance chart API
 * - 自建代理服务
 */
export const usMarketAdapter: MarketAdapter = {
  market: "US",
  provider: "yahoo", // 计划数据源

  supports(symbol: string): boolean {
    // 简单启发式：字母为主的 ticker
    return /^[A-Z][A-Z0-9.\-]{0,9}$/i.test(symbol.trim());
  },

  async fetchHistory(_params: FetchHistoryParams): Promise<HistoryResponse> {
    throw new Error(
      "美股行情尚未在当前版本开放。扩展时请在 utils/market/us.ts 实现 fetchHistory，并返回统一 HistoryResponse。",
    );
  },
};
