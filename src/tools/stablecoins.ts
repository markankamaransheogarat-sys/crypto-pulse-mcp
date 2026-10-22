import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stablecoins } from "../sources/defillama.js";
import { round } from "../util.js";
import { READ_ONLY, respond } from "./result.js";

export async function getStablecoins(limit: number) {
  const all = (await stablecoins())
    .filter((s) => s.pegType === "peggedUSD" && s.circulatingUsd !== null && s.circulatingUsd > 0)
    .sort((a, b) => (b.circulatingUsd as number) - (a.circulatingUsd as number));

  const total = all.reduce((sum, s) => sum + (s.circulatingUsd as number), 0);
  const prevDay = all.reduce((sum, s) => sum + (s.circulatingUsd as number) / (1 + (s.change1dPct ?? 0) / 100), 0);
  const prevWeek = all.reduce((sum, s) => sum + (s.circulatingUsd as number) / (1 + (s.change7dPct ?? 0) / 100), 0);

  return {
    totalUsdPeggedSupplyUsd: round(total, 0),
    totalChange1dPct: prevDay > 0 ? round(((total - prevDay) / prevDay) * 100, 3) : null,
    totalChange7dPct: prevWeek > 0 ? round(((total - prevWeek) / prevWeek) * 100, 3) : null,
    stablecoins: all.slice(0, limit).map((s, i) => ({
      rank: i + 1,
      name: s.name,
      symbol: s.symbol,
      supplyUsd: round(s.circulatingUsd, 0),
      sharePct: total > 0 ? round(((s.circulatingUsd as number) / total) * 100, 2) : null,
      change1dPct: round(s.change1dPct, 3),
      change7dPct: round(s.change7dPct, 3),
      change30dPct: round(s.change30dPct, 3),
      price: s.price,
      chains: s.chainCount,
    })),
    notes: ["USD-pegged assets only. Growing supply means net minting (money entering crypto); shrinking means redemptions."],
    source: "DefiLlama stablecoins",
    asOf: new Date().toISOString(),
  };
}

export function registerStablecoins(server: McpServer): void {
  server.registerTool(
    "get_stablecoins",
    {
      title: "Stablecoin supply and flows",
      description:
        "The largest USD stablecoins by circulating supply with 1d/7d/30d supply change and market share, plus the total change across all of them. Supply growth is a rough proxy for money entering or leaving crypto.",
      inputSchema: {
        limit: z.number().int().min(1).max(25).default(10).describe("How many stablecoins to return"),
      },
      annotations: READ_ONLY,
    },
    ({ limit }) => respond(() => getStablecoins(limit)),
  );
}
