import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { binanceSpot } from "../sources/binance.js";
import { bybitSpot, type SpotQuote } from "../sources/bybit.js";
import { parseSymbol } from "../symbols.js";
import { round, settle } from "../util.js";
import { READ_ONLY, respond } from "./result.js";

export async function getPrice(input: string) {
  const symbol = parseSymbol(input);
  const errors: string[] = [];

  const [bybit, binance] = await Promise.allSettled([bybitSpot(symbol.pair), binanceSpot(symbol.pair)]);
  const venues = [settle("bybit", bybit, errors), settle("binance", binance, errors)].filter(
    (v): v is SpotQuote => v !== null,
  );

  if (venues.length === 0) {
    throw new Error(
      errors.length > 0
        ? `No price available for ${symbol.pair}. ${errors.join("; ")}`
        : `${symbol.pair} is not listed on Bybit or Binance spot.`,
    );
  }

  const prices = venues.map((v) => v.price).filter((p): p is number => p !== null);
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);

  return {
    symbol: symbol.pair,
    base: symbol.base,
    quote: symbol.quote,
    venues: venues.map((v) => ({
      venue: v.venue,
      price: v.price,
      change24hPct: round(v.change24hPct, 3),
      high24h: v.high24h,
      low24h: v.low24h,
      volume24hQuote: round(v.volume24hQuote, 0),
    })),
    // Only meaningful with two venues: how far apart the quotes are right now.
    spreadPct: prices.length >= 2 ? round(((highest - lowest) / lowest) * 100, 4) : null,
    ...(errors.length > 0 ? { errors } : {}),
    asOf: new Date().toISOString(),
  };
}

export function registerPrice(server: McpServer): void {
  server.registerTool(
    "get_price",
    {
      title: "Spot price across exchanges",
      description:
        "Current spot price, 24h change, 24h range and quote volume for a coin on Bybit and Binance, plus the price gap between the two exchanges. Accepts BTC, ETH/USDT, SOLUSDT and similar; a bare coin means a USDT pair.",
      inputSchema: {
        symbol: z.string().min(2).max(24).describe("Coin or pair, e.g. BTC, ETH/USDT, SOLUSDT"),
      },
      annotations: READ_ONLY,
    },
    ({ symbol }) => respond(() => getPrice(symbol)),
  );
}
