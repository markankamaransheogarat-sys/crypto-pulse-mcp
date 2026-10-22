import { HttpError, getJson } from "../http.js";
import { isoFromMs, num } from "../util.js";
import type { SpotQuote } from "./bybit.js";

const SPOT = "https://api.binance.com/api/v3/ticker/24hr";
const FUTURES = "https://fapi.binance.com/fapi/v1/premiumIndex";

/** Binance answers 400 for an unknown symbol: that means "not listed", not a failure. */
async function optional<T>(url: string, ttlMs: number): Promise<T | null> {
  try {
    return await getJson<T>(url, { ttlMs, retries: 1 });
  } catch (error) {
    if (error instanceof HttpError && error.status === 400) return null;
    throw error;
  }
}

export async function binanceSpot(symbol: string): Promise<SpotQuote | null> {
  const t = await optional<Record<string, string>>(`${SPOT}?symbol=${encodeURIComponent(symbol)}`, 5_000);
  if (!t) return null;
  return {
    venue: "binance",
    symbol: t.symbol ?? symbol,
    price: num(t.lastPrice),
    change24hPct: num(t.priceChangePercent),
    high24h: num(t.highPrice),
    low24h: num(t.lowPrice),
    volume24hQuote: num(t.quoteVolume),
  };
}

export interface BinancePerp {
  symbol: string;
  markPrice: number | null;
  indexPrice: number | null;
  /** Latest settled funding rate, as a fraction. */
  fundingRate: number | null;
  nextFundingTime: string | null;
}

export async function binancePerp(symbol: string): Promise<BinancePerp | null> {
  const t = await optional<Record<string, string | number>>(`${FUTURES}?symbol=${encodeURIComponent(symbol)}`, 5_000);
  if (!t) return null;
  return {
    symbol: String(t.symbol ?? symbol),
    markPrice: num(t.markPrice),
    indexPrice: num(t.indexPrice),
    fundingRate: num(t.lastFundingRate),
    nextFundingTime: isoFromMs(t.nextFundingTime),
  };
}
