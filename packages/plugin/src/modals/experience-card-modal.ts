import { Modal, Notice, setIcon } from "obsidian";
import type {
  ExperienceCardDraft,
  PrivacyScope,
  ProblemSolveResponse,
  SearchAnswerCitation,
} from "@aether/core";
import type AetherPlugin from "../main.js";
import { t } from "../i18n/index.js";

interface ExperienceCardModalOptions {
  response: ProblemSolveResponse;
  privacyScope: PrivacyScope;
}

interface ExperienceCardEditorDraft {
  title: string;
  problem: string;
  summary: string;
  stepsText: string;
  tagsText: string;
}

export class ExperienceCardModal extends Modal {
  private readonly response: ProblemSolveResponse;
  private readonly privacyScope: PrivacyScope;
  private draft: ExperienceCardEditorDraft;
  private saving = false;

  constructor(
    app: ConstructorParameters<typeof Modal>[0],
    private readonly plugin: AetherPlugin,
    options: ExperienceCardModalOptions,
  ) {
    super(app);
    this.response = options.response;
    this.privacyScope = options.privacyScope;
    this.draft = {
      title: defaultTitle(options.response.question),
      problem: options.response.question,
      summary: options.response.solution.summary,
      stepsText: options.response.solution.steps.join("\n"),
      tagsText: defaultTags(options.response).join(", "),
    };
  }

  onOpen(): void {
    this.modalEl.addClass("aether-experience-modal");
    this.render();
  }

  private render(): void {
    const el = this.contentEl;
    el.empty();
    const header = el.createDiv({ cls: "aether-result-header" });
    const iconEl = header.createDiv({ cls: "aether-result-header-icon" });
    setIcon(iconEl, "badge-check");
    header.createDiv({
      cls: "aether-result-header-title",
      text: t("modal.experience.title"),
    });

    const preview = el.createDiv({ cls: "aether-experience-target-preview" });
    this.updateTargetPreview(preview);

    this.renderEditableField(el, {
      label: t("modal.experience.field.title"),
      value: this.draft.title,
      className: "aether-experience-title-input",
      onInput: (value) => {
        this.draft.title = value;
        this.updateTargetPreview(preview);
      },
    });
    this.renderEditableField(el, {
      label: t("modal.experience.field.problem"),
      value: this.draft.problem,
      className: "aether-experience-problem-input",
      multiline: true,
      onInput: (value) => {
        this.draft.problem = value;
      },
    });
    this.renderEditableField(el, {
      label: t("modal.experience.field.summary"),
      value: this.draft.summary,
      className: "aether-experience-summary-input",
      multiline: true,
      onInput: (value) => {
        this.draft.summary = value;
      },
    });
    this.renderEditableField(el, {
      label: t("modal.experience.field.steps"),
      value: this.draft.stepsText,
      className: "aether-experience-steps-input",
      multiline: true,
      rows: 5,
      onInput: (value) => {
        this.draft.stepsText = value;
      },
    });
    this.renderEditableField(el, {
      label: t("modal.experience.field.tags"),
      value: this.draft.tagsText,
      className: "aether-experience-tags-input",
      onInput: (value) => {
        this.draft.tagsText = value;
      },
    });

    const actions = el.createDiv({ cls: "aether-result-actions" });
    const cancel = actions.createEl("button", {
      cls: "aether-result-btn",
      text: t("common.cancel"),
    });
    cancel.disabled = this.saving;
    cancel.onclick = () => this.close();
    const save = actions.createEl("button", {
      cls: "aether-result-btn aether-result-btn--cta",
      text: this.saving ? t("modal.experience.saving") : t("modal.experience.save"),
    });
    save.disabled = this.saving;
    save.onclick = () => void this.save();
  }

