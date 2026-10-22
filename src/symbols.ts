const KNOWN_QUOTES = ["USDT", "USDC", "FDUSD", "USD", "BTC", "ETH"] as const;

export interface ParsedSymbol {
  base: string;
  quote: string;
  /** Exchange-style pair, e.g. BTCUSDT. */
  pair: string;
}

/**
 * Accepts "btc", "BTC/USDT", "eth-usdc", "SOLUSDT" and returns a normalised pair.
 * A bare base asset defaults to a USDT quote.
 */
export function parseSymbol(input: string): ParsedSymbol {
  const cleaned = input.trim().toUpperCase();
  if (!cleaned) throw new Error("Symbol is empty.");

  const parts = cleaned.split(/[\s/_-]+/).filter(Boolean);
  let base: string;
  let quote: string;

  if (parts.length >= 2) {
    base = parts[0] as string;
    quote = parts[1] as string;
  } else {
    const single = parts[0] as string;
    const suffix = KNOWN_QUOTES.find((q) => single.length > q.length + 1 && single.endsWith(q));
    if (suffix) {
      base = single.slice(0, -suffix.length);
      quote = suffix;
    } else {
      base = single;
      quote = "USDT";
    }
  }

  if (!/^[A-Z0-9]{2,15}$/.test(base) || !/^[A-Z0-9]{2,10}$/.test(quote)) {
    throw new Error(`"${input}" is not a valid symbol. Use something like BTC, ETH/USDT or SOLUSDT.`);
  }
  return { base, quote, pair: `${base}${quote}` };
}
