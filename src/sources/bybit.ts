import { getJson } from "../http.js";
import { isoFromMs, num } from "../util.js";

const TICKERS = "https://api.bybit.com/v5/market/tickers";

interface BybitResponse {
  retCode: number;
  retMsg: string;
  result?: { list?: Array<Record<string, string>> };
}

async function ticker(category: "spot" | "linear", symbol: string): Promise<Record<string, string> | null> {
  const body = await getJson<BybitResponse>(`${TICKERS}?category=${category}&symbol=${encodeURIComponent(symbol)}`, {
    ttlMs: 5_000,
  });
  if (body.retCode !== 0) {
    // An unknown symbol is "not listed here", not a failure of the exchange.
    if (/not supported symbol|symbol invalid|params error/i.test(body.retMsg)) return null;
    throw new Error(body.retMsg || `error code ${body.retCode}`);
  }
  return body.result?.list?.[0] ?? null;
}

export interface SpotQuote {
  venue: string;
  symbol: string;
  price: number | null;
  change24hPct: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24hQuote: number | null;
}

export async function bybitSpot(symbol: string): Promise<SpotQuote | null> {
  const t = await ticker("spot", symbol);
  if (!t) return null;
  const change = num(t.price24hPcnt);
  return {
    venue: "bybit",
    symbol: t.symbol ?? symbol,
    price: num(t.lastPrice),
    change24hPct: change === null ? null : change * 100,
    high24h: num(t.highPrice24h),
    low24h: num(t.lowPrice24h),
    volume24hQuote: num(t.turnover24h),
  };
}

export interface BybitPerp {
  symbol: string;
  lastPrice: number | null;
  markPrice: number | null;
  indexPrice: number | null;
  /** Funding rate per funding interval, as a fraction (0.0001 = 0.01%). */
  fundingRate: number | null;
  fundingIntervalHours: number | null;
  nextFundingTime: string | null;
  openInterestUsd: number | null;
  volume24hUsd: number | null;
}

export async function bybitPerp(symbol: string): Promise<BybitPerp | null> {
  const t = await ticker("linear", symbol);
  if (!t) return null;
  return {
    symbol: t.symbol ?? symbol,
    lastPrice: num(t.lastPrice),
    markPrice: num(t.markPrice),
    indexPrice: num(t.indexPrice),
    fundingRate: num(t.fundingRate),
    fundingIntervalHours: num(t.fundingIntervalHour),
    nextFundingTime: isoFromMs(t.nextFundingTime),
    openInterestUsd: num(t.openInterestValue),
    volume24hUsd: num(t.turnover24h),
  };
}
