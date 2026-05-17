import type { IHostAdapter, NoticeOptions, VaultFileMeta } from "./adapter.js";

interface MemoryFile {
  content: string;
  mtime: number;
}

export interface InMemoryHostOptions {
  files?: Record<string, string>;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  newId?: () => string;
}

interface RecordedNotice {
  message: string;
  options: NoticeOptions | undefined;
}

export class InMemoryHostAdapter implements IHostAdapter {
  private files = new Map<string, MemoryFile>();
  private data = new Map<string, string>();
  readonly notices: RecordedNotice[] = [];
  readonly opened: string[] = [];
  private readonly fetchImpl: (i: string, init?: RequestInit) => Promise<Response>;
  private readonly nowImpl: () => number;
  private readonly newIdImpl: () => string;
  private idCounter = 0;

  constructor(opts: InMemoryHostOptions = {}) {
    const t0 = opts.now ? opts.now() : Date.now();
    for (const [p, c] of Object.entries(opts.files ?? {})) {
      this.files.set(p, { content: c, mtime: t0 });
    }
    this.fetchImpl =
      opts.fetch ??
      (async () => {
        throw new Error("InMemoryHostAdapter.fetch not stubbed");
      });
    this.nowImpl = opts.now ?? (() => Date.now());
    this.newIdImpl =
      opts.newId ??
      (() => {
        this.idCounter += 1;
        return `mem-${String(this.idCounter).padStart(6, "0")}`;
      });
  }

  async listMarkdown(dir: string): Promise<VaultFileMeta[]> {
    const prefix = dir === "" ? "" : dir.endsWith("/") ? dir : `${dir}/`;
    const out: VaultFileMeta[] = [];
    for (const [p, f] of this.files) {
      if (!p.endsWith(".md")) continue;
      if (prefix === "" || p.startsWith(prefix)) {
        out.push({ path: p, mtime: f.mtime, size: f.content.length });
      }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  async readFile(path: string): Promise<string> {
    const f = this.files.get(path);
    if (!f) throw new Error(`ENOENT: ${path}`);
    return f.content;
  }

  async writeFile(p: string, c: string): Promise<void> {
    this.files.set(p, { content: c, mtime: this.nowImpl() });
  }

  async deleteFile(p: string): Promise<void> {
    this.files.delete(p);
  }

  async exists(p: string): Promise<boolean> {
    return this.files.has(p);
  }

  async ensureDir(_p: string): Promise<void> {
    // no-op in memory
  }

  async readData(k: string): Promise<string | null> {
    return this.data.get(k) ?? null;
  }

  async writeData(k: string, v: string): Promise<void> {
    this.data.set(k, v);
  }

  fetch(i: string, init?: RequestInit): Promise<Response> {
    return this.fetchImpl(i, init);
  }

  notify(m: string, o?: NoticeOptions): void {
    this.notices.push({ message: m, options: o });
  }

  async openExternal(u: string): Promise<void> {
    this.opened.push(u);
  }

  async openFolder(p: string): Promise<void> {
    this.opened.push(`folder:${p}`);
  }

  now(): number {
    return this.nowImpl();
  }

  newId(): string {
    return this.newIdImpl();
  }
}
