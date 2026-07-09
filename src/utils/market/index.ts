import { getAssetMeta, isMarketEnabled } from "../assets";
import type { HistoryResponse, MarketCode } from "../types";
import { cnMarketAdapter } from "./cn";
import { cryptoMarketAdapter } from "./crypto";
import { usMarketAdapter } from "./us";
import type { MarketAdapter } from "./types";

/**
 * 市场适配器注册表
 * v1 仅启用 CN；后续把 US / CRYPTO 加入 ENABLED_MARKETS 即可走对应 adapter
 */
const ADAPTERS: Record<MarketCode, MarketAdapter> = {
  CN: cnMarketAdapter,
  US: usMarketAdapter,
  CRYPTO: cryptoMarketAdapter,
};

export function getAdapter(market: MarketCode): MarketAdapter {
  return ADAPTERS[market];
}

/**
 * 推断市场（v1 默认 CN）
 * 扩展后可按代码规则 / 用户选择分流到 US / CRYPTO
 */
export function resolveMarket(
  symbol: string,
  preferred?: MarketCode,
): MarketCode {
  if (preferred && isMarketEnabled(preferred)) {
    return preferred;
  }

  // v1：仅 CN
  if (isMarketEnabled("CN") && cnMarketAdapter.supports(symbol)) {
    return "CN";
  }

  // 预留路由（当前 ENABLED_MARKETS 不含时会在下方报错）
  if (isMarketEnabled("US") && usMarketAdapter.supports(symbol)) {
    return "US";
  }
  if (isMarketEnabled("CRYPTO") && cryptoMarketAdapter.supports(symbol)) {
    return "CRYPTO";
  }

  // 默认按 A 股处理
  if (isMarketEnabled("CN")) return "CN";

  throw new Error("当前版本没有可用市场");
}

/**
 * 统一入口：拉取历史行情
 * 返回结构固定为 HistoryResponse，便于上层计算与展示解耦数据源
 */
export async function fetchHistory(
  symbol: string,
  period1: string,
  period2: string,
  options?: { market?: MarketCode },
): Promise<HistoryResponse> {
  if (period1 > period2) {
    throw new Error("买入日期不能晚于截止日期");
  }

  const market = resolveMarket(symbol, options?.market);

  if (!isMarketEnabled(market)) {
    throw new Error(
      `${market} 市场尚未开放。可在 utils/assets.ts 的 ENABLED_MARKETS 中启用，并实现对应适配器。`,
    );
  }

  const meta = getAssetMeta(symbol, market);
  const adapter = getAdapter(market);

  try {
    return await adapter.fetchHistory({
      symbol: meta.symbol,
      period1,
      period2,
      name: meta.name,
      providerIds: meta.providerIds,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "获取行情失败";
    // A 股域名提示
    if (market === "CN") {
      throw new Error(
        `${msg}。请检查网络 / 代理（Clash 等对东财 push2his 常会断连）。开发阶段请关闭域名校验；正式环境需配置 request 合法域名 web.ifzq.gtimg.cn（及备用 push2his.eastmoney.com）。`,
      );
    }
    throw new Error(msg);
  }
}

export type { MarketAdapter, FetchHistoryParams } from "./types";
export { cnMarketAdapter } from "./cn";
export { usMarketAdapter } from "./us";
export { cryptoMarketAdapter } from "./crypto";
