import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  migrateSettings,
  type ProblemSolveResponse,
  type SearchAnswerCitation,
  type SearchMeta,
} from "@aether/core";
import { HubView } from "../src/views/hub-view.js";
import { ExperienceCardModal } from "../src/modals/experience-card-modal.js";
import { AetherSettingsTab } from "../src/settings-tab.js";
import { FakeElement, notices, openedModals } from "./fixtures/obsidian.js";

const meta: SearchMeta = {
  mode: "hybrid",
  alpha: 0.4,
  staleRatio: 0,
  fallbackReason: null,
};

const citation: SearchAnswerCitation = {
  index: 1,
  noteId: "note-1",
  vaultPath: "Aether Inbox/工作/2026/05/debug.md",
  title: "Debug note",
  chunkId: "chunk-1",
  headingPath: "事故复盘",
  excerpt: "稳定 owner 后问题消失。",
  url: null,
  tokenCount: 12,
  truncated: false,
};

describe("problem solver mode", () => {
  beforeEach(() => {
    notices.length = 0;
    openedModals.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the solve mode entry and displays a structured solution", async () => {
    const response = makeSolveResponse();
    const plugin = makePlugin({
      solveProblem: vi.fn(async () => response),
      searchWithMeta: vi.fn(),
    });
    const view = new HubView(
      {
        app: {
          setting: {
            open: vi.fn(),
            openTabById: vi.fn(),
          },
        },
      } as never,
      plugin as never,
    );

    await view.onOpen();
    expect((view.containerEl.children[1] as FakeElement).textContent).toContain("解决问题");

    (
      view as unknown as { query: string; mode: "recent" | "search"; taskMode: "search" | "solve" }
    ).query = "SwiftUI 状态丢失怎么办？";
    (
      view as unknown as { query: string; mode: "recent" | "search"; taskMode: "search" | "solve" }
    ).mode = "search";
    (
      view as unknown as { query: string; mode: "recent" | "search"; taskMode: "search" | "solve" }
    ).taskMode = "solve";

    await (view as unknown as { refreshResults(): Promise<void> }).refreshResults();

    expect(plugin.core.solveProblem).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "SwiftUI 状态丢失怎么办？",
        privacyScope: "public",
      }),
    );
    expect(plugin.core.searchWithMeta).not.toHaveBeenCalled();
    const text = (view.containerEl.children[1] as FakeElement).textContent;
    expect(text).toContain("直接结论");
    expect(text).toContain("推荐步骤");
    expect(text).toContain("历史依据");
    expect(text).toContain("风险和不确定性");
    expect(text).toContain("来源引用");
    expect(text).toContain("稳定 owner 能避免状态挂到被重建的行上。[1]");
    expect(text).toContain("保存为经验卡");
  });

  it("opens an editable experience card preview and saves the edited draft", async () => {
    const response = makeSolveResponse();
    const saveExperienceCard = vi.fn(async () => ({
      id: "exp-1",
      vaultPath: "Aether Experience/2026/05/exp-1-state.md",
      title: "Edited title",
    }));
    const plugin = makePlugin({
      solveProblem: vi.fn(async () => response),
      saveExperienceCard,
    });
    const view = new HubView({ app: {} } as never, plugin as never);
    const root = new FakeElement("root");

    (
      view as unknown as {
        renderProblemSolutionBody(
          root: FakeElement,
          response: ProblemSolveResponse,
          privacyScope: "public",
        ): void;
      }
    ).renderProblemSolutionBody(root, response, "public");

    await findButton(root, "保存为经验卡")?.onclick?.();
    const modal = openedModals[0]!;
    expect(modal.contentEl.textContent).toContain("保存为经验卡");
    expect(modal.contentEl.textContent).toContain("Aether Experience/2026/05/");

    const title = findByClass(modal.contentEl, "aether-experience-title-input")!;
    title.value = "Edited title";
    title.onchange?.();
    const steps = findByClass(modal.contentEl, "aether-experience-steps-input")!;
    steps.value = "确认 owner\n提升状态";
    steps.onchange?.();
    const tags = findByClass(modal.contentEl, "aether-experience-tags-input")!;
    tags.value = "swiftui, debug";
    tags.onchange?.();

    await findButton(modal.contentEl, "保存经验卡")?.onclick?.();
    await settleAsyncHandlers();

    expect(saveExperienceCard).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Edited title",
        problem: "SwiftUI 状态丢失怎么办？",
        summary: "稳定 owner 能避免状态挂到被重建的行上。[1]",
        steps: ["确认 owner", "提升状态"],
        tags: ["swiftui", "debug"],
        confidence: "high",
        evidenceStatus: "supported",
        privacyScope: "public",
        citations: [citation],
      }),
    );
    expect(notices).toContainEqual({
      message: "经验卡已保存：Aether Experience/2026/05/exp-1-state.md",
      timeoutMs: 3000,
    });
  });

  it("defaults all-scope experience cards without citations to the private experience folder", () => {
    const response = makeSolveResponse({ citations: [] });
    const plugin = makePlugin();
    const modal = new ExperienceCardModal({} as never, plugin as never, {
      response,
      privacyScope: "all",
    });

    modal.open();

    expect(modal.contentEl.textContent).toContain("Aether Private Experience/2026/05/");
  });

  it("previews the private experience folder when all-scope citations include private sources", () => {
    const response = makeSolveResponse({
      citations: [
        citation,
        {
          ...citation,
          index: 2,
          noteId: "private-note",
          vaultPath: "Private/source.md",
          title: "Private source",
        },
      ],
    });
    const plugin = makePlugin();
    const modal = new ExperienceCardModal({} as never, plugin as never, {
      response,
      privacyScope: "all",
    });

    modal.open();

    expect(modal.contentEl.textContent).toContain("Aether Private Experience/2026/05/");
  });

  it("edits public and private experience folders in Advanced settings", async () => {
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
        canOpenImportFolder: vi.fn(() => false),
      },
    };
    const tab = new AetherSettingsTab({} as never, plugin as never);
    (tab as unknown as { currentSection: string }).currentSection = "advanced";

    tab.display();

    const root = tab.containerEl as unknown as FakeElement;
    expect(root.textContent).toContain("经验卡目录");
    const publicInput = findByClass(root, "aether-experience-folder-public")!;
    publicInput.value = "Experience Cards";
    publicInput.onchange?.();
    const privateInput = findByClass(root, "aether-experience-folder-private")!;
    privateInput.value = "Private Experience Cards";
    privateInput.onchange?.();
    await settleAsyncHandlers();

    expect(current.ui.experienceFolder).toBe("Experience Cards");
    expect(current.ui.privateExperienceFolder).toBe("Private Experience Cards");
  });
});

