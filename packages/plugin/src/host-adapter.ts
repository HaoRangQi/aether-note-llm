import type { App, TFile } from "obsidian";
import { Notice, normalizePath, requestUrl } from "obsidian";
import type { IHostAdapter, NoticeOptions, VaultFileMeta } from "@aether/core";
import { newUlid } from "@aether/core";
import type { PluginDataStore } from "./plugin-data-store.js";
import { joinVaultFolderPath, normalizeExternalWebUrl } from "./ui/vault-path.js";

/**
 * Maps @aether/core IHostAdapter onto the Obsidian Plugin API.
 * Stays small: no business logic, just translation.
 */
export class ObsidianHostAdapter implements IHostAdapter {
  constructor(
    private readonly app: App,
    private readonly dataStore: PluginDataStore,
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

    // Recursively create parent directories
    const parts = p.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      if (dir === "") continue;
      const exists = this.app.vault.getAbstractFileByPath(dir);
      if (!exists) {
        try {
          await this.app.vault.createFolder(dir);
        } catch (e) {
          // Folder may already exist due to race; ignore.
          console.warn(`[Aether] Failed to create folder ${dir}:`, e);
        }
      }
    }
  }

  async readData(key: string): Promise<string | null> {
    return this.dataStore.getString(key);
  }

  async writeData(key: string, value: string): Promise<void> {
    await this.dataStore.setString(key, value);
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
    const safeUrl = normalizeExternalWebUrl(url);
    const shell = typeof require === "function" ? require("electron")?.shell : undefined;
    if (shell?.openExternal) {
      await shell.openExternal(safeUrl);
      return;
    }
    window.open(safeUrl, "_blank", "noopener,noreferrer");
  }

  canOpenFolder(): boolean {
    const adapter = this.app.vault.adapter as { basePath?: string };
    return Boolean(
      adapter.basePath && typeof require === "function" && typeof window !== "undefined",
    );
  }

  async openFolder(vaultPath: string): Promise<void> {
    try {
      const adapter = this.app.vault.adapter as { basePath?: string };
      const vaultRoot = adapter.basePath || "";
      if (!vaultRoot) throw new Error("Cannot determine vault root path");

      const folderPath = joinVaultFolderPath(vaultRoot, vaultPath);
      console.log("[Aether] Opening folder:", folderPath);

      const { shell } = require("electron");
      const result = await shell.openPath(folderPath);
      if (result) {
        throw new Error(`Failed to open folder: ${result}`);
      }
    } catch (e) {
      console.error("[Aether] openFolder error:", e);
      throw e;
    }
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
