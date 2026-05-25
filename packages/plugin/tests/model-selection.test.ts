import { describe, expect, it } from "vitest";
import { chooseModelForUse, mergeModels, modelLooksCompatible } from "../src/ui/model-selection.js";

describe("model selection", () => {
  it("merges live and fallback models without blanks or duplicates", () => {
    expect(mergeModels([" chat ", "", "embed", "chat"], ["embed", "fallback"])).toEqual([
      "chat",
      "embed",
      "fallback",
    ]);
  });

  it("prefers non-embedding models for chat roles", () => {
    expect(chooseModelForUse(["text-embedding-3-small", "gpt-4o-mini"], undefined, "chat")).toBe(
      "gpt-4o-mini",
    );
  });

  it("does not choose an embedding model for chat roles", () => {
    expect(chooseModelForUse(["BAAI/bge-m3"], undefined, "chat")).toBe("");
  });

  it("prefers embedding models for embedding roles", () => {
    expect(chooseModelForUse(["deepseek-chat", "BAAI/bge-m3"], undefined, "embedding")).toBe(
      "BAAI/bge-m3",
    );
  });

  it("does not choose a chat-looking model for embedding roles", () => {
    expect(chooseModelForUse(["deepseek-chat"], undefined, "embedding")).toBe("");
  });

  it("can choose unclassified embedding models for custom providers", () => {
    expect(
      chooseModelForUse(["private-vector-v1"], undefined, "embedding", {
        allowUnclassifiedEmbedding: true,
      }),
    ).toBe("private-vector-v1");
  });

  it("reports model compatibility by intended use", () => {
    expect(modelLooksCompatible("BAAI/bge-m3", "embedding")).toBe(true);
    expect(modelLooksCompatible("deepseek-chat", "embedding")).toBe(false);
    expect(modelLooksCompatible("text-embedding-3-small", "chat")).toBe(false);
    expect(modelLooksCompatible("BAAI/bge-m3", "chat")).toBe(false);
  });
});
