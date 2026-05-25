import { normalizeExternalWebUrl } from "./vault-path.js";

export interface OpenExternalLinkOptions {
  opener?: (url: string, target: string, features: string) => unknown;
  notify?: (message: string, timeoutMs?: number) => void;
  failureMessage: (error: string) => string;
  timeoutMs?: number;
}

export function openExternalLink(url: string, opts: OpenExternalLinkOptions): boolean {
  try {
    const safeUrl = normalizeExternalWebUrl(url);
    const opener =
      opts.opener ??
      ((href: string, target: string, features: string) => window.open(href, target, features));
    const opened = opener(safeUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      opts.notify?.(opts.failureMessage("popup blocked"), opts.timeoutMs ?? 5000);
      return false;
    }
    return true;
  } catch (e) {
    opts.notify?.(opts.failureMessage((e as Error).message), opts.timeoutMs ?? 5000);
    return false;
  }
}