function makePlugin(overrides: Record<string, unknown> = {}) {
  const settings = migrateSettings({
    ui: {
      experienceFolder: "Aether Experience",
      privateExperienceFolder: "Aether Private Experience",
    },
  });
  return {
    app: {},
    openHubAndRefresh: vi.fn(),
    core: {
      settings: { current: settings },
      store: { allChunks: () => [] },
      inbox: { listItems: () => [] },
      canOpenImportFolder: () => false,
      listRecentImportedMarkdown: vi.fn(async () => []),
      now: () => Date.UTC(2026, 4, 24),
      solveProblem: vi.fn(async () => makeSolveResponse()),
      saveExperienceCard: vi.fn(),
      ...overrides,
    },
    hostAdapter: {
      openExternal: vi.fn(),
    },
  };
}

function makeSolveResponse(
  overrides: Partial<Pick<ProblemSolveResponse, "citations" | "blockedReason">> = {},
): ProblemSolveResponse {
  const citations = overrides.citations ?? [citation];
  return {
    question: "SwiftUI 状态丢失怎么办？",
    solution: {
      summary: "稳定 owner 能避免状态挂到被重建的行上。[1]",
      confidence: "high",
      evidenceStatus: "supported",
      likelyCauses: ["List row identity 变化导致 state owner 被重建。[1]"],
      steps: ["固定 row id。[1]", "把状态提升到稳定 owner。"],
      risks: ["如果数据源本身不稳定，需要先修数据源。"],
      missingInfo: ["缺少复现代码。"],
    },
    citations,
    citationCheck: {
      referencedIndexes: citations.length ? [1] : [],
      invalidIndexes: [],
      unusedIndexes: [],
      hasAnyReference: citations.length > 0,
    },
    contextTokenCount: 42,
    contextTruncated: false,
    search: { hits: [], meta },
    blockedReason: overrides.blockedReason ?? null,
  };
}

function findButton(root: FakeElement, text: string): FakeElement | undefined {
  if (root.tag === "button" && root.text === text) return root;
  for (const child of root.children) {
    const result = findButton(child, text);
    if (result) return result;
  }
  return undefined;
}

function findByClass(root: FakeElement, cls: string): FakeElement | undefined {
  if (root.cls.split(/\s+/).includes(cls)) return root;
  for (const child of root.children) {
    const result = findByClass(child, cls);
    if (result) return result;
  }
  return undefined;
}

async function settleAsyncHandlers(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
