import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { chainTvls, protocols, type Protocol } from "../sources/defillama.js";
import { round } from "../util.js";
import { READ_ONLY, respond } from "./result.js";

export interface DefiTvlArgs {
  chain?: string | undefined;
  protocol?: string | undefined;
  limit: number;
}

const lower = (s: string) => s.trim().toLowerCase();

/** Exact match first, then prefix, then substring. */
function findBest<T>(items: T[], query: string, keys: (item: T) => string[]): T | undefined {
  const q = lower(query);
  const score = (item: T): number => {
    let best = 0;
    for (const key of keys(item).map(lower)) {
      if (key === q) return 3;
      if (key.startsWith(q)) best = Math.max(best, 2);
      else if (key.includes(q)) best = Math.max(best, 1);
    }
    return best;
  };
  let winner: T | undefined;
  let winnerScore = 0;
  for (const item of items) {
    const s = score(item);
    if (s > winnerScore) {
      winner = item;
      winnerScore = s;
    }
  }
  return winner;
}

function protocolSummary(p: Protocol) {
  return {
    name: p.name,
    slug: p.slug,
    category: p.category,
    tvlUsd: round(p.tvl, 0),
    change1hPct: round(p.change1hPct, 2),
    change1dPct: round(p.change1dPct, 2),
    change7dPct: round(p.change7dPct, 2),
    chains: p.chains.length > 8 ? [...p.chains.slice(0, 8), `+${p.chains.length - 8} more`] : p.chains,
  };
}

export async function getDefiTvl(args: DefiTvlArgs) {
  if (args.protocol) {
    const all = await protocols();
    // Prefer the biggest protocol when several share a name prefix.
    const candidates = all.filter((p) => lower(p.name).includes(lower(args.protocol as string)) || lower(p.slug).includes(lower(args.protocol as string)));
    const match =
      findBest(candidates.sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0)), args.protocol, (p) => [p.name, p.slug]) ?? undefined;
    if (!match) throw new Error(`No protocol matching "${args.protocol}" on DefiLlama.`);

    const chainKey = args.chain
      ? Object.keys(match.chainTvls).find((c) => lower(c) === lower(args.chain as string))
      : undefined;
    return {
      protocol: protocolSummary(match),
      ...(args.chain ? { tvlOnChainUsd: chainKey ? round(match.chainTvls[chainKey] ?? null, 0) : null, chain: args.chain } : {}),
      source: "DefiLlama",
      asOf: new Date().toISOString(),
    };
  }

  const chains = await chainTvls();
  const total = chains.reduce((sum, c) => sum + c.tvl, 0);

  if (args.chain) {
    const match = findBest(chains, args.chain, (c) => [c.name]);
    if (!match) {
      const hints = chains.slice(0, 5).map((c) => c.name).join(", ");
      throw new Error(`No chain matching "${args.chain}". Largest chains: ${hints}.`);
    }
    const rank = chains.findIndex((c) => c.name === match.name) + 1;
    const all = await protocols();
    // Exchange wallets (category "CEX") are balances, not DeFi; keep them out of the ranking.
    const top = all
      .filter((p) => p.category !== "CEX")
      .map((p) => ({ p, tvl: p.chainTvls[match.name] ?? 0 }))
      .filter((x) => x.tvl > 0)
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, args.limit);
    return {
      chain: match.name,
      tokenSymbol: match.tokenSymbol,
      tvlUsd: round(match.tvl, 0),
      rank,
      shareOfAllChainsPct: total > 0 ? round((match.tvl / total) * 100, 3) : null,
      topProtocols: top.map(({ p, tvl }) => ({
        name: p.name,
        category: p.category,
        tvlOnChainUsd: round(tvl, 0),
        change1dPct: round(p.change1dPct, 2),
        change7dPct: round(p.change7dPct, 2),
      })),
      notes: [
        "Protocol TVLs can add up to more than the chain total: vaults and curators deposit into lending pools, so the same money shows under both. DefiLlama counts it once in the chain figure.",
      ],
      source: "DefiLlama",
      asOf: new Date().toISOString(),
    };
  }

  return {
    totalTvlUsd: round(total, 0),
    chains: chains.slice(0, args.limit).map((c, i) => ({
      rank: i + 1,
      chain: c.name,
      tokenSymbol: c.tokenSymbol,
      tvlUsd: round(c.tvl, 0),
      sharePct: total > 0 ? round((c.tvl / total) * 100, 2) : null,
    })),
    source: "DefiLlama",
    asOf: new Date().toISOString(),
  };
}

export function registerDefi(server: McpServer): void {
  server.registerTool(
    "get_defi_tvl",
    {
      title: "DeFi total value locked",
      description:
        "DeFi TVL from DefiLlama. With no arguments: the largest chains and their share. With `chain` (e.g. Solana, Stellar): that chain's TVL, rank and its top protocols. With `protocol` (e.g. aave, jupiter): its TVL, category and 1h/1d/7d change.",
      inputSchema: {
        chain: z.string().min(2).max(40).optional().describe("Chain name, e.g. Solana, Ethereum, Stellar"),
        protocol: z.string().min(2).max(60).optional().describe("Protocol name or slug, e.g. aave, uniswap"),
        limit: z.number().int().min(1).max(25).default(10).describe("How many rows to return"),
      },
      annotations: READ_ONLY,
    },
    ({ chain, protocol, limit }) => respond(() => getDefiTvl({ chain, protocol, limit })),
  );
}
