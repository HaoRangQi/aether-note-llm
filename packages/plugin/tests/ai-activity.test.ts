import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeElement } from "./fixtures/obsidian.js";
import { AiActivityIndicator } from "../src/ui/ai-activity.js";

describe("AiActivityIndicator", () => {
  let body: FakeElement;
  let clearIntervalSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    body = new FakeElement("body");
    clearIntervalSpy = vi.fn();
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    vi.stubGlobal("document", { body });
    vi.stubGlobal("window", {
      setInterval: vi.fn(() => 7),
      clearInterval: clearIntervalSpy,
      setTimeout: vi.fn((cb: () => void) => {
        cb();
        return 1;
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("updates progress meta without dropping the elapsed timer", () => {
    const indicator = new AiActivityIndicator({
      roleName: "导入中",
      roleIcon: "download",
      meta: "0/3",
    });

    indicator.updateMeta("2/3");

    expect(body.textContent).toContain("导入中 处理中");
    expect(body.textContent).toContain("2/3 · 0s");
    expect(body.textContent).not.toContain("0/3");
  });

  it("calls onCancel once when the cancel button is clicked repeatedly", () => {
    const onCancel = vi.fn();
    new AiActivityIndicator({
      roleName: "重建索引",
      roleIcon: "refresh-cw",
      onCancel,
    });
    const cancel = findButton(body, "取消");

    cancel?.onclick?.();
    cancel?.onclick?.();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(7);
    expect(body.textContent).not.toContain("重建索引 处理中");
  });

  it("cancels the previous active indicator when a new one starts", () => {
    const firstCancel = vi.fn();
    new AiActivityIndicator({
      roleName: "第一项任务",
      roleIcon: "sparkles",
      onCancel: firstCancel,
    });

    new AiActivityIndicator({
      roleName: "第二项任务",
      roleIcon: "download",
    });

    expect(firstCancel).toHaveBeenCalledTimes(1);
    expect(body.textContent).not.toContain("第一项任务 处理中");
    expect(body.textContent).toContain("第二项任务 处理中");
  });
});

function findButton(root: FakeElement, text: string): FakeElement | undefined {
  if (root.tag === "button" && root.text === text) return root;
  for (const child of root.children) {
    const result = findButton(child, text);
    if (result) return result;
  }
  return undefined;
}
