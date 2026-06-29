import { describe, it, expect, vi, afterEach } from "vitest";

// Mock config so importing discord.ts doesn't require real env vars
vi.mock("../config.js", () => ({
  config: {
    discord: {
      guildId: "guild123",
      botToken: "test-token",
      apiBaseUrl: "https://discord.com/api/v10",
    },
    api: {
      maxRetries: 3,
      retryDelayMs: 1000,
    },
  },
}));

import {
  fetchGuildName,
  fetchChannelName,
  fetchScheduledEvents,
  parseRetryAfterMs,
} from "./discord.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("discord fetch client", () => {
  it("returns parsed JSON on a successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: "1" }, { id: "2" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const events = await fetchScheduledEvents("guild123");

    expect(events).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://discord.com/api/v10/guilds/guild123/scheduled-events",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bot test-token" }),
      }),
    );
  });

  it("retries after a 429, honoring retry-after, then succeeds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (name: string) => (name === "retry-after" ? "1" : null) },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "guild-x", name: "Rate Limited Guild" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchGuildName("guild-x");
    await vi.runAllTimersAsync();
    const name = await promise;

    expect(name).toBe("Rate Limited Guild");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws on a non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: { get: () => null },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchChannelName("chan-404")).rejects.toThrow(/404/);
  });

  it("throws after exhausting retries on a persistent 429", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => "0" },
    });
    vi.stubGlobal("fetch", fetchMock);

    const settled = fetchScheduledEvents("guild-429").catch((err) => err);
    await vi.runAllTimersAsync();
    const result = await settled;

    expect(result).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(3); // config.api.maxRetries
  });
});

describe("parseRetryAfterMs", () => {
  it("uses delta-seconds when the header is numeric", () => {
    expect(parseRetryAfterMs("2")).toBe(2000);
  });

  it("falls back to the default delay on a missing or non-numeric header", () => {
    // null, an HTTP-date, and a negative value all fall back rather than
    // producing NaN/0 (which would spin the retry loop with no backoff).
    expect(parseRetryAfterMs(null)).toBe(1000);
    expect(parseRetryAfterMs("Wed, 21 Oct 2025 07:28:00 GMT")).toBe(1000);
    expect(parseRetryAfterMs("-5")).toBe(1000);
  });

  it("clamps an absurdly large delay", () => {
    expect(parseRetryAfterMs("100000")).toBe(60000);
  });
});
