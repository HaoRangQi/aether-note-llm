export type IndexJobKind = "rebuild" | "refresh";

export interface IndexJobCallbacks {
  onDone?: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
  onError?: (error: Error) => void;
  onAlreadyRunning?: () => void | Promise<void>;
}

export function createExclusiveIndexJobRunner(
  onAlreadyRunning: (kind: IndexJobKind) => void,
): (kind: IndexJobKind, opts: IndexJobCallbacks, run: () => Promise<void>) => Promise<void> {
  let inFlight: { kind: IndexJobKind; promise: Promise<void> } | null = null;

  return (kind, opts, run) => {
    if (inFlight) {
      const existing = inFlight;
      onAlreadyRunning(existing.kind);
      return Promise.resolve(opts.onAlreadyRunning?.()).then(() => existing.promise);
    }

    const promise = run().finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
    inFlight = { kind, promise };
    return promise;
  };
}
