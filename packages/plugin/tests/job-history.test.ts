import { describe, expect, it, vi } from "vitest";
import { appendJobHistory, listJobHistory } from "../src/job-history.js";
import { PluginDataStore } from "../src/plugin-data-store.js";

class DataHost {
  data: unknown = {};

  async loadData(): Promise<unknown> {
    return structuredClone(this.data);
  }

  async saveData(data: unknown): Promise<void> {
    this.data = structuredClone(data);
  }
}

function makePlugin() {
  return { dataStore: new PluginDataStore(new DataHost()) };
}

describe("job history", () => {
  it("redacts copied failure and summary text before persistence", async () => {
    const plugin = makePlugin();

    await appendJobHistory(plugin, {
      kind: "index-refresh",
      title:
        "Refresh https://llm.example.test/v1?token=real-url-token&model=x and https://llm.example.test/callback#access_token=real-fragment-token&id_token=real-id-token&state=kept",
      status: "failed",
      startedAt: 1,
      finishedAt: 2,
      summary: {
        endpoint:
          "https://llm.example.test/app#/auth/callback?api_key=real-query-key&client_secret=real-client-secret&session_token=real-session-token&state=kept",
        "token=real-summary-key": "summary-key-value",
        error: "access_token=real-access-token password=real-password",
      },
      failures: [
        {
          path: "https://llm.example.test/v1?secret=real-secret&model=x",
          title: "Bearer real-title-token",
          message:
            "Request failed with Bearer real-bearer-token refresh_token=real-refresh-token sk-1234567890abcdefghijkl",
        },
      ],
    });

    const text = JSON.stringify(await listJobHistory(plugin));

    expect(text).not.toContain("real-url-token");
    expect(text).not.toContain("real-fragment-token");
    expect(text).not.toContain("real-id-token");
    expect(text).not.toContain("real-query-key");
    expect(text).not.toContain("real-client-secret");
    expect(text).not.toContain("real-session-token");
    expect(text).not.toContain("real-summary-key");
    expect(text).not.toContain("real-access-token");
    expect(text).not.toContain("real-password");
    expect(text).not.toContain("real-secret");
    expect(text).not.toContain("real-title-token");
    expect(text).not.toContain("real-bearer-token");
    expect(text).not.toContain("real-refresh-token");
    expect(text).not.toContain("sk-1234567890abcdefghijkl");
    expect(text).toContain("<redacted>");
    expect(text).toContain("model=x");
    expect(text).toContain("#access_token=<redacted>&id_token=<redacted>&state=kept");
    expect(text).toContain(
      "#/auth/callback?api_key=<redacted>&client_secret=<redacted>&session_token=<redacted>&state=kept",
    );
  });

  it("redacts header-style secrets before recent jobs persist", async () => {
    const plugin = makePlugin();

    await appendJobHistory(plugin, {
      kind: "rebuild",
      title: "Rebuild failed with Proxy-Authorization: Basic real-title-proxy",
      status: "failed",
      startedAt: 1,
      finishedAt: 2,
      summary: {
        error:
          "access-token: real-summary-access refresh-token: real-summary-refresh Cookie: session=real-summary-cookie proxy-authorization=real-summary-proxy",
      },
      failures: [
        {
          title:
            "secret: real-failure-title Set-Cookie: sid=real-title-cookie; HttpOnly cookie=real-title-cookie-kv",
          message:
            "Request failed with X-Api-Key: real-failure-key token: real-failure-token password: real-password Set-Cookie: sid=real-failure-cookie; HttpOnly set-cookie=real-failure-cookie-kv",
        },
      ],
    });

    const text = JSON.stringify(await listJobHistory(plugin));

    expect(text).not.toContain("real-title-proxy");
    expect(text).not.toContain("real-summary-access");
    expect(text).not.toContain("real-summary-refresh");
    expect(text).not.toContain("real-summary-cookie");
    expect(text).not.toContain("real-summary-proxy");
    expect(text).not.toContain("real-failure-title");
    expect(text).not.toContain("real-title-cookie");
    expect(text).not.toContain("real-title-cookie-kv");
    expect(text).not.toContain("real-failure-key");
    expect(text).not.toContain("real-failure-token");
    expect(text).not.toContain("real-failure-cookie");
    expect(text).not.toContain("real-failure-cookie-kv");
    expect(text).not.toContain("real-password");
    expect(text).toContain("Proxy-Authorization: <redacted>");
    expect(text).toContain("Cookie: <redacted>");
    expect(text).toContain("Set-Cookie: <redacted>");
    expect(text).toContain("proxy-authorization=<redacted>");
    expect(text).toContain("cookie=<redacted>");
    expect(text).toContain("set-cookie=<redacted>");
    expect(text).toContain("X-Api-Key: <redacted>");
    expect(text).toContain("access-token: <redacted>");
    expect(text).toContain("refresh-token: <redacted>");
    expect(text).toContain("secret: <redacted>");
  });

  it("redacts header-style secrets from persisted recent jobs when reading", async () => {
    const plugin = makePlugin();
    const dataStore = plugin.dataStore as PluginDataStore;

    await dataStore.update((data) => {
      data.jobHistory = [
        {
          id: "legacy-secret",
          kind: "index-refresh",
          title: "Refresh failed with X-Api-Key: legacy-title-key",
          status: "failed",
          startedAt: 1,
          finishedAt: 2,
          summary: {
            error:
              "access-token: legacy-access-token refresh-token: legacy-refresh-token Cookie: session=legacy-summary-cookie proxy-authorization=legacy-summary-proxy",
            endpoint:
              "https://llm.example.test/app#/auth/callback?api_key=legacy-query-key&client_secret=legacy-client-secret&session_token=legacy-session-token&state=kept",
          },
          failures: [
            {
              title:
                "secret: legacy-title-secret Proxy-Authorization: Basic legacy-title-proxy cookie=legacy-title-cookie-kv",
              message:
                "Retry failed with token: legacy-token password: legacy-password Set-Cookie: sid=legacy-cookie; HttpOnly set-cookie=legacy-cookie-kv https://llm.example.test/callback#access_token=legacy-fragment-token&id_token=legacy-id-token&state=kept",
            },
          ],
        },
      ];
    });

    const text = JSON.stringify(await listJobHistory(plugin));

    expect(text).not.toContain("legacy-title-key");
    expect(text).not.toContain("legacy-access-token");
    expect(text).not.toContain("legacy-refresh-token");
    expect(text).not.toContain("legacy-summary-cookie");
    expect(text).not.toContain("legacy-summary-proxy");
    expect(text).not.toContain("legacy-client-secret");
    expect(text).not.toContain("legacy-query-key");
    expect(text).not.toContain("legacy-session-token");
    expect(text).not.toContain("legacy-title-secret");
    expect(text).not.toContain("legacy-title-proxy");
    expect(text).not.toContain("legacy-title-cookie-kv");
    expect(text).not.toContain("legacy-token");
    expect(text).not.toContain("legacy-password");
    expect(text).not.toContain("legacy-cookie");
    expect(text).not.toContain("legacy-cookie-kv");
    expect(text).not.toContain("legacy-fragment-token");
    expect(text).not.toContain("legacy-id-token");
    expect(text).toContain("X-Api-Key: <redacted>");
    expect(text).toContain("access-token: <redacted>");
    expect(text).toContain("refresh-token: <redacted>");
    expect(text).toContain("Proxy-Authorization: <redacted>");
    expect(text).toContain("Cookie: <redacted>");
    expect(text).toContain("Set-Cookie: <redacted>");
    expect(text).toContain("proxy-authorization=<redacted>");
    expect(text).toContain("cookie=<redacted>");
    expect(text).toContain("set-cookie=<redacted>");
    expect(text).toContain(
      "#/auth/callback?api_key=<redacted>&client_secret=<redacted>&session_token=<redacted>&state=kept",
    );
    expect(text).toContain("#access_token=<redacted>&id_token=<redacted>&state=kept");
    expect(text).toContain("password: <redacted>");
  });

  it("keeps only the newest 20 jobs", async () => {
    const plugin = makePlugin();

    for (let i = 0; i < 25; i += 1) {
      await appendJobHistory(plugin, {
        kind: "rebuild",
        title: `Rebuild ${i}`,
        status: "done",
        startedAt: i,
        finishedAt: i + 1,
        summary: { indexed: i },
        failures: [],
      });
    }

    const history = await listJobHistory(plugin);

    expect(history).toHaveLength(20);
    expect(history[0]?.title).toBe("Rebuild 24");
    expect(history.at(-1)?.title).toBe("Rebuild 5");
  });

  it("keeps only the first 10 failures per job", async () => {
    const plugin = makePlugin();

    await appendJobHistory(plugin, {
      kind: "index-refresh",
      title: "Refresh",
      status: "failed",
      startedAt: 1,
      finishedAt: 2,
      summary: { failed: 12 },
      failures: Array.from({ length: 12 }, (_, i) => ({
        path: `Note ${i}.md`,
        message: `Failure ${i}`,
      })),
    });

    const [job] = await listJobHistory(plugin);

    expect(job?.failures).toHaveLength(10);
    expect(job?.failures[0]?.message).toBe("Failure 0");
    expect(job?.failures.at(-1)?.message).toBe("Failure 9");
  });

  it("drops malformed persisted entries while preserving valid ones", async () => {
    const plugin = makePlugin();
    const dataStore = plugin.dataStore as PluginDataStore;
    await dataStore.update((data) => {
      data.jobHistory = [
        {
          id: "valid",
          kind: "import-write",
          title: "Valid import",
          status: "cancelled",
          startedAt: 1,
          finishedAt: 2,
          summary: { total: 3 },
          failures: [],
        },
        {
          id: "bad-status",
          kind: "import-write",
          title: "Bad status",
          status: "pending",
          startedAt: 1,
          finishedAt: 2,
          summary: {},
          failures: [],
        },
        {
          id: "bad-failures",
          kind: "rebuild",
          title: "Bad failures",
          status: "failed",
          startedAt: 1,
          finishedAt: 2,
          summary: {},
          failures: "not an array",
        },
      ];
    });

    expect(await listJobHistory(plugin)).toEqual([
      {
        id: "valid",
        kind: "import-write",
        title: "Valid import",
        status: "cancelled",
        startedAt: 1,
        finishedAt: 2,
        summary: { total: 3 },
        failures: [],
      },
    ]);
  });

  it("drops non-finite persisted timestamps and summary numbers", async () => {
    const plugin = makePlugin();
    const dataStore = plugin.dataStore as PluginDataStore;
    await dataStore.update((data) => {
      data.jobHistory = [
        {
          id: "valid",
          kind: "rebuild",
          title: "Valid rebuild",
          status: "done",
          startedAt: 1,
          finishedAt: 2,
          summary: {
            indexed: 3,
            ratio: Number.NaN,
            duration: Number.POSITIVE_INFINITY,
          },
          failures: [],
        },
        {
          id: "bad-start",
          kind: "index-refresh",
          title: "Bad start",
          status: "done",
          startedAt: Number.NaN,
          finishedAt: 2,
          summary: {},
          failures: [],
        },
        {
          id: "bad-finish",
          kind: "import-write",
          title: "Bad finish",
          status: "failed",
          startedAt: 1,
          finishedAt: Number.POSITIVE_INFINITY,
          summary: {},
          failures: [],
        },
      ];
    });

    expect(await listJobHistory(plugin)).toEqual([
      {
        id: "valid",
        kind: "rebuild",
        title: "Valid rebuild",
        status: "done",
        startedAt: 1,
        finishedAt: 2,
        summary: {
          indexed: 3,
        },
        failures: [],
      },
    ]);
  });

  it("normalizes negative and fractional summary numbers before they reach recent jobs", async () => {
    const plugin = makePlugin();
    const dataStore = plugin.dataStore as PluginDataStore;
    await dataStore.update((data) => {
      data.jobHistory = [
        {
          id: "persisted",
          kind: "index-refresh",
          title: "Persisted refresh",
          status: "done",
          startedAt: 1,
          finishedAt: 2,
          summary: {
            scanned: 12.9,
            failed: -2,
          },
          failures: [],
        },
      ];
    });

    await appendJobHistory(plugin, {
      kind: "rebuild",
      title: "Appended rebuild",
      status: "done",
      startedAt: 3,
      finishedAt: 4,
      summary: {
        indexed: 7.8,
        failed: -1,
      },
      failures: [],
    });

    expect(await listJobHistory(plugin)).toEqual([
      {
        id: expect.stringMatching(/^rebuild-4-/),
        kind: "rebuild",
        title: "Appended rebuild",
        status: "done",
        startedAt: 3,
        finishedAt: 4,
        summary: {
          indexed: 7,
          failed: 0,
        },
        failures: [],
      },
      {
        id: "persisted",
        kind: "index-refresh",
        title: "Persisted refresh",
        status: "done",
        startedAt: 1,
        finishedAt: 2,
        summary: {
          scanned: 12,
          failed: 0,
        },
        failures: [],
      },
    ]);
  });

  it("skips appending jobs with non-finite timestamps", async () => {
    const plugin = makePlugin();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await appendJobHistory(plugin, {
        kind: "rebuild",
        title: "Valid rebuild",
        status: "done",
        startedAt: 1,
        finishedAt: 2,
        summary: { indexed: 3 },
        failures: [],
      });
      await appendJobHistory(plugin, {
        kind: "index-refresh",
        title: "Bad start",
        status: "done",
        startedAt: Number.NaN,
        finishedAt: 3,
        summary: { scanned: 4 },
        failures: [],
      });
      await appendJobHistory(plugin, {
        kind: "import-write",
        title: "Bad finish",
        status: "failed",
        startedAt: 4,
        finishedAt: Number.POSITIVE_INFINITY,
        summary: { failed: 1 },
        failures: [{ message: "Write failed" }],
      });

      expect(await listJobHistory(plugin)).toEqual([
        {
          id: expect.stringMatching(/^rebuild-2-/),
          kind: "rebuild",
          title: "Valid rebuild",
          status: "done",
          startedAt: 1,
          finishedAt: 2,
          summary: { indexed: 3 },
          failures: [],
        },
      ]);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith(
        "[Aether JobHistory] Skipped job history with invalid timestamps.",
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("rejects reversed timestamp ranges when reading and appending jobs", async () => {
    const plugin = makePlugin();
    const dataStore = plugin.dataStore as PluginDataStore;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await dataStore.update((data) => {
        data.jobHistory = [
          {
            id: "valid",
            kind: "rebuild",
            title: "Valid rebuild",
            status: "done",
            startedAt: 10,
            finishedAt: 12,
            summary: { indexed: 3 },
            failures: [],
          },
          {
            id: "bad-order",
            kind: "index-refresh",
            title: "Bad timestamp order",
            status: "failed",
            startedAt: 15,
            finishedAt: 14,
            summary: { failed: 1 },
            failures: [{ message: "Clock moved backwards" }],
          },
        ];
      });

      expect(await listJobHistory(plugin)).toEqual([
        {
          id: "valid",
          kind: "rebuild",
          title: "Valid rebuild",
          status: "done",
          startedAt: 10,
          finishedAt: 12,
          summary: { indexed: 3 },
          failures: [],
        },
      ]);

      await appendJobHistory(plugin, {
        kind: "import-write",
        title: "Bad append order",
        status: "failed",
        startedAt: 20,
        finishedAt: 19,
        summary: { failed: 1 },
        failures: [{ message: "Clock moved backwards" }],
      });

      expect(await listJobHistory(plugin)).toEqual([
        {
          id: "valid",
          kind: "rebuild",
          title: "Valid rebuild",
          status: "done",
          startedAt: 10,
          finishedAt: 12,
          summary: { indexed: 3 },
          failures: [],
        },
      ]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        "[Aether JobHistory] Skipped job history with invalid timestamps.",
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("clamps long summary keys and values", async () => {
    const plugin = makePlugin();
    const longKey = `key-${"x".repeat(600)}`;
    const longValue = `value-${"y".repeat(600)}`;

    await appendJobHistory(plugin, {
      kind: "rebuild",
      title: "Long summary",
      status: "done",
      startedAt: 1,
      finishedAt: 2,
      summary: {
        [longKey]: longValue,
      },
      failures: [],
    });

    const [job] = await listJobHistory(plugin);
    const [[key, value]] = Object.entries(job?.summary ?? {});

    expect(key).toHaveLength(503);
    expect(key.endsWith("...")).toBe(true);
    expect(value).toHaveLength(503);
    expect(String(value).endsWith("...")).toBe(true);
  });
});
