import { describe, expect, it } from "vitest";
import { createDiagnosticsReport, redactDiagnosticsValue } from "../src/diagnostics-report.js";

describe("diagnostics report redaction", () => {
  it("redacts settings api keys, provider headers, URL secrets, and job failure text", () => {
    const report = createDiagnosticsReport({
      pluginVersion: "0.3.0",
      obsidianApi: "1.6.0",
      indexCount: 1,
      chunkCount: 2,
      pendingInbox: 0,
      settings: {
        providers: [
          {
            id: "p1",
            name: "Private",
            baseUrl: "https://llm.example.test/v1?api_key=real-query-key&model=x",
            apiKeyRef: "key:p1",
            defaultHeaders: {
              Authorization: "Bearer real-header-token",
              "X-Api-Key": "real-header-key",
              "X-Team": "notes",
            },
          },
        ],
        apiKeys: {
          "key:p1": "real-settings-key",
        },
      },
      recentJobs: [
        {
          kind: "index-refresh",
          summary: {
            scanned: 3,
            refreshed: 1,
            removed: 1,
            "token=real-summary-key": "summary key should be redacted",
            endpoint:
              "Request to https://llm.example.test/v1?token=real-inline-token&model=x failed",
          },
          failures: [],
        },
        {
          failures: [
            {
              message:
                "Request failed with Bearer real-error-token and api_key=real-error-key and sk-1234567890abcdefghijkl",
            },
          ],
        },
      ],
      usage: {
        perFeature: {},
      },
    });

    const text = JSON.stringify(report);
    expect(text).not.toContain("real-query-key");
    expect(text).not.toContain("real-header-token");
    expect(text).not.toContain("real-header-key");
    expect(text).not.toContain("real-settings-key");
    expect(text).not.toContain("real-summary-key");
    expect(text).not.toContain("real-inline-token");
    expect(text).not.toContain("real-error-token");
    expect(text).not.toContain("real-error-key");
    expect(text).not.toContain("sk-1234567890abcdefghijkl");
    expect(text).toContain("<redacted>");
    expect(text).toContain("notes");
    expect(text).toContain("index-refresh");
    expect(text).toContain("refreshed");
  });

  it("redacts sensitive object keys recursively without dropping non-sensitive diagnostics", () => {
    expect(
      redactDiagnosticsValue({
        nested: {
          accessToken: "abc",
          password: "def",
          "token=inline-key": "ghi",
          safeCount: 3,
        },
      }),
    ).toEqual({
      nested: {
        accessToken: "<redacted>",
        password: "<redacted>",
        "token=<redacted>": "ghi",
        safeCount: 3,
      },
    });
  });

  it("redacts hyphenated access and refresh token URL query params", () => {
    const report = redactDiagnosticsValue({
      providerUrl:
        "https://llm.example.test/v1?access-token=real-access-token&refresh-token=real-refresh-token&session_token=real-session-token&tenant_secret=real-tenant-secret&model=x",
      recentJobs: [
        {
          failures: [
            {
              message:
                "Retry https://llm.example.test/v1?access-token=job-access-token&refresh-token=job-refresh-token&session_token=job-session-token failed with auth-token: job-auth-token and tenant_secret=job-tenant-secret",
            },
          ],
        },
      ],
    });

    const text = JSON.stringify(report);
    expect(text).not.toContain("real-access-token");
    expect(text).not.toContain("real-refresh-token");
    expect(text).not.toContain("real-session-token");
    expect(text).not.toContain("real-tenant-secret");
    expect(text).not.toContain("job-access-token");
    expect(text).not.toContain("job-refresh-token");
    expect(text).not.toContain("job-session-token");
    expect(text).not.toContain("job-auth-token");
    expect(text).not.toContain("job-tenant-secret");
    expect(text).toContain("access-token=<redacted>");
    expect(text).toContain("refresh-token=<redacted>");
    expect(text).toContain("session_token=<redacted>");
    expect(text).toContain("tenant_secret=<redacted>");
    expect(text).toContain("auth-token: <redacted>");
    expect(text).toContain("model=x");
  });

  it("redacts URL userinfo credentials while preserving non-sensitive URL context", () => {
    const report = redactDiagnosticsValue({
      providerUrl: "https://real-user:real-password@llm.example.test/v1?model=x",
      recentJobs: [
        {
          failures: [
            {
              message: "Retry https://job-user:job-password@llm.example.test/v1?model=y failed",
            },
          ],
        },
      ],
    });

    const text = JSON.stringify(report);
    expect(text).not.toContain("real-user");
    expect(text).not.toContain("real-password");
    expect(text).not.toContain("job-user");
    expect(text).not.toContain("job-password");
    expect(text).toContain("https://<redacted>:<redacted>@llm.example.test/v1?model=x");
    expect(text).toContain("https://<redacted>:<redacted>@llm.example.test/v1?model=y");
  });

  it("redacts OAuth token fragments and id token text", () => {
    const report = redactDiagnosticsValue({
      callbackUrl:
        "https://llm.example.test/callback#access_token=real-access-token&id_token=real-id-token&client_secret=real-client-secret&state=kept",
      callbackHashRoute:
        "https://llm.example.test/app#/auth/callback?access_token=route-access-token&id_token=route-id-token&client_secret=route-client-secret&state=kept",
      recentJobs: [
        {
          failures: [
            {
              message:
                "Callback failed with id_token=job-id-token, client_secret=job-client-secret, id-token: job-header-token, and client-secret: job-header-secret",
            },
          ],
        },
      ],
    });

    const text = JSON.stringify(report);
    expect(text).not.toContain("real-access-token");
    expect(text).not.toContain("real-id-token");
    expect(text).not.toContain("real-client-secret");
    expect(text).not.toContain("route-access-token");
    expect(text).not.toContain("route-id-token");
    expect(text).not.toContain("route-client-secret");
    expect(text).not.toContain("job-id-token");
    expect(text).not.toContain("job-client-secret");
    expect(text).not.toContain("job-header-token");
    expect(text).not.toContain("job-header-secret");
    expect(text).toContain(
      "#access_token=<redacted>&id_token=<redacted>&client_secret=<redacted>&state=kept",
    );
    expect(text).toContain(
      "#/auth/callback?access_token=<redacted>&id_token=<redacted>&client_secret=<redacted>&state=kept",
    );
    expect(text).toContain("id_token=<redacted>");
    expect(text).toContain("client_secret=<redacted>");
    expect(text).toContain("id-token: <redacted>");
    expect(text).toContain("client-secret: <redacted>");
  });

  it("redacts sensitive header-style text in diagnostics strings", () => {
    const report = redactDiagnosticsValue({
      providerError:
        "Request failed with Authorization: Basic real-auth-token, Proxy-Authorization: Basic real-proxy-token, Cookie: session=real-cookie; theme=dark, Set-Cookie: sid=real-set-cookie; HttpOnly, proxy-authorization=real-proxy-kv cookie=real-cookie-kv set-cookie=real-set-cookie-kv, X-Api-Key: real-header-key, access-token: real-access-token; refresh-token: real-refresh-token and token: real-token",
      recentJobs: [
        {
          failures: [
            {
              message: "Retry failed because secret: real-secret password: real-password",
            },
          ],
        },
      ],
    });

    const text = JSON.stringify(report);
    expect(text).not.toContain("real-auth-token");
    expect(text).not.toContain("real-proxy-token");
    expect(text).not.toContain("real-cookie");
    expect(text).not.toContain("real-set-cookie");
    expect(text).not.toContain("real-proxy-kv");
    expect(text).not.toContain("real-cookie-kv");
    expect(text).not.toContain("real-set-cookie-kv");
    expect(text).not.toContain("real-header-key");
    expect(text).not.toContain("real-access-token");
    expect(text).not.toContain("real-refresh-token");
    expect(text).not.toContain("real-token");
    expect(text).not.toContain("real-secret");
    expect(text).not.toContain("real-password");
    expect(text).toContain("Authorization: <redacted>");
    expect(text).toContain("Proxy-Authorization: <redacted>");
    expect(text).toContain("Cookie: <redacted>");
    expect(text).toContain("Set-Cookie: <redacted>");
    expect(text).toContain("proxy-authorization=<redacted>");
    expect(text).toContain("cookie=<redacted>");
    expect(text).toContain("set-cookie=<redacted>");
    expect(text).toContain("X-Api-Key: <redacted>");
    expect(text).toContain("access-token: <redacted>");
    expect(text).toContain("refresh-token: <redacted>");
    expect(text).toContain("Retry failed");
  });

  it("normalizes non-finite diagnostic numbers before JSON export", () => {
    expect(
      redactDiagnosticsValue({
        indexCount: 3,
        usage: {
          monthTotal: {
            promptTokens: Number.NaN,
            completionTokens: Number.POSITIVE_INFINITY,
          },
          perFeature: {
            answer: {
              promptTokens: 12,
              completionTokens: Number.NEGATIVE_INFINITY,
            },
          },
        },
      }),
    ).toEqual({
      indexCount: 3,
      usage: {
        monthTotal: {
          promptTokens: null,
          completionTokens: null,
        },
        perFeature: {
          answer: {
            promptTokens: 12,
            completionTokens: null,
          },
        },
      },
    });
  });

  it("normalizes non-JSON diagnostic values before export", () => {
    const circular: Record<string, unknown> = {
      safe: "kept",
    };
    const shared = { count: 2 };
    circular.self = circular;

    const report = redactDiagnosticsValue({
      bigintValue: BigInt(123),
      symbolValue: Symbol("diagnostic"),
      functionValue: () => "hidden",
      missingValue: undefined,
      circular,
      firstShared: shared,
      secondShared: shared,
      list: [BigInt(456), undefined, "ok"],
    });

    expect(report).toEqual({
      bigintValue: null,
      symbolValue: null,
      functionValue: null,
      missingValue: null,
      circular: {
        safe: "kept",
        self: "[Circular]",
      },
      firstShared: { count: 2 },
      secondShared: { count: 2 },
      list: [null, null, "ok"],
    });
    expect(() => JSON.stringify(report)).not.toThrow();
  });
});
