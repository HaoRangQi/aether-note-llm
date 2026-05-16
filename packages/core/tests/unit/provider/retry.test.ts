import { describe, expect, it } from "vitest";
import { AetherError } from "../../../src/errors.js";
import {
  defaultShouldRetry,
  isRetriableHttpStatus,
  withRetry,
} from "../../../src/provider/retry.js";

describe("isRetriableHttpStatus", () => {
  it("retries 429 / 5xx / 408", () => {
    expect(isRetriableHttpStatus(429)).toBe(true);
    expect(isRetriableHttpStatus(500)).toBe(true);
    expect(isRetriableHttpStatus(503)).toBe(true);
    expect(isRetriableHttpStatus(408)).toBe(true);
  });

  it("does not retry 4xx (except 408/429)", () => {
    expect(isRetriableHttpStatus(400)).toBe(false);
    expect(isRetriableHttpStatus(401)).toBe(false);
    expect(isRetriableHttpStatus(404)).toBe(false);
  });
});

describe("defaultShouldRetry", () => {
  it("retries PROVIDER_HTTP_ERROR with retriable status", () => {
    const err = new AetherError("PROVIDER_HTTP_ERROR", "x", { status: 500 });
    expect(defaultShouldRetry(err)).toBe(true);
  });

  it("does not retry 401", () => {
    const err = new AetherError("PROVIDER_HTTP_ERROR", "x", { status: 401 });
    expect(defaultShouldRetry(err)).toBe(false);
  });

  it("retries TypeError (network failure)", () => {
    expect(defaultShouldRetry(new TypeError("fetch failed"))).toBe(true);
  });
});

describe("withRetry", () => {
  it("returns first success without retry", async () => {
    let n = 0;
    const v = await withRetry(
      async () => {
        n++;
        return "ok";
      },
      { sleep: async () => {} },
    );
    expect(v).toBe("ok");
    expect(n).toBe(1);
  });

  it("retries retriable failures up to maxAttempts", async () => {
    let n = 0;
    const result = await withRetry(
      async () => {
        n++;
        if (n < 3) throw new AetherError("PROVIDER_HTTP_ERROR", "x", { status: 500 });
        return "ok";
      },
      { maxAttempts: 3, sleep: async () => {} },
    );
    expect(result).toBe("ok");
    expect(n).toBe(3);
  });

  it("throws when retries exhausted", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new AetherError("PROVIDER_HTTP_ERROR", "x", { status: 500 });
        },
        { maxAttempts: 2, sleep: async () => {} },
      ),
    ).rejects.toBeInstanceOf(AetherError);
    expect(n).toBe(2);
  });

  it("does not retry non-retriable errors", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new AetherError("PROVIDER_HTTP_ERROR", "x", { status: 401 });
        },
        { maxAttempts: 5, sleep: async () => {} },
      ),
    ).rejects.toBeInstanceOf(AetherError);
    expect(n).toBe(1);
  });
});
