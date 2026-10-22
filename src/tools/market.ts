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

export async function getMarketOverview(args: MarketOverviewArgs) {
  const order: MarketOrder = args.sortBy === "volume" ? "volume_desc" : "market_cap_desc";
  const vsCurrency = args.vsCurrency.toLowerCase();
  const coins = await coinMarkets({ limit: args.limit, vsCurrency, order });

  const withChange = coins.filter((c) => c.change24hPct !== null);
  const rising = withChange.filter((c) => (c.change24hPct as number) > 0).length;

  return {
    vsCurrency,
    sortedBy: args.sortBy,
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
