import type { App, Plugin, TFile } from "obsidian";
import { Notice, normalizePath, requestUrl } from "obsidian";
import type { IHostAdapter, NoticeOptions, VaultFileMeta } from "@aether/core";
import { newUlid } from "@aether/core";

/**
 * Maps @aether/core IHostAdapter onto the Obsidian Plugin API.
 * Stays small: no business logic, just translation.
 */
export class ObsidianHostAdapter implements IHostAdapter {
  constructor(
    private readonly app: App,
    private readonly plugin: Plugin,
  ) {}

  async listMarkdown(dir: string): Promise<VaultFileMeta[]> {
    const all = this.app.vault.getMarkdownFiles();
    const prefix = dir === "" ? "" : `${normalizePath(dir).replace(/\/+$/, "")}/`;
    return all
      .filter((f) => prefix === "" || f.path.startsWith(prefix))
      .map((f: TFile) => ({ path: f.path, mtime: f.stat.mtime, size: f.stat.size }));
  }

  async readFile(path: string): Promise<string> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!f || !("stat" in f)) throw new Error(`ENOENT: ${path}`);
    return this.app.vault.read(f as TFile);
  }

  async writeFile(path: string, content: string): Promise<void> {
    const p = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(p);
    if (existing && "stat" in existing) {
      await this.app.vault.modify(existing as TFile, content);
    } else {
      await this.app.vault.create(p, content);
    }
  }

  async deleteFile(path: string): Promise<void> {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (f) await this.app.vault.trash(f, true);
  }

  async exists(path: string): Promise<boolean> {
    return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
  }

  async ensureDir(path: string): Promise<void> {
    if (path === "") return;
    const p = normalizePath(path);
    const exists = this.app.vault.getAbstractFileByPath(p);
    if (exists) return;
    try {
      await this.app.vault.createFolder(p);
    } catch {
      // Folder may already exist due to race; ignore.
    }
  }

  async readData(key: string): Promise<string | null> {
    const data = (await this.plugin.loadData()) as Record<string, string> | null;
    return data?.[key] ?? null;
  }

  async writeData(key: string, value: string): Promise<void> {
    const data =
      ((await this.plugin.loadData()) as Record<string, string> | null) ?? {};
    data[key] = value;
    await this.plugin.saveData(data);
  }

  async fetch(input: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      for (const [k, v] of Object.entries(h)) headers[k] = v;
    }
    const body = typeof init?.body === "string" ? init.body : undefined;
    const r = await requestUrl({
      url: input,
      method: init?.method ?? "GET",
      headers,
      ...(body !== undefined ? { body } : {}),
      throw: false,
    });
    return new Response(r.text, {
      status: r.status,
      headers: r.headers as Record<string, string>,
    });
  }

  notify(message: string, options?: NoticeOptions): void {
    new Notice(message, options?.timeoutMs ?? 5000);
  }

  async openExternal(url: string): Promise<void> {
    window.open(url, "_blank");
  }

  now(): number {
    return Date.now();
  }
  newId(): string {
    return newUlid();
  }

  async openInEditor(vaultPath: string): Promise<void> {
    await this.app.workspace.openLinkText(vaultPath, "", false);
  }
}
