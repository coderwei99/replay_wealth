import {
  normalizeCnSymbol,
  toEastmoneySecid,
  toTencentSymbol,
} from "../assets";
import { toCompactDate } from "../format";
import type { HistoryResponse, PricePoint } from "../types";
import { requestJson } from "./http";
import { cnDateToUnix, dedupePrices, isoFromYmd } from "./normalize";
import type { FetchHistoryParams, MarketAdapter } from "./types";

/**
 * A 股适配器
 * 主源：腾讯前复权日 K（多数网络环境更稳）
 * 备源：东方财富日 K（部分代理/运营商对 push2his 会断连）
 *
 * 统一输出 HistoryResponse，与美股/加密货币适配器一致。
 */

interface EastmoneyKlineResponse {
  rc?: number;
  data?: {
    code?: string;
    name?: string;
    market?: number;
    klines?: string[];
  } | null;
}

interface TencentKlineResponse {
  code?: number;
  msg?: string;
  data?: Record<
    string,
    {
      qfqday?: string[][];
      day?: string[][];
      qt?: Record<string, string[] | string[]>;
    }
  >;
}

function parseEastmoneyKlines(raw: string[]): PricePoint[] {
  const prices: PricePoint[] = [];
  for (const line of raw) {
    const parts = line.split(",");
    if (parts.length < 5) continue;
    // 日期,开,收,高,低,成交量,成交额,...
    const date = isoFromYmd(parts[0]);
    const open = Number(parts[1]);
    const close = Number(parts[2]);
    const high = Number(parts[3]);
    const low = Number(parts[4]);
    const volume = parts[5] != null ? Number(parts[5]) : undefined;
    const amount = parts[6] != null ? Number(parts[6]) : undefined;
    if (!Number.isFinite(close) || close <= 0) continue;
    prices.push({
      date,
      time: cnDateToUnix(date),
      open: Number.isFinite(open) ? open : undefined,
      close,
      high: Number.isFinite(high) ? high : undefined,
      low: Number.isFinite(low) ? low : undefined,
      volume: Number.isFinite(volume as number) ? volume : undefined,
      amount: Number.isFinite(amount as number) ? amount : undefined,
    });
  }
  return dedupePrices(prices);
}

