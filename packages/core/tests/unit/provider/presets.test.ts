import { describe, expect, it } from "vitest";
import {
  PROVIDER_PRESETS,
  findPresetById,
  findPresetByBaseUrl,
} from "../../../src/provider/presets.js";

describe("provider presets", () => {
  it("has the expected preset ids", () => {
    const ids = PROVIDER_PRESETS.map((p) => p.id);
    expect(ids).toContain("deepseek");
    expect(ids).toContain("siliconflow");
    expect(ids).toContain("openai");
    expect(ids).toContain("ollama");
    expect(ids).toContain("custom");
  });

  it("findPresetById returns the matching preset", () => {
    expect(findPresetById("deepseek")?.baseUrl).toMatch(/deepseek/);
    expect(findPresetById("nonexistent")).toBeUndefined();
  });

  it("findPresetByBaseUrl matches exact baseUrl", () => {
    expect(findPresetByBaseUrl("https://api.deepseek.com/v1")?.id).toBe("deepseek");
    expect(findPresetByBaseUrl("https://api.openai.com/v1")?.id).toBe("openai");
  });

  it("findPresetByBaseUrl tolerates trailing slash", () => {
    expect(findPresetByBaseUrl("https://api.deepseek.com/v1/")?.id).toBe("deepseek");
  });

  it("findPresetByBaseUrl matches by host when path differs", () => {
    expect(findPresetByBaseUrl("https://api.openai.com/v2")?.id).toBe("openai");
  });

  it("findPresetByBaseUrl returns undefined for unknown URLs", () => {
    expect(findPresetByBaseUrl("https://api.unknown-provider.example/v1")).toBeUndefined();
  });

  it("findPresetByBaseUrl returns undefined for non-URL strings", () => {
    expect(findPresetByBaseUrl("not a url")).toBeUndefined();
  });

  it("custom preset has empty baseUrl and is not matched by URL", () => {
    expect(findPresetById("custom")?.baseUrl).toBe("");
    expect(findPresetByBaseUrl("")).toBeUndefined();
  });
});
