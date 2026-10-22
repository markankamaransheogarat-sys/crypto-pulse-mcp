import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCache } from "../src/http.js";
import { createServer } from "../src/server.js";
import { bybitTicker, mockFetch, type FetchMock } from "./helpers.js";

let mock: FetchMock | undefined;
let client: Client;

beforeEach(async () => {
  clearCache();
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  mock?.restore();
  await client.close();
});

describe("MCP server", () => {
  it("exposes the five tools, all marked read-only", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_defi_tvl",
      "get_derivatives",
      "get_market_overview",
      "get_price",
      "get_stablecoins",
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.description?.length).toBeGreaterThan(40);
    }
  });

  it("serves a tool call end to end", async () => {
    mock = mockFetch([
      ["api.bybit.com", bybitTicker([{ symbol: "BTCUSDT", lastPrice: "80000", price24hPcnt: "0.01", highPrice24h: "81000", lowPrice24h: "79000", turnover24h: "1" }])],
      ["api.binance.com", { symbol: "BTCUSDT", lastPrice: "80010", priceChangePercent: "1", highPrice: "81000", lowPrice: "79000", quoteVolume: "2" }],
    ]);
    const result = await client.callTool({ name: "get_price", arguments: { symbol: "btc" } });
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(JSON.parse(text)).toMatchObject({ symbol: "BTCUSDT", spreadPct: 0.0125 });
  });

  it("returns tool failures as error results instead of crashing", async () => {
    const result = await client.callTool({ name: "get_price", arguments: { symbol: "bad symbol!!" } });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toMatch(/not a valid symbol/i);
  });

  it("rejects arguments outside the declared ranges", async () => {
    const result = await client.callTool({ name: "get_market_overview", arguments: { limit: 500 } });
    expect(result.isError).toBe(true);
  });
});