  private renderEditableField(
    parent: HTMLElement,
    opts: {
      label: string;
      value: string;
      className: string;
      multiline?: boolean;
      rows?: number;
      onInput: (value: string) => void;
    },
  ): void {
    const wrap = parent.createDiv({ cls: "aether-import-preview-field" });
    wrap.createDiv({ cls: "aether-import-preview-field-label", text: opts.label });
    const input = opts.multiline
      ? wrap.createEl("textarea", { cls: opts.className })
      : wrap.createEl("input", { cls: opts.className });
    input.value = opts.value;
    input.disabled = this.saving;
    if (opts.multiline) {
      (input as HTMLTextAreaElement).rows = opts.rows ?? 2;
    } else {
      (input as HTMLInputElement).type = "text";
    }
    const handleInput = (): void => opts.onInput(input.value);
    input.addEventListener("input", handleInput);
    input.onchange = handleInput;
  }

  private updateTargetPreview(el: HTMLElement): void {
    el.setText(
      t("modal.experience.targetPath", {
        path: `${this.targetRoot()}/${targetYearMonth(this.now())}/…-${this.draft.title || "experience"}.md`,
      }),
    );
  }

  private async save(): Promise<void> {
    if (this.saving) return;
    const draft = this.toCoreDraft();
    if (!draft.title.trim() || !draft.problem.trim() || !draft.summary.trim()) {
      new Notice(t("modal.experience.required"), 3000);
      return;
    }
    this.saving = true;
    this.render();
    try {
      const note = await this.plugin.core.saveExperienceCard(draft);
      new Notice(t("modal.experience.saved", { path: note.vaultPath }), 3000);
      await this.plugin.openHubAndRefresh?.();
      this.close();
    } catch (e) {
      new Notice(t("modal.experience.failed", { error: (e as Error).message }), 5000);
      this.saving = false;
      this.render();
    }
  }

  private toCoreDraft(): ExperienceCardDraft {
    return {
      title: this.draft.title.trim(),
      problem: this.draft.problem.trim(),
      summary: this.draft.summary.trim(),
      steps: parseLines(this.draft.stepsText),
      tags: parseTags(this.draft.tagsText),
      confidence: this.response.solution.confidence,
      evidenceStatus: this.response.solution.evidenceStatus,
      citations: this.response.citations,
      privacyScope: this.privacyScope,
    };
  }

  private targetRoot(): string {
    const settings = this.plugin.core.settings.current;
    const publicFolder = trimFolder(settings.ui.experienceFolder || "Aether Experience");
    const privateFolder = trimFolder(
      settings.ui.privateExperienceFolder || "Aether Private Experience",
    );
    if (this.privacyScope === "public") return publicFolder;
    if (this.privacyScope === "private") return privateFolder;
    if (this.response.citations.length === 0) return privateFolder;
    return this.response.citations.some((citation) => isPrivateCitation(citation, settings.privacy))
      ? privateFolder
      : publicFolder;
  }

  private now(): number {
    return typeof this.plugin.core.now === "function" ? this.plugin.core.now() : Date.now();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function defaultTitle(question: string): string {
  const normalized = question.trim().replace(/\s+/g, " ");
  return normalized.slice(0, 80) || t("modal.experience.defaultTitle");
}

function defaultTags(response: ProblemSolveResponse): string[] {
  const tags = ["experience"];
  if (response.solution.evidenceStatus === "missing") tags.push("needs-evidence");
  return tags;
}

function parseLines(raw: string): string[] {
  return raw
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,，\s]+/)) {
    const normalized = part.trim().replace(/^#/, "");
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function trimFolder(value: string): string {
  return value.trim().replace(/\/+$/, "") || "Aether Experience";
}

function targetYearMonth(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isPrivateCitation(
  citation: SearchAnswerCitation,
  privacy: { privateFolders: string[]; privateInboxFolder: string },
): boolean {
  const path = citation.vaultPath.replace(/\/+$/, "");
  const folders = [...privacy.privateFolders, privacy.privateInboxFolder];
  return folders.some((folder) => {
    const normalized = folder.trim().replace(/\/+$/, "");
    return normalized && (path === normalized || path.startsWith(`${normalized}/`));
  });
}
