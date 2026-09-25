import path from "node:path";
import { describe, expect, it } from "vitest";
import { JobProcessManager, type WorkerEvent } from "./job-runner";

const fixture = path.resolve("tests/fixtures/job-worker.mjs");

function waitForEvent(
  events: WorkerEvent[],
  predicate: (event: WorkerEvent) => boolean,
): Promise<WorkerEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          new Error(`Timed out waiting for event: ${JSON.stringify(events)}`),
        ),
      3_000,
    );
    const timer = setInterval(() => {
      const event = events.find(predicate);
      if (!event) return;
      clearTimeout(timeout);
      clearInterval(timer);
      resolve(event);
    }, 5);
  });
}

describe("JobProcessManager", () => {
  it("parses fragmented NDJSON and preserves plain-text diagnostics", async () => {
    const manager = new JobProcessManager();
    const events: WorkerEvent[] = [];

    manager.start(
      {
        id: "complete-job",
        command: process.execPath,
        args: [fixture],
        input: { wait: false },
      },
      (event) => events.push(event),
    );

    await waitForEvent(events, (event) => event.type === "done");
    expect(events).toEqual(
      expect.arrayContaining([
        { type: "status", message: "fixture ready" },
        { type: "log", text: "diagnostic text" },
        { type: "log", text: "stderr diagnostic" },
        { type: "progress", step: 2, total: 4 },
        { type: "done", path: "fixture-output.png" },
      ]),
    );
  });

  it("terminates a running worker and emits cancellation", async () => {
    const manager = new JobProcessManager();
    const events: WorkerEvent[] = [];

    manager.start(
      {
        id: "cancel-job",
        command: process.execPath,
        args: [fixture],
        input: { wait: true },
      },
      (event) => events.push(event),
    );
    await waitForEvent(events, (event) => event.type === "progress");

    expect(manager.cancel("cancel-job")).toBe(true);
    await waitForEvent(events, (event) => event.type === "cancelled");
    expect(manager.isRunning("cancel-job")).toBe(false);
  });
});
