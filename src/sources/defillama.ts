import { getJson } from "../http.js";
import { num, pctChange } from "../util.js";

const CHAINS = "https://api.llama.fi/v2/chains";
const PROTOCOLS = "https://api.llama.fi/protocols";
const STABLECOINS = "https://stablecoins.llama.fi/stablecoins?includePrices=true";

const FIVE_MINUTES = 5 * 60_000;

export interface ChainTvl {
  name: string;
  tokenSymbol: string | null;
  tvl: number;
}

export async function chainTvls(): Promise<ChainTvl[]> {
  const rows = await getJson<Array<Record<string, unknown>>>(CHAINS, { ttlMs: FIVE_MINUTES });
  return rows
    .map((r) => ({
      name: String(r.name ?? ""),
      tokenSymbol: typeof r.tokenSymbol === "string" ? r.tokenSymbol : null,
      tvl: num(r.tvl) ?? 0,
    }))
    .sort((a, b) => b.tvl - a.tvl);
}

export interface Protocol {
  name: string;
  slug: string;
  category: string | null;
  chains: string[];
  tvl: number | null;
  change1hPct: number | null;
  change1dPct: number | null;
  change7dPct: number | null;
  /** TVL per chain, without the "-borrowed" / "-staking" style breakdown entries. */
  chainTvls: Record<string, number>;
}

export async function protocols(): Promise<Protocol[]> {
  // The list holds several thousand protocols, so it is cached for a while.
  const rows = await getJson<Array<Record<string, unknown>>>(PROTOCOLS, { ttlMs: FIVE_MINUTES, timeoutMs: 30_000 });
  return rows.map((r) => {
    const perChain: Record<string, number> = {};
    const raw = r.chainTvls;
    if (raw && typeof raw === "object") {
      for (const [chain, value] of Object.entries(raw as Record<string, unknown>)) {
        if (chain.includes("-")) continue;
        const n = num(value);
        if (n !== null) perChain[chain] = n;
      }
    }
    return {
      name: String(r.name ?? ""),
      slug: String(r.slug ?? ""),
      category: typeof r.category === "string" ? r.category : null,
      chains: Array.isArray(r.chains) ? r.chains.map(String) : [],
      tvl: num(r.tvl),
      change1hPct: num(r.change_1h),
      change1dPct: num(r.change_1d),
      change7dPct: num(r.change_7d),
      chainTvls: perChain,
    };
  });
}

export interface Stablecoin {
  name: string;
  symbol: string;
  pegType: string;
  circulatingUsd: number | null;
  change1dPct: number | null;
  change7dPct: number | null;
  change30dPct: number | null;
  price: number | null;
  chainCount: number;
}

export async function stablecoins(): Promise<Stablecoin[]> {
  const body = await getJson<{ peggedAssets?: Array<Record<string, unknown>> }>(STABLECOINS, {
    ttlMs: FIVE_MINUTES,
    timeoutMs: 20_000,
  });
  const pick = (v: unknown, peg: string): number | null =>
    v && typeof v === "object" ? num((v as Record<string, unknown>)[peg]) : null;

  return (body.peggedAssets ?? []).map((a) => {
    const peg = String(a.pegType ?? "peggedUSD");
    const now = pick(a.circulating, peg);
    return {
      name: String(a.name ?? ""),
      symbol: String(a.symbol ?? ""),
      pegType: peg,
      circulatingUsd: now,
      change1dPct: pctChange(now, pick(a.circulatingPrevDay, peg)),
      change7dPct: pctChange(now, pick(a.circulatingPrevWeek, peg)),
      change30dPct: pctChange(now, pick(a.circulatingPrevMonth, peg)),
      price: num(a.price),
      chainCount: Array.isArray(a.chains) ? a.chains.length : 0,
    };
  });
}
