#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  // stdout carries the protocol; anything human-readable goes to stderr.
  console.error("crypto-pulse-mcp ready on stdio");
}

main().catch((error: unknown) => {
  console.error("crypto-pulse-mcp failed to start:", error);
  process.exit(1);
});
