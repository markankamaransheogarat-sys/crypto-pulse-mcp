import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError, clearCache, getJson } from "../src/http.js";
import { mockFetch, status } from "./helpers.js";

beforeEach(() => {
  clearCache();
  vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("getJson", () => {
  it("returns parsed JSON", async () => {
    mockFetch([["example.test/a", { ok: true }]]);
    await expect(getJson("https://example.test/a")).resolves.toEqual({ ok: true });
  });

  it("serves repeated calls from the cache until the TTL expires", async () => {
    const mock = mockFetch([["example.test/a", { n: 1 }]]);
    await getJson("https://example.test/a", { ttlMs: 1000 });
    await getJson("https://example.test/a", { ttlMs: 1000 });
    expect(mock.calls).toHaveLength(1);

    vi.setSystemTime(Date.now() + 1500);
    await getJson("https://example.test/a", { ttlMs: 1000 });
    expect(mock.calls).toHaveLength(2);
  });

  it("shares one request between simultaneous callers", async () => {
    const mock = mockFetch([["example.test/a", { n: 1 }]]);
    await Promise.all([
      getJson("https://example.test/a", { ttlMs: 1000 }),
      getJson("https://example.test/a", { ttlMs: 1000 }),
      getJson("https://example.test/a", { ttlMs: 1000 }),
    ]);
    expect(mock.calls).toHaveLength(1);
  });

  it("retries on 503 and succeeds", async () => {
    let attempt = 0;
    mockFetch([
      [
        "example.test/flaky",
        () => (++attempt < 3 ? new Response("", { status: 503 }) : new Response('{"ok":true}', { status: 200 })),
      ],
    ]);
    const promise = getJson("https://example.test/flaky", { retries: 2 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ ok: true });
    expect(attempt).toBe(3);
  });

  it("does not retry a 404", async () => {
    const mock = mockFetch([["example.test/missing", status(404)]]);
    await expect(getJson("https://example.test/missing", { retries: 2 })).rejects.toMatchObject({
      name: "HttpError",
      status: 404,
    });
    expect(mock.calls).toHaveLength(1);
  });

  it("reports the host, never the full URL, in errors", async () => {
    mockFetch([["example.test/secret?key=abc", status(500)]]);
    const promise = getJson("https://example.test/secret?key=abc", { retries: 0 });
    await expect(promise).rejects.toBeInstanceOf(HttpError);
    await expect(promise).rejects.toThrow("example.test");
    await expect(promise).rejects.not.toThrow(/key=abc/);
  });

  it("wraps network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const promise = getJson("https://example.test/down", { retries: 0 });
    await expect(promise).rejects.toThrow(/example\.test failed: fetch failed/);
  });
});
