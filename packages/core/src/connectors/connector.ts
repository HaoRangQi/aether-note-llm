import type { ImportSource, RawCandidate } from "../types.js";

export interface SourceConnector {
  readonly id: string;
  readonly name: string;
  canHandle(source: ImportSource): boolean;
  parse(source: ImportSource): AsyncIterable<RawCandidate>;
}
