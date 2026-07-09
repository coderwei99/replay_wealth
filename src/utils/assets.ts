import type { AssetCategory, AssetPreset, MarketCode } from "./types";

/**
 * v1 仅启用 A 股。
 * 后续打开 US / CRYPTO 时：在 ENABLED_MARKETS 中追加，并实现对应 adapter。
 */
export const ENABLED_MARKETS: MarketCode[] = ["CN"];

/** v1 预设：大 A 热门标的 + ETF */
export const ASSET_PRESETS: AssetPreset[] = [
  {
    symbol: "600519",
    name: "贵州茅台",
    market: "CN",
    category: "a_share",
    color: "#E11D48",
    currency: "CNY",
    providerIds: { eastmoneySecid: "1.600519" },
  },
  {
    symbol: "000858",
    name: "五粮液",
    market: "CN",
    category: "a_share",
    color: "#F59E0B",
    currency: "CNY",
    providerIds: { eastmoneySecid: "0.000858" },
  },
  {
    symbol: "601318",
    name: "中国平安",
    market: "CN",
    category: "a_share",
    color: "#F97316",
    currency: "CNY",
    providerIds: { eastmoneySecid: "1.601318" },
  },
  {
    symbol: "600036",
    name: "招商银行",
    market: "CN",
    category: "a_share",
    color: "#EF4444",
    currency: "CNY",
    providerIds: { eastmoneySecid: "1.600036" },
  },
  {
    symbol: "000001",
    name: "平安银行",
    market: "CN",
    category: "a_share",
    color: "#FB7185",
    currency: "CNY",
    providerIds: { eastmoneySecid: "0.000001" },
  },
  {
    symbol: "300750",
    name: "宁德时代",
    market: "CN",
    category: "a_share",
    color: "#22C55E",
    currency: "CNY",
    providerIds: { eastmoneySecid: "0.300750" },
  },
  {
    symbol: "002594",
    name: "比亚迪",
    market: "CN",
    category: "a_share",
    color: "#10B981",
    currency: "CNY",
    providerIds: { eastmoneySecid: "0.002594" },
  },
  {
    symbol: "601012",
    name: "隆基绿能",
    market: "CN",
    category: "a_share",
    color: "#14B8A6",
    currency: "CNY",
    providerIds: { eastmoneySecid: "1.601012" },
  },
  {
    symbol: "510300",
    name: "沪深300ETF",
    market: "CN",
    category: "etf",
    color: "#2563EB",
    currency: "CNY",
    providerIds: { eastmoneySecid: "1.510300" },
  },
  {
    symbol: "510500",
    name: "中证500ETF",
    market: "CN",
    category: "etf",
    color: "#7C3AED",
    currency: "CNY",
    providerIds: { eastmoneySecid: "1.510500" },
  },
  {
    symbol: "159915",
    name: "创业板ETF",
    market: "CN",
    category: "etf",
    color: "#8B5CF6",
    currency: "CNY",
    providerIds: { eastmoneySecid: "0.159915" },
  },
  {
    symbol: "588000",
    name: "科创50ETF",
    market: "CN",
    category: "etf",
    color: "#06B6D4",
    currency: "CNY",
    providerIds: { eastmoneySecid: "1.588000" },
  },
];

export const COMPARE_DEFAULT_SYMBOLS = [
  "600519",
  "300750",
  "002594",
  "510300",
  "159915",
];

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  a_share: "A股",
  etf: "ETF",
  index: "指数",
  us_stock: "美股",
  us_etf: "美股 ETF",
  crypto: "加密货币",
};

export const MARKET_LABELS: Record<MarketCode, string> = {
  CN: "A股",
  US: "美股",
  CRYPTO: "加密货币",
};

/** 规范化用户输入的 A 股代码 */
export function normalizeCnSymbol(input: string): string {
  const raw = input.trim().toUpperCase();
  // 600519.SH / 000001.SZ / SH600519 / SZ000001
  const dotted = raw.match(/^(\d{6})\.(SH|SZ|BJ)$/);
  if (dotted) return dotted[1];
  const prefixed = raw.match(/^(SH|SZ|BJ)(\d{6})$/);
  if (prefixed) return prefixed[2];
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 6) return digits.slice(-6);
  return raw;
}

/**
 * 根据 6 位代码推断东方财富 secid
 * 沪市 1.xxxxxx / 深市与北交所 0.xxxxxx
 */
export function toEastmoneySecid(code: string): string {
  const c = normalizeCnSymbol(code);
  if (!/^\d{6}$/.test(c)) {
    throw new Error(`无效的 A 股代码：${code}`);
  }
  // 沪市：60/68/51/56/58 等
  if (
    c.startsWith("6") ||
    c.startsWith("5") ||
    c.startsWith("9") // 部分 B 股等
  ) {
    return `1.${c}`;
  }
  // 深市 00/30/12/15/16/18、北交所 4/8
  return `0.${c}`;
}

/**
 * 腾讯行情代码：sh600519 / sz000001 / bj430047
 */
export function toTencentSymbol(code: string): string {
  const c = normalizeCnSymbol(code);
  if (!/^\d{6}$/.test(c)) {
    throw new Error(`无效的 A 股代码：${code}`);
  }
  if (c.startsWith("6") || c.startsWith("5") || c.startsWith("9")) {
    return `sh${c}`;
  }
  // 北交所：4/8 开头（新三板精选层等）
  if (c.startsWith("4") || c.startsWith("8")) {
    return `bj${c}`;
  }
  return `sz${c}`;
}

export function getAssetMeta(symbol: string, market?: MarketCode): AssetPreset {
  const m = market ?? "CN";
  if (m === "CN") {
    const code = normalizeCnSymbol(symbol);
    const preset = ASSET_PRESETS.find(
      (a) => a.market === "CN" && a.symbol === code,
    );
    if (preset) return preset;
    return {
      symbol: code,
      name: code,
      market: "CN",
      category: "a_share",
      color: "#22D3EE",
      currency: "CNY",
      providerIds: {
        eastmoneySecid: toEastmoneySecid(code),
      },
    };
  }

  // 预留：US / CRYPTO 查找逻辑
  const preset = ASSET_PRESETS.find(
    (a) =>
      a.market === m &&
      a.symbol.toUpperCase() === symbol.trim().toUpperCase(),
  );
  if (preset) return preset;

  return {
    symbol: symbol.trim().toUpperCase(),
    name: symbol.trim().toUpperCase(),
    market: m,
    category: m === "US" ? "us_stock" : "crypto",
    color: "#22D3EE",
    currency: m === "US" ? "USD" : "USD",
  };
}

export function isMarketEnabled(market: MarketCode): boolean {
  return ENABLED_MARKETS.includes(market);
}

/** v1 仅展示已启用市场的预设 */
export function getEnabledPresets(): AssetPreset[] {
  return ASSET_PRESETS.filter((a) => isMarketEnabled(a.market));
}
