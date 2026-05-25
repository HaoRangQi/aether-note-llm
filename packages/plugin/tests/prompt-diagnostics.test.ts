import { describe, expect, it } from "vitest";
import { analyzePromptVariables } from "../src/ui/prompt-diagnostics.js";

describe("prompt diagnostics", () => {
  it("reports used, missing, and unused prompt variables", () => {
    expect(analyzePromptVariables("Summarize {{ selection }} as {{tone}}.", ["selection"])).toEqual(
      {
        used: ["selection", "tone"],
        available: ["selection"],
        missing: ["tone"],
        unusedAvailable: [],
      },
    );
  });

  it("deduplicates available variables and keeps unused variables visible", () => {
    expect(
      analyzePromptVariables("Rewrite {{selection}}", [" selection ", "selection", "locale"]),
    ).toEqual({
      used: ["selection"],
      available: ["selection", "locale"],
      missing: [],
      unusedAvailable: ["locale"],
    });
  });

  it("accepts runtime variables without showing them as unused insertion variables", () => {
    expect(
      analyzePromptVariables(
        "Use {{selection}} at {{temperature}}",
        ["selection"],
        ["temperature"],
      ),
    ).toEqual({
      used: ["selection", "temperature"],
      available: ["selection"],
      missing: [],
      unusedAvailable: [],
    });
  });
});
