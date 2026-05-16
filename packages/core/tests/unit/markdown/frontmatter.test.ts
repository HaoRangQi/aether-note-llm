import { describe, expect, it } from "vitest";
import {
  deriveTitle,
  parseDocument,
  serializeDocument,
} from "../../../src/markdown/frontmatter.js";

describe("parseDocument", () => {
  it("returns empty frontmatter for plain markdown", () => {
    const r = parseDocument("Just text");
    expect(r.frontmatter).toEqual({});
    expect(r.body).toBe("Just text");
    expect(r.malformed).toBe(false);
  });

  it("parses Aether private fields", () => {
    const raw = `---
aether_id: 01HXY
aether_kind: bookmark
title: Foo
tags: [a, b]
aether_url: https://x.com
---
body`;
    const r = parseDocument(raw);
    expect(r.frontmatter.aether_id).toBe("01HXY");
    expect(r.frontmatter.aether_kind).toBe("bookmark");
    expect(r.frontmatter.tags).toEqual(["a", "b"]);
    expect(r.body).toBe("body");
  });

  it("preserves unknown frontmatter keys", () => {
    const raw = `---
title: X
custom_field: hello
---
text`;
    const r = parseDocument(raw);
    expect(r.frontmatter["custom_field"]).toBe("hello");
  });

  it("flags malformed frontmatter and still returns body", () => {
    const raw = `---
title: [unclosed
---
body line`;
    const r = parseDocument(raw);
    expect(r.malformed).toBe(true);
    expect(r.body).toBe("body line");
  });
});

describe("serializeDocument", () => {
  it("round-trips through parse", () => {
    const raw = `---
aether_id: 01HXY
title: Foo
tags:
  - a
  - b
---
hello`;
    const r = parseDocument(raw);
    const out = serializeDocument(r.frontmatter, r.body);
    const r2 = parseDocument(out);
    expect(r2.frontmatter.aether_id).toBe("01HXY");
    expect(r2.frontmatter.title).toBe("Foo");
    expect(r2.frontmatter.tags).toEqual(["a", "b"]);
    expect(r2.body).toBe("hello");
  });

  it("emits known keys in canonical order", () => {
    const out = serializeDocument({ title: "T", aether_id: "I", aether_kind: "note" }, "body");
    const idIdx = out.indexOf("aether_id");
    const kindIdx = out.indexOf("aether_kind");
    const titleIdx = out.indexOf("title");
    expect(idIdx).toBeLessThan(kindIdx);
    expect(kindIdx).toBeLessThan(titleIdx);
  });

  it("returns body untouched when frontmatter is empty", () => {
    expect(serializeDocument({}, "abc")).toBe("abc");
  });
});

describe("deriveTitle", () => {
  it("prefers frontmatter.title", () => {
    const t = deriveTitle(
      { frontmatter: { title: "FM" }, body: "# H1", malformed: false },
      "note.md",
    );
    expect(t).toBe("FM");
  });

  it("falls back to first H1", () => {
    const t = deriveTitle(
      { frontmatter: {}, body: "# My Heading\nstuff", malformed: false },
      "note.md",
    );
    expect(t).toBe("My Heading");
  });

  it("falls back to filename stem", () => {
    const t = deriveTitle(
      { frontmatter: {}, body: "no heading", malformed: false },
      "Aether Inbox/notes/2026/05/foo-bar.md",
    );
    expect(t).toBe("foo-bar");
  });
});
