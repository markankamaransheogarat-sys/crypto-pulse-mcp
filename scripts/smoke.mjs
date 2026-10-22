// Live smoke test: starts the built server over stdio and calls every tool against the real APIs.
// Usage: npm run build && node scripts/smoke.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry] }));

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

const calls = [
  ["get_price", { symbol: "SOL" }],
  ["get_derivatives", { symbol: "BTC" }],
  ["get_market_overview", { limit: 5 }],
  ["get_defi_tvl", { chain: "Stellar", limit: 3 }],
  ["get_defi_tvl", { protocol: "aave" }],
  ["get_stablecoins", { limit: 3 }],
  ["get_price", { symbol: "NOTACOINXYZ" }],
];

let failed = 0;
for (const [name, args] of calls) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.[0]?.text ?? "";
  console.log(`\n=== ${name} ${JSON.stringify(args)} ${result.isError ? "(error result)" : ""}`);
  console.log(text.length > 900 ? `${text.slice(0, 900)}\n…` : text);
  if (result.isError && name !== "get_price") failed++;
}
await client.close();
process.exit(failed ? 1 : 0);
