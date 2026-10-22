import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { coinMarkets, type MarketOrder } from "../sources/coingecko.js";
import { round } from "../util.js";
import { READ_ONLY, respond } from "./result.js";

export interface MarketOverviewArgs {
  limit: number;
  vsCurrency: string;
  sortBy: "market_cap" | "volume";
}

/** Heuristic: a USD-priced coin trading within 2% of $1 and moving under 0.5% in a day is treated as a stablecoin. */
export function isPegged(price: number | null, change24hPct: number | null, vsCurrency: string): boolean {
  if (vsCurrency !== "usd" || price === null || change24hPct === null) return false;
  return Math.abs(price - 1) <= 0.02 && Math.abs(change24hPct) < 0.5;
}

export async function getMarketOverview(args: MarketOverviewArgs) {
  const order: MarketOrder = args.sortBy === "volume" ? "volume_desc" : "market_cap_desc";
  const vsCurrency = args.vsCurrency.toLowerCase();
  const coins = await coinMarkets({ limit: args.limit, vsCurrency, order });

  // Pegged assets sit near 1.00 and barely move; counting them would make the market look healthier than it is.
  const volatile = coins.filter((c) => !isPegged(c.price, c.change24hPct, vsCurrency));
  const withChange = volatile.filter((c) => c.change24hPct !== null);
  const rising = withChange.filter((c) => (c.change24hPct as number) > 0).length;

  return {
    vsCurrency,
    sortedBy: args.sortBy,
    // Stablecoins are left out of this count (see isPegged).
    breadth24h: { rising, falling: withChange.length - rising, of: withChange.length },
    coins: coins.map((c) => ({
      rank: c.rank,
      symbol: c.symbol,
      name: c.name,
      price: c.price,
      change24hPct: round(c.change24hPct, 2),
      marketCap: round(c.marketCap, 0),
      volume24h: round(c.volume24h, 0),
      fromAllTimeHighPct: round(c.athChangePct, 1),
    })),
    source: "CoinGecko (cached for 60 seconds)",
    asOf: new Date().toISOString(),
  };
}

export function registerMarket(server: McpServer): void {
  server.registerTool(
    "get_market_overview",
    {
      title: "Top coins by market cap or volume",
      description:
        "The largest coins by market cap (or 24h volume) with price, 24h change, market cap, volume, distance from the all-time high, and how many of them are rising. Data from CoinGecko.",
      inputSchema: {
        limit: z.number().int().min(1).max(50).default(10).describe("How many coins to return"),
        vs_currency: z
          .string()
          .regex(/^[a-zA-Z]{3,5}$/)
          .default("usd")
          .describe("Quote currency, e.g. usd, eur, btc"),
        sort_by: z.enum(["market_cap", "volume"]).default("market_cap").describe("Ranking criterion"),
      },
      annotations: READ_ONLY,
    },
    ({ limit, vs_currency, sort_by }) =>
      respond(() => getMarketOverview({ limit, vsCurrency: vs_currency, sortBy: sort_by })),
  );
}
