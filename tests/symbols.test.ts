import { describe, expect, it } from "vitest";
import { parseSymbol } from "../src/symbols.js";

describe("parseSymbol", () => {
  it("defaults a bare coin to a USDT pair", () => {
    expect(parseSymbol("btc")).toEqual({ base: "BTC", quote: "USDT", pair: "BTCUSDT" });
  });

  it("splits separated pairs", () => {
    expect(parseSymbol("eth/usdc")).toEqual({ base: "ETH", quote: "USDC", pair: "ETHUSDC" });
    expect(parseSymbol("SOL-USDT")).toEqual({ base: "SOL", quote: "USDT", pair: "SOLUSDT" });
    expect(parseSymbol("doge usdt")).toEqual({ base: "DOGE", quote: "USDT", pair: "DOGEUSDT" });
  });

  it("recognises exchange-style pairs", () => {
    expect(parseSymbol("SOLUSDT")).toEqual({ base: "SOL", quote: "USDT", pair: "SOLUSDT" });
    expect(parseSymbol("ETHBTC")).toEqual({ base: "ETH", quote: "BTC", pair: "ETHBTC" });
  });

  it("does not mistake a coin ending in a quote-like suffix for a pair when it would leave no base", () => {
    expect(parseSymbol("USDT")).toEqual({ base: "USDT", quote: "USDT", pair: "USDTUSDT" });
  });

  it("rejects empty and malformed input", () => {
    expect(() => parseSymbol("   ")).toThrow(/empty/i);
    expect(() => parseSymbol("BTC; DROP TABLE")).toThrow(/not a valid symbol/i);
    expect(() => parseSymbol("a")).toThrow(/not a valid symbol/i);
  });
});
