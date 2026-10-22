import { vi } from "vitest";

type Route = unknown | ((url: string) => Response | Promise<Response>);

export interface FetchMock {
  calls: string[];
  restore(): void;
}

/**
 * Replaces global fetch. Routes are matched by URL substring, first match wins.
 * A route is either a JSON-serialisable value (answered with 200) or a function returning a Response.
 */
export function mockFetch(routes: Array<[string, Route]>): FetchMock {
  const calls: string[] = [];
  const impl = async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    for (const [needle, route] of routes) {
      if (!url.includes(needle)) continue;
      if (typeof route === "function") return (route as (u: string) => Response | Promise<Response>)(url);
      return new Response(JSON.stringify(route), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("not mocked", { status: 599 });
  };
  vi.stubGlobal("fetch", vi.fn(impl));
  return { calls, restore: () => vi.unstubAllGlobals() };
}

export const status = (code: number, body = "") => () => new Response(body, { status: code });

export const bybitTicker = (list: Array<Record<string, string>>) => ({
  retCode: 0,
  retMsg: "OK",
  result: { list },
});
