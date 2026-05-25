import { describe, expect, it } from "vitest";
import type { SearchAnswerResponse } from "@aether/core";
import { formatAnswerWithSources } from "../src/ui/answer-sources.js";

function baseAnswer(patch: Partial<SearchAnswerResponse> = {}): SearchAnswerResponse {
  return {
    question: "state",
    answer: "Use stable identity. [1]",
    citations: [],
    citationCheck: {
      referencedIndexes: [1],
      invalidIndexes: [],
      unusedIndexes: [],
      hasAnyReference: true,
    },
    contextTokenCount: 42,
    contextTruncated: false,
    search: {
      hits: [],
      meta: { mode: "bm25", alpha: 1, staleRatio: 0, fallbackReason: null },
    },
    ...patch,
  };
}

describe("answer sources", () => {
  it("formats answer text with citation evidence", () => {
    const text = formatAnswerWithSources(
      baseAnswer({
        citations: [
          {
            index: 1,
            noteId: "n1",
            vaultPath: "notes/swiftui.md",
            title: "SwiftUI",
            headingPath: "Identity",
            excerpt: "State is lost when identity changes.",
            url: null,
            tokenCount: 12,
            truncated: false,
          },
        ],
      }),
    );

    expect(text).toContain("Use stable identity. [1]");
    expect(text).toContain("Sources:");
    expect(text).toContain("[1] SwiftUI");
    expect(text).toContain("Path: notes/swiftui.md");
    expect(text).toContain("Heading: Identity");
    expect(text).toContain("URL: -");
    expect(text).toContain("Excerpt: State is lost when identity changes.");
  });

  it("marks truncated context and keeps empty headings stable", () => {
    const text = formatAnswerWithSources(
      baseAnswer({
        citations: [
          {
            index: 2,
            noteId: "n2",
            vaultPath: "bookmarks/ai.md",
            title: "AI Bookmark",
            headingPath: "",
            excerpt: "Long source excerpt.",
            url: "https://example.com/ai",
            tokenCount: 5,
            truncated: true,
          },
        ],
      }),
    );

    expect(text).toContain("Heading: -");
    expect(text).toContain("URL: https://example.com/ai");
    expect(text).toContain("Note: excerpt was trimmed to fit the context budget.");
  });
});
