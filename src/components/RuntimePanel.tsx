import {
  Box,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  Layers3,
  Zap,
} from "lucide-react";
import type { ForgeRun, Thread } from "../state/workspace";
import type { OllamaModel, RuntimeHealth, SystemSnapshot } from "../types";

interface RuntimePanelProps {
  health: RuntimeHealth;
  system: SystemSnapshot | null;
  selectedModel: OllamaModel | null;
  thread: Thread;
  runs: ForgeRun[];
}

function formatSize(bytes: number): string {
  return bytes > 0
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
    : "Unknown";
}

export function RuntimePanel({
  health,
  system,
  selectedModel,
  thread,
  runs,
}: RuntimePanelProps) {
  const estimatedTokens = Math.round(
    thread.messages.reduce(
      (total, message) => total + message.content.length,
      0,
    ) / 4,
  );
  const contextPercent = Math.min(100, (estimatedTokens / 8192) * 100);
  const gpuPercent = system?.gpu.available
    ? Math.round((system.gpu.memoryUsedMb / system.gpu.memoryTotalMb) * 100)
    : 0;
  const previewHardware = system?.source === "preview";
  const activeRuns = runs.filter(
    (run) => run.status === "running" || run.status === "queued",
  );

  return (
    <aside className="runtime-panel">
      <div className="runtime-panel-header">
        <div>
          <span className="eyebrow">Local runtime</span>
          <strong>{health.online ? "Ready" : "Disconnected"}</strong>
        </div>
        <span className={`status-pill ${health.online ? "success" : "danger"}`}>
          <span className="status-dot" />
          {health.online ? `${health.latencyMs} ms` : "Offline"}
        </span>
      </div>

      <section className="inspector-section">
        <div className="inspector-title">
          <Cpu size={15} />
          <span>Hardware</span>
        </div>
        <div className="hardware-name">
          {system?.gpu.name ?? "Checking GPU..."}
        </div>
        {previewHardware ? (
          <p className="inspector-empty">
            Live hardware metrics appear in the desktop app.
          </p>
        ) : (
          <>
            <div className="meter-label">
              <span>VRAM</span>
              <span>
                {system?.gpu.available
                  ? `${(system.gpu.memoryUsedMb / 1024).toFixed(1)} / ${(system.gpu.memoryTotalMb / 1024).toFixed(1)} GB`
                  : "Unavailable"}
              </span>
            </div>
            <div className="meter" aria-label={`VRAM usage ${gpuPercent}%`}>
              <span style={{ width: `${gpuPercent}%` }} />
            </div>
            <div className="metric-triplet">
              <div>
                <Gauge size={13} />
                <span>{system?.gpu.utilization ?? 0}%</span>
                <small>GPU</small>
              </div>
              <div>
                <Zap size={13} />
                <span>{system?.gpu.temperature ?? 0} C</span>
                <small>Temp</small>
              </div>
              <div>
                <HardDrive size={13} />
                <span>{Math.round((system?.freeMemoryMb ?? 0) / 1024)} GB</span>
                <small>RAM free</small>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="inspector-section">
        <div className="inspector-title">
          <Box size={15} />
          <span>Active model</span>
        </div>
        {selectedModel ? (
          <div className="model-inspector">
            <strong>{selectedModel.name}</strong>
            <span>
              {selectedModel.parameterSize} / {selectedModel.quantization}
            </span>
            <div className="model-facts">
              <span>{selectedModel.family}</span>
              <span>{formatSize(selectedModel.size)}</span>
            </div>
          </div>
        ) : (
          <p className="inspector-empty">Select an installed model to begin.</p>
        )}
      </section>

      <section className="inspector-section">
        <div className="inspector-title">
          <Layers3 size={15} />
          <span>Context</span>
          <span className="section-count">
            {estimatedTokens.toLocaleString()} tokens
          </span>
        </div>
        <div
          className="context-visual"
          aria-label={`Estimated context usage ${Math.round(contextPercent)}%`}
        >
          <span style={{ width: `${contextPercent}%` }} />
        </div>
        <div className="context-facts">
          <span>{thread.messages.length} messages</span>
          <span>8K window</span>
        </div>
      </section>

      <section className="inspector-section">
        <div className="inspector-title">
          <Database size={15} />
          <span>Knowledge</span>
          <span className="section-count">0 sources</span>
        </div>
        <div className="source-row">
          <span className="source-icon">
            <Database size={14} />
          </span>
          <span>
            <strong>Session memory</strong>
            <small>Conversation only</small>
          </span>
          <span className="status-dot online" />
        </div>
      </section>

      <section className="inspector-section runs-section">
        <div className="inspector-title">
          <Zap size={15} />
          <span>Queue</span>
          <span className="section-count">{activeRuns.length}</span>
        </div>
        {activeRuns.length === 0 ? (
          <p className="inspector-empty">
            Nothing waiting. The forge is clear.
          </p>
        ) : (
          activeRuns.slice(0, 3).map((run) => (
            <div className="mini-run" key={run.id}>
              <span>{run.name}</span>
              <div className="meter">
                <span style={{ width: `${run.progress}%` }} />
              </div>
            </div>
          ))
        )}
      </section>
    </aside>
  );
}
