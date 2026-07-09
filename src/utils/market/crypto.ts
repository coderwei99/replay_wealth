import type { HistoryResponse } from "../types";
import type { FetchHistoryParams, MarketAdapter } from "./types";

/**
 * 加密货币适配器（预留）
 * 统一返回 HistoryResponse，与 A 股 / 美股一致。
 *
 * 后续可接入：
 * - CoinGecko market_chart
 * - Binance klines
 */
export const cryptoMarketAdapter: MarketAdapter = {
  market: "CRYPTO",
  provider: "coingecko", // 计划数据源

  supports(symbol: string): boolean {
    const s = symbol.trim().toUpperCase();
    return ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA"].includes(s);
  },

  async fetchHistory(_params: FetchHistoryParams): Promise<HistoryResponse> {
    throw new Error(
      "加密货币行情尚未在当前版本开放。扩展时请在 utils/market/crypto.ts 实现 fetchHistory，并返回统一 HistoryResponse。",
    );
  },
};
