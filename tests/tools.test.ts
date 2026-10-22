import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCache } from "../src/http.js";
import { getDefiTvl } from "../src/tools/defi.js";
import { getDerivatives } from "../src/tools/derivatives.js";
import { getMarketOverview } from "../src/tools/market.js";
import { getPrice } from "../src/tools/price.js";
import { getStablecoins } from "../src/tools/stablecoins.js";
import { bybitTicker, mockFetch, status, type FetchMock } from "./helpers.js";

let mock: FetchMock | undefined;

beforeEach(() => clearCache());
afterEach(() => mock?.restore());

const bybitSpotRow = {
  symbol: "SOLUSDT",
  lastPrice: "100",
  price24hPcnt: "-0.0250",
  highPrice24h: "105",
  lowPrice24h: "98",
  turnover24h: "5000000",
};
const binanceSpotRow = {
  symbol: "SOLUSDT",
  lastPrice: "100.5",
  priceChangePercent: "-2.4",
  highPrice: "105.5",
  lowPrice: "98.1",
  quoteVolume: "20000000",
};

describe("get_price", () => {
  it("combines both exchanges and measures the gap", async () => {
    mock = mockFetch([
      ["api.bybit.com", bybitTicker([bybitSpotRow])],
      ["api.binance.com", binanceSpotRow],
    ]);
    const result = await getPrice("sol");
    expect(result.symbol).toBe("SOLUSDT");
    expect(result.venues.map((v) => v.venue)).toEqual(["bybit", "binance"]);
    expect(result.venues[0]?.change24hPct).toBe(-2.5);
    expect(result.spreadPct).toBe(0.5);
    expect(result).not.toHaveProperty("errors");
  });

  it("still answers when one exchange is down, and says so", async () => {
    mock = mockFetch([
      ["api.bybit.com", bybitTicker([bybitSpotRow])],
      ["api.binance.com", status(451)],
    ]);
    const result = await getPrice("SOL");
    expect(result.venues).toHaveLength(1);
    expect(result.spreadPct).toBeNull();
    expect(result.errors?.[0]).toMatch(/^binance: HTTP 451/);
  });

  it("treats an unknown symbol as 'not listed', not as an outage", async () => {
    mock = mockFetch([
      ["api.bybit.com", { retCode: 10001, retMsg: "Not supported symbols", result: {} }],
      ["api.binance.com", status(400)],
    ]);
    await expect(getPrice("NOPE")).rejects.toThrow("NOPEUSDT is not listed on Bybit or Binance spot.");
  });

  it("fails with the reasons when every exchange is down", async () => {
    mock = mockFetch([
      ["api.bybit.com", status(403)],
      ["api.binance.com", status(451)],
    ]);
    await expect(getPrice("BTC")).rejects.toThrow(/No price available for BTCUSDT.*bybit.*binance/);
  });
});

describe("get_derivatives", () => {
  it("computes funding, basis and annualised funding", async () => {
    mock = mockFetch([
      [
        "api.bybit.com",
        bybitTicker([
          {
            symbol: "BTCUSDT",
            lastPrice: "81967.6",
            markPrice: "82000",
            indexPrice: "81900",
            fundingRate: "-0.0000426",
            fundingIntervalHour: "8",
            nextFundingTime: "1792684800000",
            openInterestValue: "4000000000",
            turnover24h: "8000000000",
          },
        ]),
      ],
      [
        "fapi.binance.com",
        {
          symbol: "BTCUSDT",
          markPrice: "82001",
          indexPrice: "81901",
          lastFundingRate: "0.0001",
          nextFundingTime: 1792684800000,
        },
      ],
    ]);
    const result = await getDerivatives("BTC");
    expect(result.bybit?.fundingRatePct).toBe(-0.00426);
    expect(result.bybit?.annualizedFundingPct).toBe(-4.66);
    expect(result.bybit?.basisPct).toBe(0.1221);
    expect(result.bybit?.openInterestToVolume).toBe(0.5);
    expect(result.bybit?.nextFundingTime).toBe("2026-10-22T16:00:00.000Z");
    expect(result.binance?.lastFundingRatePct).toBe(0.01);
  });

  it("returns the venue that works when the other has no contract", async () => {
    mock = mockFetch([
      ["api.bybit.com", { retCode: 10001, retMsg: "Not supported symbols", result: {} }],
      ["fapi.binance.com", { symbol: "XYZUSDT", markPrice: "1", indexPrice: "1", lastFundingRate: "0", nextFundingTime: 0 }],
    ]);
    const result = await getDerivatives("XYZ");
    expect(result.bybit).toBeNull();
    expect(result.binance?.markPrice).toBe(1);
  });

  it("explains when neither exchange lists a perpetual", async () => {
    mock = mockFetch([
      ["api.bybit.com", bybitTicker([])],
      ["fapi.binance.com", status(400)],
    ]);
    await expect(getDerivatives("NOPE")).rejects.toThrow("NOPEUSDT has no perpetual contract");
  });
});

