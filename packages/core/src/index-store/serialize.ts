import type { Chunk, Note, PersistedIndex } from "../types.js";
import { OramaIndexStore } from "./orama-store.js";

export async function serialize(
  store: OramaIndexStore,
  embeddingModel: string | null,
  embeddingDim: number | null,
  now: number,
): Promise<PersistedIndex> {
  return {
    schemaVersion: 1,
    embeddingModel,
    embeddingDim,
    notes: store.allNotes(),
    chunks: store.allChunks(),
    updatedAt: now,
  };
}

export async function deserialize(
  payload: PersistedIndex,
): Promise<{ store: OramaIndexStore; notes: Note[]; chunks: Chunk[] }> {
  const dim = payload.embeddingDim ?? 8;
  const store = new OramaIndexStore({ embeddingDim: dim });
  await store.init();
  for (const n of payload.notes) store.upsertNote(n);
  const byNote = new Map<string, Chunk[]>();
  for (const c of payload.chunks) {
    const arr = byNote.get(c.noteId) ?? [];
    arr.push(c);
    byNote.set(c.noteId, arr);
  }
  for (const [noteId, chunks] of byNote) {
    await store.setChunks(noteId, chunks);
  }
  return { store, notes: payload.notes, chunks: payload.chunks };
}
