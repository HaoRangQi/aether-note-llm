import { describe, expect, it } from "vitest";
import { AetherError, isAetherError } from "../../src/errors.js";

describe("AetherError", () => {
  it("carries code and message", () => {
    const err = new AetherError("PARSE_ERROR", "bad yaml");
    expect(err.code).toBe("PARSE_ERROR");
    expect(err.message).toBe("bad yaml");
    expect(err.name).toBe("AetherError");
  });

  it("preserves cause when provided", () => {
    const root = new Error("io");
    const err = new AetherError("INDEX_CORRUPT", "wrapped", root);
    expect(err.cause).toBe(root);
  });

  it("isAetherError narrows correctly", () => {
    const err: unknown = new AetherError("ABORTED", "x");
    expect(isAetherError(err)).toBe(true);
    expect(isAetherError(new Error("plain"))).toBe(false);
  });
});
