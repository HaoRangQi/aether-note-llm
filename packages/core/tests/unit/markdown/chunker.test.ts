import { describe, expect, it } from "vitest";
import { chunkMarkdown, chunkPlain } from "../../../src/markdown/chunker.js";

describe("chunkMarkdown", () => {
  it("returns empty array for empty input", () => {
    expect(chunkMarkdown("")).toEqual([]);
  });

  it("creates one chunk for a tiny no-heading note", () => {
    const c = chunkMarkdown("hello world");
    expect(c).toHaveLength(1);
    expect(c[0]?.headingPath).toBe("");
    expect(c[0]?.content).toBe("hello world");
    expect(c[0]?.ordinal).toBe(0);
  });

  it("uses heading path with separator", () => {
    const md = `# Top

para A

## Sub

para B`;
    const c = chunkMarkdown(md);
    expect(c).toHaveLength(2);
    expect(c[0]?.headingPath).toBe("Top");
    expect(c[0]?.content).toContain("para A");
    expect(c[1]?.headingPath).toBe("Top > Sub");
    expect(c[1]?.content).toContain("para B");
  });

  it("retracts heading path when depth decreases", () => {
    const md = `# A
x
## B
y
# C
z`;
    const c = chunkMarkdown(md);
    const paths = c.map((x) => x.headingPath);
    expect(paths).toEqual(["A", "A > B", "C"]);
  });

  it("splits long sections at paragraph boundaries", () => {
    const long = "para. ".repeat(400); // ~2400 chars
    const md = `# H\n\n${long}\n\n${long}`;
    const c = chunkMarkdown(md);
    expect(c.length).toBeGreaterThan(1);
    for (const ch of c) expect(ch.content.length).toBeLessThanOrEqual(3500);
  });

  it("approxTokens is a positive integer", () => {
    const c = chunkMarkdown("# h\n\nhello world");
    expect(c[0]?.approxTokens).toBeGreaterThan(0);
    expect(Number.isInteger(c[0]?.approxTokens)).toBe(true);
  });

  it("ordinals are 0-based and strictly increasing", () => {
    const md = `# A\nx\n# B\ny\n# C\nz`;
    const c = chunkMarkdown(md);
    expect(c.map((x) => x.ordinal)).toEqual([0, 1, 2]);
  });
});

describe("chunkPlain", () => {
  it("returns empty for empty input", () => {
    expect(chunkPlain("")).toEqual([]);
  });

  it("creates one chunk for short text", () => {
    const c = chunkPlain("abc");
    expect(c).toHaveLength(1);
    expect(c[0]?.headingPath).toBe("");
  });
});
