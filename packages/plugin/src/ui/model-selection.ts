export type ModelUse = "chat" | "embedding";

const EMBEDDING_MODEL_RE =
  /\b(embed|embedding|bge|e5|gte|jina-embeddings|nomic-embed|text-embedding)\b/i;

export function mergeModels(live: string[], fallback: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of live) {
    const normalized = m.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  for (const m of fallback ?? []) {
    const normalized = m.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function chooseModelForUse(
  live: string[] | undefined,
  fallback: string[] | undefined,
  use: ModelUse,
  options: { allowUnclassifiedEmbedding?: boolean } = {},
): string {
  const models = mergeModels(live ?? [], fallback);
  if (models.length === 0) return "";
  if (use === "embedding") {
    return models.find(isEmbeddingModel) ?? (options.allowUnclassifiedEmbedding ? models[0]! : "");
  }
  return models.find((model) => !isEmbeddingModel(model)) ?? "";
}

export function modelLooksCompatible(model: string, use: ModelUse): boolean {
  if (!model.trim()) return false;
  return use === "embedding" ? isEmbeddingModel(model) : !isEmbeddingModel(model);
}

export function isEmbeddingModel(model: string): boolean {
  return EMBEDDING_MODEL_RE.test(model);
}
