import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeElement, notices, openedModals } from "./fixtures/obsidian.js";
import { registerCommands } from "../src/commands.js";
import type { AiRole } from "@aether/core";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("AI role command cancellation", () => {
  let body: FakeElement;

  beforeEach(() => {
    body = new FakeElement("body");
    notices.length = 0;
    openedModals.length = 0;
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    vi.stubGlobal("document", { body });
    vi.stubGlobal("window", {
      setInterval: vi.fn(() => 7),
      clearInterval: vi.fn(),
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

  it("does not open a result modal or replace text when a cancelled role resolves late", async () => {
    const run = deferred<string>();
    const commands = new Map<string, { editorCallback?: (editor: EditorDouble) => void }>();
    const role = makeRole();
    const plugin = {
      app: {
        workspace: {
          on: vi.fn(() => ({ unload: vi.fn() })),
        },
      },
      core: {
        settings: {
          current: {
            providers: [{ id: "p1", name: "DeepSeek", kind: "openai-compatible" }],
          },
        },
        listEditorRoles: vi.fn(() => [role]),
        runRole: vi.fn((_roleId: string, _input: unknown, signal: AbortSignal) => {
          expect(signal.aborted).toBe(false);
          return run.promise;
        }),
      },
      addCommand: vi.fn(
        (command: { id: string; editorCallback?: (editor: EditorDouble) => void }) => {
          commands.set(command.id, command);
        },
      ),
      registerEvent: vi.fn(),
      activateView: vi.fn(),
    };
    const editor: EditorDouble = {
      getSelection: vi.fn(() => "selected text"),
      replaceSelection: vi.fn(),
    };

    registerCommands(plugin as never);
    commands.get("ai-role-summarize")?.editorCallback?.(editor);

    const cancel = findButton(body, "取消");
    expect(cancel).toBeTruthy();
    cancel?.onclick?.();
    run.resolve("late rewrite");
    await run.promise;
    await Promise.resolve();

    expect(plugin.core.runRole).toHaveBeenCalledTimes(1);
    expect(editor.replaceSelection).not.toHaveBeenCalled();
    expect(openedModals).toHaveLength(0);
    expect(notices).toContainEqual({ message: "已取消 AI 调用", timeoutMs: 3000 });
  });

  it("does not call the provider or open a result modal without an editor selection", () => {
    const { commands, plugin } = registerTestCommands();
    const editor: EditorDouble = {
      getSelection: vi.fn(() => ""),
      replaceSelection: vi.fn(),
    };

    commands.get("ai-role-summarize")?.editorCallback?.(editor);

    expect(plugin.core.runRole).not.toHaveBeenCalled();
    expect(editor.replaceSelection).not.toHaveBeenCalled();
    expect(openedModals).toHaveLength(0);
    expect(notices).toContainEqual({ message: "请先选中一段文本", timeoutMs: 3000 });
    expect(body.textContent).not.toContain("总结 处理中");
  });

  it("does not open the role picker without an editor selection", () => {
    const { commands, plugin } = registerTestCommands();
    const editor: EditorDouble = {
      getSelection: vi.fn(() => ""),
      replaceSelection: vi.fn(),
    };
    plugin.core.listEditorRoles.mockClear();

    commands.get("run-ai-role")?.editorCallback?.(editor);

    expect(plugin.core.listEditorRoles).not.toHaveBeenCalled();
    expect(plugin.core.runRole).not.toHaveBeenCalled();
    expect(editor.replaceSelection).not.toHaveBeenCalled();
    expect(openedModals).toHaveLength(0);
    expect(notices).toContainEqual({ message: "请先选中一段文本", timeoutMs: 3000 });
  });

  it("does not call the provider when a previously registered role is unavailable", () => {
    const { commands, plugin } = registerTestCommands();
    plugin.core.listEditorRoles.mockReturnValue([]);
    const editor: EditorDouble = {
      getSelection: vi.fn(() => "selected text"),
      replaceSelection: vi.fn(),
    };

    commands.get("ai-role-summarize")?.editorCallback?.(editor);

    expect(plugin.core.runRole).not.toHaveBeenCalled();
    expect(editor.replaceSelection).not.toHaveBeenCalled();
    expect(openedModals).toHaveLength(0);
    expect(notices).toContainEqual({
      message: "这个 AI 角色已被停用、隐藏或解绑，请在 Settings → AI Roles 检查配置。",
      timeoutMs: 4000,
    });
    expect(body.textContent).not.toContain("总结 处理中");
  });

  it("reads live role suggestions when the role picker opens", () => {
    const { commands, plugin } = registerTestCommands();
    const summarize = makeRole();
    const rewrite = makeRole({
      id: "rewrite",
      name: "改写",
      description: "Rewrite the selected text",
    });
    plugin.core.listEditorRoles.mockReturnValue([summarize, rewrite]);
    const editor: EditorDouble = {
      getSelection: vi.fn(() => "selected text"),
      replaceSelection: vi.fn(),
    };

    commands.get("run-ai-role")?.editorCallback?.(editor);
    const modal = openedModals.at(-1) as unknown as {
      getSuggestions: (query: string) => AiRole[];
      placeholder: string;
      emptyStateText: string;
    };

    expect(modal.placeholder).toBe("选择要运行的 AI 角色");
    expect(modal.emptyStateText).toBe("没有可运行的 AI 角色");
    expect(modal.getSuggestions("")).toEqual([summarize, rewrite]);
    expect(modal.getSuggestions("rewrite")).toEqual([rewrite]);
    expect(plugin.core.listEditorRoles).toHaveBeenCalledTimes(3);
  });

  it("runs the selected live role from the role picker and opens the result modal", async () => {
    const { commands, plugin } = registerTestCommands();
    const rewrite = makeRole({ id: "rewrite", name: "改写" });
    plugin.core.listEditorRoles.mockReturnValue([rewrite]);
    plugin.core.runRole.mockResolvedValue("Chosen rewrite");
    const editor: EditorDouble = {
      getSelection: vi.fn(() => "selected text"),
      replaceSelection: vi.fn(),
    };

    commands.get("run-ai-role")?.editorCallback?.(editor);
    const picker = openedModals.at(-1) as unknown as {
      onChooseSuggestion: (role: AiRole) => void;
    };
    picker.onChooseSuggestion(rewrite);
    await Promise.resolve();
    await Promise.resolve();

    expect(plugin.core.runRole).toHaveBeenCalledWith(
      "rewrite",
      { selection: "selected text" },
      expect.any(AbortSignal),
      undefined,
    );
    expect(editor.replaceSelection).not.toHaveBeenCalled();
    const result = openedModals.at(-1);
    expect(result?.contentEl.textContent).toContain("AI 结果");
    expect(result?.contentEl.textContent).toContain("selected text");
    expect(result?.contentEl.textContent).toContain("Chosen rewrite");
  });

  it("does not run a stale role picker suggestion after the role becomes unavailable", () => {
    const { commands, plugin } = registerTestCommands();
    const rewrite = makeRole({ id: "rewrite", name: "改写" });
    plugin.core.listEditorRoles.mockReturnValue([rewrite]);
    const editor: EditorDouble = {
      getSelection: vi.fn(() => "selected text"),
      replaceSelection: vi.fn(),
    };

    commands.get("run-ai-role")?.editorCallback?.(editor);
    const picker = openedModals.at(-1) as unknown as {
      onChooseSuggestion: (role: AiRole) => void;
    };
    plugin.core.listEditorRoles.mockReturnValue([]);
    picker.onChooseSuggestion(rewrite);

    expect(plugin.core.runRole).not.toHaveBeenCalled();
    expect(editor.replaceSelection).not.toHaveBeenCalled();
    expect(openedModals).toHaveLength(1);
    expect(notices).toContainEqual({
      message: "这个 AI 角色已被停用、隐藏或解绑，请在 Settings → AI Roles 检查配置。",
      timeoutMs: 4000,
    });
    expect(body.textContent).not.toContain("改写 处理中");
  });
});

interface EditorDouble {
  getSelection: () => string;
  replaceSelection: (text: string) => void;
}

function makeRole(overrides: Partial<AiRole> = {}): AiRole {
  return {
    id: "summarize",
    builtIn: true,
    name: "总结",
    icon: "sparkles",
    description: "Summarize selection",
    providerId: "p1",
    modelName: "deepseek-chat",
    promptTemplate: "{{selection}}",
    variables: ["selection"],
    outputKind: "text",
    params: {},
    enabled: true,
    showInEditor: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function registerTestCommands() {
  const commands = new Map<string, { editorCallback?: (editor: EditorDouble) => void }>();
  const role = makeRole();
  const plugin = {
    app: {
      workspace: {
        on: vi.fn(() => ({ unload: vi.fn() })),
      },
    },
    core: {
      settings: {
        current: {
          providers: [{ id: "p1", name: "DeepSeek", kind: "openai-compatible" }],
        },
      },
      listEditorRoles: vi.fn(() => [role]),
      runRole: vi.fn(),
    },
    addCommand: vi.fn(
      (command: { id: string; editorCallback?: (editor: EditorDouble) => void }) => {
        commands.set(command.id, command);
      },
    ),
    registerEvent: vi.fn(),
    activateView: vi.fn(),
  };

  registerCommands(plugin as never);
  return { commands, plugin };
}

function findButton(root: FakeElement, text: string): FakeElement | undefined {
  if (root.tag === "button" && root.text === text) return root;
  for (const child of root.children) {
    const result = findButton(child, text);
    if (result) return result;
  }
  return undefined;
}
