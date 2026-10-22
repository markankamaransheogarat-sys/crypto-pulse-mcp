import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDefi } from "./tools/defi.js";
import { registerDerivatives } from "./tools/derivatives.js";
import { registerMarket } from "./tools/market.js";
import { registerPrice } from "./tools/price.js";
import { registerStablecoins } from "./tools/stablecoins.js";

export const SERVER_NAME = "crypto-pulse-mcp";
export const SERVER_VERSION = "0.1.0";

export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Read-only crypto market data from public APIs (Bybit, Binance, CoinGecko, DefiLlama). No keys, no trading, no account access. Figures are snapshots and can be seconds to minutes old; this is information, not financial advice.",
    },
  );
  registerPrice(server);
  registerDerivatives(server);
  registerMarket(server);
  registerDefi(server);
  registerStablecoins(server);
  return server;
}
