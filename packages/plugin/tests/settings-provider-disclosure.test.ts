import { describe, expect, it, vi } from "vitest";
import { migrateSettings } from "@aether/core";
import { FakeElement } from "./fixtures/obsidian.js";
import { AetherSettingsTab } from "../src/settings-tab.js";

describe("settings provider disclosure", () => {
  it("opens a newly added provider card and shows an explicit disclosure icon", async () => {
    let current = migrateSettings({});
    const plugin = {
      core: {
        settings: {
          get current() {
            return current;
          },
          save: vi.fn(async (next: typeof current) => {
            current = structuredClone(next);
          }),
        },
        applySettings: vi.fn((next: typeof current) => {
          current = structuredClone(next);
        }),
      },
    };
    const tab = new AetherSettingsTab({} as never, plugin as never);
    (tab as unknown as { currentSection: string }).currentSection = "providers";

    tab.display();
    expect(
      (tab.containerEl as unknown as FakeElement).querySelector(".aether-provider-risk-note"),
    ).toBeTruthy();
    expect((tab.containerEl as unknown as FakeElement).textContent).toContain(
      "包含私密文件、密钥或密码时，请优先使用本地模型",
    );
    const addButton = findButton(tab.containerEl as unknown as FakeElement, "添加服务商");
    expect(addButton).toBeTruthy();

    addButton?.onclick?.();
    await Promise.resolve();

    const providerCard = (tab.containerEl as unknown as FakeElement).querySelector("details") as
      | (FakeElement & { open: boolean })
      | null;
    expect(providerCard).toBeTruthy();
    expect(providerCard?.open).toBe(true);
    expect(providerCard?.querySelector(".aether-provider-toggle-icon")).toBeTruthy();
    expect(providerCard?.querySelector(".aether-provider-card-risk-note")).toBeTruthy();
    expect(providerCard?.textContent).toContain("避免发送给第三方模型");
  });
});

function findButton(root: FakeElement, text: string): FakeElement | undefined {
  const stack = [...root.children];
  while (stack.length > 0) {
    const el = stack.shift()!;
    if (el.tag === "button" && el.text === text) return el;
    stack.push(...el.children);
  }
  return undefined;
}
