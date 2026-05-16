import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/hash.js";

describe("sha256Hex", () => {
  it("matches RFC vector for empty string", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches RFC vector for 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic", async () => {
    expect(await sha256Hex("hello")).toBe(await sha256Hex("hello"));
  });
});
