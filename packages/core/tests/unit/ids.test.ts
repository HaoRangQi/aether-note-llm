import { describe, expect, it } from "vitest";
import { newUlid, slugify } from "../../src/ids.js";

describe("newUlid", () => {
  it("returns 26-char Crockford base32", () => {
    expect(newUlid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("is monotonic under rapid calls", () => {
    const ids = Array.from({ length: 100 }, () => newUlid());
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]! > ids[i - 1]!).toBe(true);
    }
  });
});

describe("slugify", () => {
  it("lower-cases ASCII and joins with hyphen", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("strips reserved filesystem characters", () => {
    expect(slugify("foo/bar:baz?<>|")).toBe("foobarbaz");
  });

  it("returns 'untitled' for empty / whitespace", () => {
    expect(slugify("   ")).toBe("untitled");
    expect(slugify("")).toBe("untitled");
  });

  it("truncates at maxLen", () => {
    expect(slugify("a".repeat(80), 10)).toBe("a".repeat(10));
  });

  it("preserves Chinese characters", () => {
    expect(slugify("调试 SwiftUI")).toBe("调试-swiftui");
  });
});