describe("get_market_overview", () => {
  it("maps CoinGecko rows and counts market breadth", async () => {
    mock = mockFetch([
      [
        "coingecko.com",
        [
          { market_cap_rank: 1, symbol: "btc", name: "Bitcoin", current_price: 80000, price_change_percentage_24h: 1.234, market_cap: 1.6e12, total_volume: 3e10, ath_change_percentage: -35.04 },
          { market_cap_rank: 2, symbol: "eth", name: "Ethereum", current_price: 2400, price_change_percentage_24h: -2.5, market_cap: 2.9e11, total_volume: 1e10, ath_change_percentage: -51.3 },
          { market_cap_rank: 3, symbol: "sol", name: "Solana", current_price: 100, price_change_percentage_24h: null, market_cap: 5e10, total_volume: 2e9, ath_change_percentage: -60 },
        ],
      ],
    ]);
    const result = await getMarketOverview({ limit: 3, vsCurrency: "USD", sortBy: "volume" });
    expect(mock.calls[0]).toContain("order=volume_desc");
    expect(mock.calls[0]).toContain("vs_currency=usd");
    expect(result.coins[0]).toMatchObject({ symbol: "BTC", change24hPct: 1.23 });
    expect(result.breadth24h).toEqual({ rising: 1, falling: 1, of: 2 });
  });
});

const chains = [
  { name: "Ethereum", tokenSymbol: "ETH", tvl: 60_000_000_000 },
  { name: "Solana", tokenSymbol: "SOL", tvl: 8_000_000_000 },
  { name: "Stellar", tokenSymbol: "XLM", tvl: 240_000_000 },
];
const protocolList = [
  { name: "Binance CEX", slug: "binance-cex", category: "CEX", chains: ["Stellar"], tvl: 1e11, chainTvls: { Stellar: 256_000_000 } },
  { name: "Blend Pools V2", slug: "blend-pools-v2", category: "Lending", chains: ["Stellar"], tvl: 140_000_000, change_1d: -1.14, change_7d: 3.26, chainTvls: { Stellar: 140_000_000, "Stellar-borrowed": 9 } },
  { name: "Aave V2", slug: "aave-v2", category: "Lending", chains: ["Ethereum"], tvl: 1_000_000_000, chainTvls: { Ethereum: 1_000_000_000 } },
  { name: "Aave V3", slug: "aave-v3", category: "Lending", chains: ["Ethereum", "Base"], tvl: 17_000_000_000, change_1d: -0.55, chainTvls: { Ethereum: 15_000_000_000, Base: 2_000_000_000 } },
];

describe("get_defi_tvl", () => {
  beforeEach(() => {
    mock = mockFetch([
      ["api.llama.fi/v2/chains", chains],
      ["api.llama.fi/protocols", protocolList],
    ]);
  });

  it("ranks chains and shares when called with no arguments", async () => {
    const result = (await getDefiTvl({ limit: 2 })) as { chains: Array<{ chain: string; sharePct: number }> };
    expect(result.chains.map((c) => c.chain)).toEqual(["Ethereum", "Solana"]);
    expect(result.chains[0]?.sharePct).toBe(87.92);
  });

  it("describes a chain and leaves exchange wallets out of its protocol ranking", async () => {
    const result = (await getDefiTvl({ chain: "stellar", limit: 5 })) as {
      chain: string;
      rank: number;
      topProtocols: Array<{ name: string }>;
    };
    expect(result.chain).toBe("Stellar");
    expect(result.rank).toBe(3);
    expect(result.topProtocols.map((p) => p.name)).toEqual(["Blend Pools V2"]);
  });

  it("suggests real chains for an unknown one", async () => {
    await expect(getDefiTvl({ chain: "atlantis", limit: 5 })).rejects.toThrow(/Largest chains: Ethereum, Solana, Stellar/);
  });

  it("picks the biggest protocol for an ambiguous name", async () => {
    const result = (await getDefiTvl({ protocol: "aave", limit: 5 })) as { protocol: { slug: string; tvlUsd: number } };
    expect(result.protocol.slug).toBe("aave-v3");
  });

  it("reports a protocol's TVL on one chain", async () => {
    const result = (await getDefiTvl({ protocol: "aave-v3", chain: "base", limit: 5 })) as { tvlOnChainUsd: number | null };
    expect(result.tvlOnChainUsd).toBe(2_000_000_000);
  });

  it("errors on an unknown protocol", async () => {
    await expect(getDefiTvl({ protocol: "nonexistentprotocol", limit: 5 })).rejects.toThrow(/No protocol matching/);
  });
});

describe("get_stablecoins", () => {
  it("computes supply shares and changes, USD pegs only", async () => {
    mock = mockFetch([
      [
        "stablecoins.llama.fi",
        {
          peggedAssets: [
            { name: "Tether", symbol: "USDT", pegType: "peggedUSD", circulating: { peggedUSD: 200 }, circulatingPrevDay: { peggedUSD: 100 }, circulatingPrevWeek: { peggedUSD: 200 }, circulatingPrevMonth: { peggedUSD: 400 }, price: 1, chains: ["a", "b"] },
            { name: "USD Coin", symbol: "USDC", pegType: "peggedUSD", circulating: { peggedUSD: 100 }, circulatingPrevDay: { peggedUSD: 100 }, circulatingPrevWeek: { peggedUSD: 100 }, circulatingPrevMonth: { peggedUSD: 100 }, price: 0.9997, chains: ["a"] },
            { name: "Euro Coin", symbol: "EURC", pegType: "peggedEUR", circulating: { peggedEUR: 50 }, chains: [] },
          ],
        },
      ],
    ]);
    const result = await getStablecoins(10);
    expect(result.stablecoins.map((s) => s.symbol)).toEqual(["USDT", "USDC"]);
    expect(result.totalUsdPeggedSupplyUsd).toBe(300);
    expect(result.stablecoins[0]).toMatchObject({ sharePct: 66.67, change1dPct: 100, change30dPct: -50, chains: 2 });
    expect(result.totalChange1dPct).toBe(50);
  });
});
