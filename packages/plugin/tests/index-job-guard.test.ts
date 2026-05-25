import { describe, expect, it, vi } from "vitest";
import { createExclusiveIndexJobRunner } from "../src/ui/index-job-guard.js";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("createExclusiveIndexJobRunner", () => {
  it("restores duplicate trigger UI immediately without starting another refresh", async () => {
    const notice = vi.fn();
    const runExclusiveIndexJob = createExclusiveIndexJobRunner(notice);
    const firstJob = deferred<void>();
    const firstRun = vi.fn(() => firstJob.promise);
    const duplicateRun = vi.fn(() => Promise.resolve());
    const onAlreadyRunning = vi.fn();

    const first = runExclusiveIndexJob("refresh", {}, firstRun);
    const duplicate = runExclusiveIndexJob("refresh", { onAlreadyRunning }, duplicateRun);

    await vi.waitFor(() => expect(onAlreadyRunning).toHaveBeenCalledTimes(1));
    expect(notice).toHaveBeenCalledWith("refresh");
    expect(firstRun).toHaveBeenCalledTimes(1);
    expect(duplicateRun).not.toHaveBeenCalled();

    firstJob.resolve();
    await Promise.all([first, duplicate]);
  });

  it("blocks rebuild while refresh is running and returns the existing job", async () => {
    const notice = vi.fn();
    const runExclusiveIndexJob = createExclusiveIndexJobRunner(notice);
    const firstJob = deferred<void>();
    const refreshRun = vi.fn(() => firstJob.promise);
    const rebuildRun = vi.fn(() => Promise.resolve());

    const refresh = runExclusiveIndexJob("refresh", {}, refreshRun);
    const rebuild = runExclusiveIndexJob("rebuild", {}, rebuildRun);

    expect(notice).toHaveBeenCalledWith("refresh");
    expect(refreshRun).toHaveBeenCalledTimes(1);
    expect(rebuildRun).not.toHaveBeenCalled();

    firstJob.resolve();
    await Promise.all([refresh, rebuild]);
  });

  it("allows a new index job after the previous one settles", async () => {
    const runExclusiveIndexJob = createExclusiveIndexJobRunner(vi.fn());
    const firstRun = vi.fn(() => Promise.resolve());
    const secondRun = vi.fn(() => Promise.resolve());

    await runExclusiveIndexJob("refresh", {}, firstRun);
    await runExclusiveIndexJob("rebuild", {}, secondRun);

    expect(firstRun).toHaveBeenCalledTimes(1);
    expect(secondRun).toHaveBeenCalledTimes(1);
  });
});
