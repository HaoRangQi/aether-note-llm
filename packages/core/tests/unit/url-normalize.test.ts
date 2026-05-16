import { describe, expect, it } from "vitest";
import { normalizeUrl } from "../../src/url-normalize.js";

describe("normalizeUrl", () => {
  it("lower-cases scheme & host but preserves path case", () => {
    expect(normalizeUrl("HTTPS://Example.COM/Path")).toBe("https://example.com/Path");
  });

  it("strips fragment", () => {
    expect(normalizeUrl("https://x.com/a#top")).toBe("https://x.com/a");
  });

  it("removes UTM tracking parameters", () => {
    expect(normalizeUrl("https://x.com/a?utm_source=foo&keep=1")).toBe("https://x.com/a?keep=1");
  });

  it("removes fbclid", () => {
    expect(normalizeUrl("https://x.com/?fbclid=abc")).toBe("https://x.com/");
  });

  it("drops trailing slash on path", () => {
    expect(normalizeUrl("https://x.com/a/")).toBe("https://x.com/a");
  });

  it("keeps trailing slash on bare host", () => {
    expect(normalizeUrl("https://x.com/")).toBe("https://x.com/");
  });

  it("returns input on invalid URL", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });
});
