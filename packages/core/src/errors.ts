export type AetherErrorCode =
  | "PROVIDER_NOT_FOUND"
  | "BINDING_NOT_FOUND"
  | "API_KEY_MISSING"
  | "PROVIDER_HTTP_ERROR"
  | "EMBED_DIM_MISMATCH"
  | "INDEX_CORRUPT"
  | "PARSE_ERROR"
  | "BUDGET_EXCEEDED"
  | "ABORTED";

export class AetherError extends Error {
  readonly code: AetherErrorCode;
  readonly cause?: unknown;
  constructor(code: AetherErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "AetherError";
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export function isAetherError(e: unknown): e is AetherError {
  return e instanceof AetherError;
}
