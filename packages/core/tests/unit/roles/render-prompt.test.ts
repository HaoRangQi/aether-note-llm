import { describe, expect, it } from "vitest";
import {
  renderPrompt,
  extractVariables,
  findMissingPromptVariables,
} from "../../../src/roles/render-prompt.js";

describe("renderPrompt", () => {
  it("substitutes simple {{var}}", () => {
    expect(renderPrompt("hi {{name}}", { name: "world" })).toBe("hi world");
  });

  it("tolerates whitespace inside braces", () => {
    expect(renderPrompt("a {{ x }} b", { x: "X" })).toBe("a X b");
  });

  it("replaces missing vars with empty string", () => {
    expect(renderPrompt("a {{missing}} b", {})).toBe("a  b");
  });

  it("keeps unknown text intact", () => {
    expect(renderPrompt("plain text", { x: "y" })).toBe("plain text");
  });

  it("supports number values", () => {
    expect(renderPrompt("limit={{n}}", { n: 5 })).toBe("limit=5");
  });
});

describe("extractVariables", () => {
  it("returns names in first-occurrence order", () => {
    expect(extractVariables("{{a}} {{b}} {{a}}")).toEqual(["a", "b"]);
  });

  it("returns empty for no variables", () => {
    expect(extractVariables("nothing here")).toEqual([]);
  });
});

describe("findMissingPromptVariables", () => {
  it("deduplicates repeated missing variables", () => {
    expect(findMissingPromptVariables("{{topic}} {{topic}} {{summary}}", {})).toEqual([
      "topic",
      "summary",
    ]);
  });

  it("does not return provided variables", () => {
    expect(findMissingPromptVariables("{{name}} {{task}}", { name: "Ada" })).toEqual(["task"]);
  });

  it("supports underscores and numbers in variable names", () => {
    expect(findMissingPromptVariables("{{role_1}} {{_context2}}", { role_1: "writer" })).toEqual([
      "_context2",
    ]);
  });

  it("returns empty when no variables are missing", () => {
    expect(findMissingPromptVariables("{{name}} {{count}}", { name: "Ada", count: 2 })).toEqual([]);
  });
});
