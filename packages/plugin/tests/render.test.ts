import { describe, expect, it } from "vitest";
import { escapeHtml, highlight } from "../src/ui/render.js";

describe("render helpers", () => {
  it("escapes html text", () => {
    expect(escapeHtml(`<script data-x="1">it's</script>`)).toBe(
      "&lt;script data-x=&quot;1&quot;&gt;it&#39;s&lt;/script&gt;",
    );
  });

  it("highlights multiple query terms independently", () => {
    expect(highlight("OpenAI embeddings search", "openai search")).toBe(
      '<mark class="aether-hit">OpenAI</mark> embeddings <mark class="aether-hit">search</mark>',
    );
  });

  it("escapes html before wrapping matched text", () => {
    expect(highlight("<OpenAI> & embeddings", "openai embeddings")).toBe(
      '&lt;<mark class="aether-hit">OpenAI</mark>&gt; &amp; <mark class="aether-hit">embeddings</mark>',
    );
  });

  it("treats regex syntax as literal query text", () => {
    expect(highlight("Use model gpt-4.1?", "gpt-4.1?")).toBe(
      'Use model <mark class="aether-hit">gpt-4.1?</mark>',
    );
  });

  it("deduplicates terms case-insensitively", () => {
    expect(highlight("alpha ALPHA beta", "alpha ALPHA")).toBe(
      '<mark class="aether-hit">alpha</mark> <mark class="aether-hit">ALPHA</mark> beta',
    );
  });
});
