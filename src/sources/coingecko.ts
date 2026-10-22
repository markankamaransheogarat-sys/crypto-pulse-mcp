import { getJson } from "../http.js";
import { num } from "../util.js";

const MARKETS = "https://api.coingecko.com/api/v3/coins/markets";

export interface MarketCoin {
  rank: number | null;
  symbol: string;
  name: string;
  price: number | null;
  change24hPct: number | null;
  marketCap: number | null;
  volume24h: number | null;
  athChangePct: number | null;
}

export type MarketOrder = "market_cap_desc" | "volume_desc";

export async function coinMarkets(options: { limit: number; vsCurrency: string; order: MarketOrder }): Promise<MarketCoin[]> {
  const params = new URLSearchParams({
    vs_currency: options.vsCurrency,
    order: options.order,
    per_page: String(options.limit),
    page: "1",
    price_change_percentage: "24h",
  });
  // The free CoinGecko tier is rate limited, so answers are kept for a minute.
  const rows = await getJson<Array<Record<string, unknown>>>(`${MARKETS}?${params}`, { ttlMs: 60_000 });
  return rows.map((r) => ({
    rank: num(r.market_cap_rank),
    symbol: String(r.symbol ?? "").toUpperCase(),
    name: String(r.name ?? ""),
    price: num(r.current_price),
    change24hPct: num(r.price_change_percentage_24h),
    marketCap: num(r.market_cap),
    volume24h: num(r.total_volume),
    athChangePct: num(r.ath_change_percentage),
  }));
}
