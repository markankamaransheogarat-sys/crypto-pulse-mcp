import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { binancePerp } from "../sources/binance.js";
import { bybitPerp } from "../sources/bybit.js";
import { parseSymbol } from "../symbols.js";
import { pctChange, round, settle } from "../util.js";
import { READ_ONLY, respond } from "./result.js";

export async function getDerivatives(input: string) {
  const symbol = parseSymbol(input);
  const errors: string[] = [];

  const [bybitResult, binanceResult] = await Promise.allSettled([bybitPerp(symbol.pair), binancePerp(symbol.pair)]);
  const bybit = settle("bybit", bybitResult, errors);
  const binance = settle("binance", binanceResult, errors);

  if (!bybit && !binance) {
    throw new Error(
      errors.length > 0
        ? `No perpetual data for ${symbol.pair}. ${errors.join("; ")}`
        : `${symbol.pair} has no perpetual contract on Bybit or Binance.`,
    );
  }

  return {
    symbol: symbol.pair,
    bybit: bybit && {
      markPrice: bybit.markPrice,
      indexPrice: bybit.indexPrice,
      // Mark vs index: positive means the perp trades at a premium to spot.
      basisPct: round(pctChange(bybit.markPrice, bybit.indexPrice), 4),
      fundingRatePct: round(bybit.fundingRate === null ? null : bybit.fundingRate * 100, 5),
      fundingIntervalHours: bybit.fundingIntervalHours,
      // Funding paid per year if the current rate stayed unchanged. Positive: longs pay shorts.
      annualizedFundingPct:
        bybit.fundingRate !== null && bybit.fundingIntervalHours
          ? round(bybit.fundingRate * (24 / bybit.fundingIntervalHours) * 365 * 100, 2)
          : null,
      nextFundingTime: bybit.nextFundingTime,
      openInterestUsd: round(bybit.openInterestUsd, 0),
      volume24hUsd: round(bybit.volume24hUsd, 0),
      // How many days of the last-24h volume the open interest equals.
      openInterestToVolume:
        bybit.openInterestUsd && bybit.volume24hUsd ? round(bybit.openInterestUsd / bybit.volume24hUsd, 3) : null,
    },
    binance: binance && {
      markPrice: binance.markPrice,
      indexPrice: binance.indexPrice,
      basisPct: round(pctChange(binance.markPrice, binance.indexPrice), 4),
      lastFundingRatePct: round(binance.fundingRate === null ? null : binance.fundingRate * 100, 5),
      nextFundingTime: binance.nextFundingTime,
    },
    notes: [
      "Funding rates are per funding interval; a positive rate means longs pay shorts.",
      "Annualised funding assumes the current rate stays unchanged for a full year; real funding moves every interval.",
    ],
    ...(errors.length > 0 ? { errors } : {}),
    asOf: new Date().toISOString(),
  };
}

export function registerDerivatives(server: McpServer): void {
  server.registerTool(
    "get_derivatives",
    {
      title: "Perpetual funding and open interest",
      description:
        "Perpetual-futures data for a coin: funding rate (and annualised), mark vs index price (basis), open interest in USD and its ratio to 24h volume on Bybit, plus Binance's mark price and latest funding rate. Useful for judging crowding and leverage.",
      inputSchema: {
        symbol: z.string().min(2).max(24).describe("Coin or pair, e.g. BTC, ETHUSDT. A bare coin means a USDT perpetual"),
      },
      annotations: READ_ONLY,
    },
    ({ symbol }) => respond(() => getDerivatives(symbol)),
  );
}