/** 腾讯 qfqday: [日期, 开, 收, 高, 低, 成交量] */
function parseTencentRows(rows: string[][]): PricePoint[] {
  const prices: PricePoint[] = [];
  for (const row of rows) {
    if (!row || row.length < 3) continue;
    const date = isoFromYmd(String(row[0]));
    const open = Number(row[1]);
    const close = Number(row[2]);
    const high = row[3] != null ? Number(row[3]) : undefined;
    const low = row[4] != null ? Number(row[4]) : undefined;
    const volume = row[5] != null ? Number(row[5]) : undefined;
    if (!Number.isFinite(close) || close <= 0) continue;
    prices.push({
      date,
      time: cnDateToUnix(date),
      open: Number.isFinite(open) ? open : undefined,
      close,
      high: Number.isFinite(high as number) ? high : undefined,
      low: Number.isFinite(low as number) ? low : undefined,
      volume: Number.isFinite(volume as number) ? volume : undefined,
    });
  }
  return dedupePrices(prices);
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 按自然年切分区间，避开腾讯单次条数上限（约 640~800） */
function yearChunks(period1: string, period2: string): Array<[string, string]> {
  const chunks: Array<[string, string]> = [];
  let cur = period1;
  while (cur <= period2) {
    const year = Number(cur.slice(0, 4));
    const yearEnd = `${year}-12-31`;
    const end = yearEnd < period2 ? yearEnd : period2;
    chunks.push([cur, end]);
    cur = `${year + 1}-01-01`;
  }
  return chunks;
}

async function fetchTencentKline(
  tencentSymbol: string,
  period1: string,
  period2: string,
): Promise<HistoryResponse> {
  const chunks = yearChunks(period1, period2);
  const allRows: string[][] = [];
  let name = "";

  for (const [beg, end] of chunks) {
    const url =
      "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get" +
      `?param=${encodeURIComponent(`${tencentSymbol},day,${beg},${end},800,qfq`)}`;

    const data = await requestJson<TencentKlineResponse>(url, {
      header: {
        Referer: "https://finance.qq.com/",
      },
    });

    const node = data.data?.[tencentSymbol];
    if (!node) {
      // 部分代码可能无 qfq，继续尝试下一段
      continue;
    }

    const rows = node.qfqday || node.day || [];
    allRows.push(...rows);

    if (!name) {
      const qt = node.qt?.[tencentSymbol];
      if (Array.isArray(qt) && typeof qt[1] === "string" && qt[1]) {
        name = qt[1];
      }
    }
  }

  const prices = parseTencentRows(allRows);
  if (!prices.length) {
    throw new Error("未找到该 A 股历史行情，请检查代码是否正确");
  }

  const code = tencentSymbol.replace(/^(sh|sz|bj)/i, "");

  return {
    symbol: code,
    name: name || code,
    market: "CN",
    currency: "CNY",
    provider: "tencent",
    prices,
    meta: { tencentSymbol },
  };
}

async function fetchEastmoneyKline(
  secid: string,
  period1: string,
  period2: string,
): Promise<HistoryResponse> {
  const beg = toCompactDate(period1);
  const end = toCompactDate(period2);

  const hosts = [
    "https://push2his.eastmoney.com",
    "https://push2delay.eastmoney.com",
  ];

  let lastError: Error | null = null;

  for (const host of hosts) {
    try {
      const url =
        `${host}/api/qt/stock/kline/get` +
        `?secid=${encodeURIComponent(secid)}` +
        "&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13" +
        "&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61" +
        "&klt=101&fqt=1" + // 日线 + 前复权
        `&beg=${beg}&end=${end}&lmt=1000000`;

      const data = await requestJson<EastmoneyKlineResponse>(url, {
        header: {
          Referer: "https://quote.eastmoney.com/",
        },
      });

      if (!data.data?.klines?.length) {
        throw new Error("未找到该 A 股历史行情，请检查代码是否正确");
      }

      const prices = parseEastmoneyKlines(data.data.klines);
      if (!prices.length) {
        throw new Error("历史行情为空");
      }

      const code = data.data.code || secid.split(".")[1] || secid;

      return {
        symbol: code,
        name: data.data.name || code,
        market: "CN",
        currency: "CNY",
        provider: "eastmoney",
        prices,
        meta: {
          secid,
          host,
          exchangeMarket: data.data.market,
        },
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error("东方财富行情请求失败");
}

export const cnMarketAdapter: MarketAdapter = {
  market: "CN",
  provider: "tencent",

  supports(symbol: string): boolean {
    try {
      const code = normalizeCnSymbol(symbol);
      return /^\d{6}$/.test(code);
    } catch {
      return false;
    }
  },

  async fetchHistory(params: FetchHistoryParams): Promise<HistoryResponse> {
    const code = normalizeCnSymbol(params.symbol);
    if (!/^\d{6}$/.test(code)) {
      throw new Error("A 股代码应为 6 位数字，如 600519、000001");
    }

    // 向前扩展 14 天，避开节假日导致买入日无数据
    const padStart = shiftDate(params.period1, -14);
    const period2 = params.period2;

    const tencentSymbol = toTencentSymbol(code);
    const secid =
      params.providerIds?.eastmoneySecid || toEastmoneySecid(code);

    let result: HistoryResponse | null = null;
    let primaryError: Error | null = null;

    try {
      result = await fetchTencentKline(tencentSymbol, padStart, period2);
    } catch (err) {
      primaryError = err instanceof Error ? err : new Error(String(err));
      try {
        result = await fetchEastmoneyKline(secid, padStart, period2);
      } catch (fallbackErr) {
        const fb =
          fallbackErr instanceof Error
            ? fallbackErr.message
            : String(fallbackErr);
        throw new Error(
          `${primaryError.message}；备源也失败：${fb}`,
        );
      }
    }

    if (params.name && result.name === result.symbol) {
      result.name = params.name;
    }

    return result;
  },
};
