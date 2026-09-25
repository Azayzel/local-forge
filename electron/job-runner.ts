import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const MAX_CAPTURED_STDERR = 16_384;
const TERMINAL_EVENTS = new Set(["done", "error"]);

export interface WorkerEvent {
  type: string;
  [key: string]: unknown;
}

export interface JobProcessSpec {
  id: string;
  command: string;
  args: string[];
  cwd?: string;
  input?: unknown;
  env?: NodeJS.ProcessEnv;
}

interface ActiveProcess {
  child: ChildProcessWithoutNullStreams;
  cancelled: boolean;
  terminalEventSeen: boolean;
  stderr: string;
}

export class JobProcessManager {
  private readonly active = new Map<string, ActiveProcess>();

  start(spec: JobProcessSpec, emit: (event: WorkerEvent) => void): void {
    if (!spec.id.trim()) throw new Error("A job ID is required.");
    if (!spec.command.trim())
      throw new Error("A Python executable is required.");
    if (this.active.has(spec.id)) {
      throw new Error(`Job ${spec.id} is already running.`);
    }

    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const state: ActiveProcess = {
      child,
      cancelled: false,
      terminalEventSeen: false,
      stderr: "",
    };
    this.active.set(spec.id, state);

    let stdoutBuffer = "";
    let stderrBuffer = "";
    const consumeLine = (line: string): void => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const value = JSON.parse(trimmed) as unknown;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("Worker event must be an object.");
        }
        const event = value as WorkerEvent;
        if (typeof event.type !== "string") {
          throw new Error("Worker event requires a type.");
        }
        if (TERMINAL_EVENTS.has(event.type)) state.terminalEventSeen = true;
        emit(event);
      } catch {
        emit({ type: "log", text: trimmed });
      }
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      state.stderr = `${state.stderr}${chunk}`.slice(-MAX_CAPTURED_STDERR);
      stderrBuffer += chunk;
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) emit({ type: "log", text: trimmed });
      }
    });

    child.once("error", (error) => {
      if (!state.terminalEventSeen && !state.cancelled) {
        state.terminalEventSeen = true;
        emit({ type: "error", message: error.message });
      }
    });

    child.once("close", (code, signal) => {
      if (stdoutBuffer) consumeLine(stdoutBuffer);
      if (stderrBuffer.trim()) emit({ type: "log", text: stderrBuffer.trim() });
      this.active.delete(spec.id);
      if (state.cancelled) {
        emit({ type: "cancelled" });
        return;
      }
      if (state.terminalEventSeen) return;
      const detail = state.stderr.trim();
      emit({
        type: "error",
        message:
          detail ||
          `Worker exited without a completion event (code ${code ?? "unknown"}${signal ? `, signal ${signal}` : ""}).`,
      });
    });

    if (spec.input === undefined) child.stdin.end();
    else child.stdin.end(`${JSON.stringify(spec.input)}\n`, "utf8");
  }

  cancel(id: string): boolean {
    const state = this.active.get(id);
    if (!state) return false;
    state.cancelled = true;
    state.child.kill();
    const forceKill = setTimeout(() => {
      if (this.active.get(id) === state) state.child.kill("SIGKILL");
    }, 2_000);
    forceKill.unref();
    return true;
  }

  cancelAll(): void {
    for (const id of this.active.keys()) this.cancel(id);
  }

  isRunning(id: string): boolean {
    return this.active.has(id);
  }
}
