import { t } from "../i18n/index.js";

interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

export interface CopyToClipboardOptions {
  successMessage: string;
  failureMessage?: string;
  timeoutMs?: number;
  clipboard?: ClipboardLike | null;
  notify?: (message: string, timeoutMs?: number) => void;
}

export async function copyToClipboard(
  text: string,
  options: CopyToClipboardOptions,
): Promise<boolean> {
  const clipboard =
    options.clipboard === undefined ? globalThis.navigator?.clipboard : options.clipboard;
  const notify = options.notify ?? (() => undefined);

  if (!clipboard) {
    notify(options.failureMessage ?? t("common.copyFailed"), options.timeoutMs ?? 5000);
    return false;
  }

  try {
    await clipboard.writeText(text);
    notify(options.successMessage, options.timeoutMs ?? 2000);
    return true;
  } catch {
    notify(options.failureMessage ?? t("common.copyFailed"), options.timeoutMs ?? 5000);
    return false;
  }
}
