export interface VaultFileMeta {
  path: string; // vault-relative POSIX path
  mtime: number; // UTC ms
  size: number; // bytes
}

export interface NoticeOptions {
  level?: "info" | "warn" | "error";
  timeoutMs?: number; // 0 = sticky, default 5000
}

export interface IHostAdapter {
  listMarkdown(dir: string): Promise<VaultFileMeta[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  ensureDir(path: string): Promise<void>;

  readData(key: string): Promise<string | null>;
  writeData(key: string, value: string): Promise<void>;

  fetch(input: string, init?: RequestInit): Promise<Response>;

  notify(message: string, options?: NoticeOptions): void;
  openExternal(url: string): Promise<void>;

  now(): number;
  newId(): string;

  openInEditor?(vaultPath: string, options?: { line?: number }): Promise<void>;
}
