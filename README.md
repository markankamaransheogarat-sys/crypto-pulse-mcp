# crypto-pulse-mcp

Read-only crypto market data for AI assistants, over the [Model Context Protocol](https://modelcontextprotocol.io).
Ask Claude (or any MCP client) about prices, funding, open interest, DeFi TVL and stablecoin flows and get
structured answers from public APIs. **No API keys. No trading. No account access.**

| Tool | What it answers |
| :--- | :--- |
| `get_price` | Spot price, 24h change/range/volume on **Bybit and Binance**, and the gap between the two |
| `get_derivatives` | Perpetual **funding rate** (also annualised), **basis**, **open interest** and its ratio to volume |
| `get_market_overview` | Top coins by market cap or volume, 24h change, distance from ATH, market breadth (CoinGecko) |
| `get_defi_tvl` | Top chains by TVL, one chain with its top protocols (e.g. Solana, **Stellar**), or one protocol (DefiLlama) |
| `get_stablecoins` | Largest USD stablecoins, supply share and 1d/7d/30d supply change, a rough proxy for money entering or leaving crypto |

Example prompts once it is connected:

- "Is SOL trading at a premium on Bybit compared with Binance right now?"
- "What is BTC funding doing? Are longs crowded?"
- "How big is Stellar DeFi, and which protocols lead it?"
- "Is stablecoin supply growing or shrinking this week?"

## Example

Asked in Claude Code with the server connected (snapshot, 22 Oct 2026):

> Is SOL at a premium on Bybit vs Binance? What is BTC funding doing? How big is Stellar DeFi?

- **SOL (`get_price`):** no premium. $103.82 on Bybit, $103.83 on Binance, about 0.01% apart.
- **BTC funding (`get_derivatives`):** slightly negative, -0.0041% per 8h on Bybit (about -4.5% a year), so shorts are paying longs. Longs do not look crowded.
- **Stellar DeFi (`get_defi_tvl`):** about $241M TVL, #18 among chains. Top protocol: Blend Pools V2, about $140M.

## Install

Requires Node.js 20 or newer. The quickest way is `npx`, no clone needed:

```bash
claude mcp add crypto-pulse -- npx -y crypto-pulse-mcp
```

Published on [npm](https://www.npmjs.com/package/crypto-pulse-mcp) and in the official MCP Registry as
`io.github.markankamaransheogarat-sys/crypto-pulse-mcp`.

To run it from source instead:

```bash
git clone https://github.com/markankamaransheogarat-sys/crypto-pulse-mcp.git
cd crypto-pulse-mcp
npm install
npm run build
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "crypto-pulse": {
      "command": "npx",
      "args": ["-y", "crypto-pulse-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add crypto-pulse -- node /absolute/path/to/crypto-pulse-mcp/dist/index.js
```

Any other MCP client that can launch a stdio server works the same way.

## Details worth knowing

- **Symbols.** `BTC`, `ETH/USDT`, `SOLUSDT` and `doge-usdt` all work; a bare coin means a USDT pair.
- **One exchange down is not a failure.** `get_price` and `get_derivatives` query both exchanges in parallel. If one
  is unreachable (Binance is geo-blocked in some countries), you still get the other, with an `errors` field saying so.
  An unknown symbol is reported as "not listed", not as an outage.
- **Caching.** Responses are cached briefly (5 s for exchange tickers, 60 s for CoinGecko, 5 min for DefiLlama) to stay
  inside free-tier rate limits. Simultaneous identical requests share one call.
- **Funding sign.** Positive funding means longs pay shorts. `annualizedFundingPct` assumes today's rate holds for a
  year, which it will not; read it as a scale, not a forecast.
- **DefiLlama CEX entries** (exchange wallet balances) are excluded from per-chain protocol rankings.
- **Not financial advice.** These are snapshots of public data and can be seconds to minutes old.

## Development

```bash
npm run typecheck   # tsc --noEmit over src and tests
npm test            # vitest, all HTTP mocked
npm run build       # compile to dist/
node scripts/smoke.mjs   # live check: starts the built server and calls every tool against the real APIs
```

Layout: `src/sources/*` talk to one API each and return normalised shapes, `src/tools/*` hold the logic and register one
MCP tool each, `src/http.ts` is the shared client (timeout, bounded retries, TTL cache), `src/symbols.ts` normalises
symbols.

## Data sources

[Bybit v5](https://bybit-exchange.github.io/docs/v5/intro) · [Binance spot](https://developers.binance.com/docs/binance-spot-api-docs) and
[USDⓈ-M futures](https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info) ·
[CoinGecko](https://docs.coingecko.com/) · [DefiLlama](https://defillama.com/docs/api). This project is not affiliated
with any of them; respect their terms and rate limits.

## License

MIT
