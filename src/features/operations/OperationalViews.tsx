import {
  Activity,
  Archive,
  Beaker,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  ClipboardCopy,
  CopyCheck,
  Database,
  FolderOpen,
  Globe,
  Images,
  Play,
  Plug,
  Plus,
  RotateCcw,
  Save,
  Server,
  Settings2,
  SlidersHorizontal,
  Square,
  Terminal,
  Trash2,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { forgeApi } from "../../lib/forge-api";
import { hasNsfwModelTag } from "../../lib/nsfw";
import {
  createDefaultTuneState,
  type ForgeRun,
  type ForgeSettings,
  type TuneState,
} from "../../state/workspace";
import type { ThemeId } from "../../state/workspace";
import type {
  McpServerConfig,
  McpServerStatus,
  OllamaModel,
  RuntimeHealth,
  SystemSnapshot,
} from "../../types";

interface TuneViewProps {
  tune: TuneState;
  activeRun?: ForgeRun;
  onChange: (patch: Partial<TuneState>) => void;
  onStart: () => void;
  onCancel: (jobId: string) => void;
}

export function TuneView({
  tune,
  activeRun,
  onChange,
  onStart,
  onCancel,
}: TuneViewProps) {
  const modelName = tune.modelPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  const effectiveBatch = tune.batchSize * tune.gradientAccumulation;

  function resetRecipe() {
    onChange(createDefaultTuneState());
  }

  async function browseDataset() {
    const selected = await forgeApi.dialog.chooseDataset();
    if (selected) onChange({ datasetPath: selected });
  }

  async function browseModel() {
    const selected = await forgeApi.dialog.chooseTrainingModel();
    if (selected) onChange({ modelPath: selected });
  }

  return (
    <main className="tool-view tune-view">
      <header className="tool-header">
        <div>
          <span className="eyebrow">Adapter workshop</span>
          <h1>Tune</h1>
        </div>
        <span className="status-pill neutral">
          <Beaker size={13} /> {activeRun ? `${activeRun.progress}%` : "QLoRA"}
        </span>
      </header>
      <div className="tune-layout">
        <section className="tune-form">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Configuration</span>
              <h2>Training recipe</h2>
            </div>
            <button
              className="icon-button subtle"
              type="button"
              title="Reset recipe"
              aria-label="Reset recipe"
              onClick={resetRecipe}
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <div className="form-stack">
            <label>
              <span>Base model</span>
              <div className="compound-input">
                <input
                  value={tune.modelPath}
                  placeholder="Local Transformers model directory"
                  spellCheck={false}
                  onChange={(event) =>
                    onChange({ modelPath: event.target.value })
                  }
                />
                <button
                  type="button"
                  title="Browse base models"
                  aria-label="Browse base models"
                  onClick={() => void browseModel()}
                >
                  <FolderOpen size={15} />
                </button>
              </div>
            </label>
            <label>
              <span>Dataset</span>
              <div className="compound-input">
                <input
                  value={tune.datasetPath}
                  placeholder="JSONL, JSON, or CSV dataset"
                  spellCheck={false}
                  onChange={(event) =>
                    onChange({ datasetPath: event.target.value })
                  }
                />
                <button
                  type="button"
                  title="Browse datasets"
                  aria-label="Browse datasets"
                  onClick={() => void browseDataset()}
                >
                  <FolderOpen size={15} />
                </button>
              </div>
            </label>
            <div className="form-row two-column">
              <label>
                <span>Epochs</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={tune.epochs}
                  onChange={(event) =>
                    onChange({ epochs: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                <span>Max sequence</span>
                <select
                  value={tune.maxSequenceLength}
                  onChange={(event) =>
                    onChange({ maxSequenceLength: Number(event.target.value) })
                  }
                >
                  <option value="1024">1024</option>
                  <option value="2048">2048</option>
                  <option value="4096">4096</option>
                </select>
              </label>
            </div>
            <div className="form-row two-column">
              <label>
                <span>Learning rate</span>
                <select
                  value={tune.learningRate}
                  onChange={(event) =>
                    onChange({ learningRate: Number(event.target.value) })
                  }
                >
                  <option>0.0001</option>
                  <option>0.0002</option>
                  <option>0.0003</option>
                </select>
              </label>
              <label>
                <span>Batch / accumulation</span>
                <select
                  value={`${tune.batchSize}:${tune.gradientAccumulation}`}
                  onChange={(event) => {
                    const [batchSize, gradientAccumulation] = event.target.value
                      .split(":")
                      .map(Number);
                    onChange({ batchSize, gradientAccumulation });
                  }}
                >
                  <option value="1:8">1 / 8</option>
                  <option value="1:16">1 / 16</option>
                  <option value="2:8">2 / 8</option>
                </select>
              </label>
            </div>
            <label className="range-field">
              <span>
                <b>LoRA rank</b>
                <output>{tune.loraRank}</output>
              </span>
              <input
                type="range"
                min="4"
                max="64"
                step="4"
                value={tune.loraRank}
                onChange={(event) =>
                  onChange({ loraRank: Number(event.target.value) })
                }
              />
            </label>
            <label className="toggle-row">
              <span>
                <strong>4-bit quantization</strong>
                <small>NF4 with double quantization</small>
              </span>
              <input
                type="checkbox"
                checked={tune.use4Bit}
                onChange={(event) =>
                  onChange({ use4Bit: event.target.checked })
                }
              />
            </label>
            <label className="toggle-row">
              <span>
                <strong>Gradient checkpointing</strong>
                <small>Lower VRAM use, slower steps</small>
              </span>
              <input
                type="checkbox"
                checked={tune.gradientCheckpointing}
                onChange={(event) =>
                  onChange({ gradientCheckpointing: event.target.checked })
                }
              />
            </label>
          </div>
          <button
            className="primary-button train-button"
            type="button"
            disabled={!activeRun && (!tune.modelPath || !tune.datasetPath)}
            onClick={() => (activeRun ? onCancel(activeRun.id) : onStart())}
          >
            {activeRun ? <Square size={15} /> : <Play size={15} />}
            {activeRun ? `Cancel ${activeRun.progress}%` : "Start training"}
          </button>
        </section>
        <aside className="recipe-summary">
          <span className="summary-icon">
            <SlidersHorizontal size={22} />
          </span>
          <span className="eyebrow">Estimated profile</span>
          <h2>{modelName || "Choose a model"}</h2>
          <p>
            Local Transformers weights are trained into a standard PEFT adapter.
          </p>
          <dl>
            <div>
              <dt>Mode</dt>
              <dd>{tune.use4Bit ? "4-bit NF4" : "16-bit"}</dd>
            </div>
            <div>
              <dt>Adapter rank</dt>
              <dd>{tune.loraRank}</dd>
            </div>
            <div>
              <dt>Effective batch</dt>
              <dd>{effectiveBatch} samples</dd>
            </div>
            <div>
              <dt>Checkpoints</dt>
              <dd>{tune.epochs}</dd>
            </div>
          </dl>
          <div className="recipe-note">
            <Database size={15} />
            <span>
              {activeRun?.message ??
                "Adapter checkpoints are written to Local Forge outputs."}
            </span>
          </div>
        </aside>
      </div>
    </main>
  );
}

interface ActivityViewProps {
  runs: ForgeRun[];
  nsfwConsent: boolean;
  onCancel: (id: string) => void;
  onReveal: (outputPath: string) => void;
  onRemove: (id: string) => void;
  onRetry: (run: ForgeRun) => void;
  onOpenImage: (run: ForgeRun) => void;
}

function isNsfwRun(run: ForgeRun): boolean {
  const recipe = run.recipe;
  return Boolean(
    recipe?.kind === "image" &&
    (recipe.nsfwDefaults || hasNsfwModelTag(recipe.modelId, recipe.modelName)),
  );
}

function formatRunTime(value: string | undefined): string {
  if (!value) return "--";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? "--"
    : timestamp.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
}

function formatRunDuration(run: ForgeRun): string {
  const start = new Date(run.startedAt).getTime();
  const isActive = run.status === "queued" || run.status === "running";
  if (!run.completedAt && !isActive) return "--";
  const end = run.completedAt
    ? new Date(run.completedAt).getTime()
    : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "--";
  const seconds = Math.max(0, Math.floor((end - start) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes < 60
    ? `${minutes}m ${remainder}s`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function RunRecipe({ run }: { run: ForgeRun }) {
  const recipe = run.recipe;
  if (!recipe) return null;
  const fields =
    recipe.kind === "image"
      ? [
          ["Model", recipe.modelName],
          ["Size", `${recipe.width} x ${recipe.height}`],
          ["Steps", String(recipe.steps)],
          ["Guidance", String(recipe.guidance)],
          ["Seed", String(recipe.seed)],
          ...(recipe.faceFix
            ? [["Face Fix", `${recipe.faceFixStrength ?? 0.45} strength`]]
            : []),
          ...(recipe.upscale
            ? [["Upscale", `${recipe.upscaleFactor ?? 2}x`]]
            : []),
          ...(recipe.nsfwSegmentation
            ? [["NSFW segmentation", "Save detected-region masks"]]
            : []),
          ["Prompt", recipe.prompt],
          ...(recipe.negativePrompt
            ? [["Negative prompt", recipe.negativePrompt]]
            : []),
        ]
      : [
          ["Base model", recipe.modelPath],
          ["Dataset", recipe.datasetPath],
          ["Epochs", String(recipe.epochs)],
          ["Batch", String(recipe.batchSize * recipe.gradientAccumulation)],
          ["LoRA rank", String(recipe.loraRank)],
          ["Sequence", `${recipe.maxSequenceLength} tokens`],
          ["Precision", recipe.use4Bit ? "4-bit QLoRA" : "Full precision"],
        ];

  return (
    <section className="run-detail-section">
      <span className="eyebrow">Recipe</span>
      <dl className="run-recipe-grid">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ActivityView({
  runs,
  nsfwConsent,
  onCancel,
  onReveal,
  onRemove,
  onRetry,
  onOpenImage,
}: ActivityViewProps) {
  const [statusFilter, setStatusFilter] = useState<ForgeRun["status"] | "all">(
    "all",
  );
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [copiedRunId, setCopiedRunId] = useState<string | null>(null);
  const complete = runs.filter((run) => run.status === "complete").length;
  const drafts = runs.filter((run) => run.status === "draft").length;
  const active = runs.filter(
    (run) => run.status === "running" || run.status === "queued",
  ).length;
  const filteredRuns =
    statusFilter === "all"
      ? runs
      : runs.filter((run) => run.status === statusFilter);
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null;
  const selectedRunRestricted = Boolean(
    selectedRun && !nsfwConsent && isNsfwRun(selectedRun),
  );

  async function copyLogs(run: ForgeRun) {
    const entries = run.logs?.length
      ? run.logs
      : [
          {
            timestamp: run.completedAt ?? run.startedAt,
            kind: run.error ? ("error" as const) : ("status" as const),
            message: run.error ?? run.message ?? run.detail ?? "No log output.",
          },
        ];
    await navigator.clipboard.writeText(
      entries
        .map(
          (entry) =>
            `[${entry.timestamp}] ${entry.kind.toUpperCase()} ${entry.message}`,
        )
        .join("\n"),
    );
    setCopiedRunId(run.id);
  }

  return (
    <main className="tool-view activity-view">
      <header className="tool-header">
        <div>
          <span className="eyebrow">Jobs and benchmarks</span>
          <h1>Activity</h1>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void forgeApi.system.openOutputs()}
        >
          <Archive size={15} /> Open outputs
        </button>
      </header>
      <section className="activity-metrics">
        <div>
          <Activity size={18} />
          <span>
            <strong>{runs.length}</strong>
            <small>Total runs</small>
          </span>
        </div>
        <div>
          <Clock3 size={18} />
          <span>
            <strong>{drafts}</strong>
            <small>Drafts</small>
          </span>
        </div>
        <div>
          <CircleGauge size={18} />
          <span>
            <strong>{active}</strong>
            <small>Active</small>
          </span>
        </div>
        <div>
          <CheckCircle2 size={18} />
          <span>
            <strong>{complete}</strong>
            <small>Completed</small>
          </span>
        </div>
      </section>
      <section className="run-table-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Timeline</span>
            <h2>Runs</h2>
          </div>
          <label className="filter-button">
            <Settings2 size={14} />
            <span className="sr-only">Filter runs by status</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as ForgeRun["status"] | "all",
                )
              }
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="complete">Complete</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>
        <div
          className={`activity-workspace${selectedRun ? " has-detail" : ""}`}
        >
          <div className="run-table" role="table" aria-label="Local Forge runs">
            <div className="run-table-header" role="row">
              <span>Name</span>
              <span>Type</span>
              <span>Status</span>
              <span>Progress</span>
              <span>Started</span>
              <span />
            </div>
            {filteredRuns.map((run) => (
              <div
                className={`run-row${selectedRunId === run.id ? " selected" : ""}`}
                role="row"
                tabIndex={0}
                aria-label={`View details for ${run.name}`}
                key={run.id}
                onClick={() => setSelectedRunId(run.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedRunId(run.id);
                  }
                }}
              >
                <span>
                  <strong>{run.name}</strong>
                  <small>
                    {!nsfwConsent && isNsfwRun(run)
                      ? "Adult content hidden"
                      : (run.error ?? run.message ?? run.detail)}
                  </small>
                </span>
                <span className="run-kind">{run.kind}</span>
                <span className={`run-status ${run.status}`}>
                  {run.status === "failed" || run.status === "cancelled" ? (
                    <XCircle size={13} />
                  ) : run.status === "complete" ? (
                    <CheckCircle2 size={13} />
                  ) : (
                    <Clock3 size={13} />
                  )}
                  {run.status}
                </span>
                <span>
                  {run.status === "draft" ? (
                    <small>Awaiting executor</small>
                  ) : run.status === "failed" || run.status === "cancelled" ? (
                    <small>
                      {run.status === "failed"
                        ? "Stopped with error"
                        : "Stopped"}
                    </small>
                  ) : (
                    <>
                      <div className="meter">
                        <i style={{ width: `${run.progress}%` }} />
                      </div>
                      <small>{run.progress}%</small>
                    </>
                  )}
                </span>
                <span>
                  {new Date(run.startedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <ChevronRight className="run-row-chevron" size={14} />
              </div>
            ))}
            {filteredRuns.length === 0 && (
              <div className="empty-runs">
                <span>
                  <Activity size={22} />
                </span>
                <strong>
                  {runs.length === 0 ? "No runs yet" : "No matching runs"}
                </strong>
                <p>
                  {runs.length === 0
                    ? "Image generation and adapter training runs appear here."
                    : "Choose another status to see queued work."}
                </p>
              </div>
            )}
          </div>
          {selectedRun && (
            <aside className="run-detail-panel" aria-label="Run details">
              <header className="run-detail-header">
                <div>
                  <span className="eyebrow">{selectedRun.kind} run</span>
                  <h2>{selectedRun.name}</h2>
                </div>
                <button
                  className="icon-button subtle"
                  type="button"
                  title="Close details"
                  aria-label="Close run details"
                  onClick={() => setSelectedRunId(null)}
                >
                  <X size={15} />
                </button>
              </header>

              <div className="run-detail-summary">
                <span className={`run-status ${selectedRun.status}`}>
                  {selectedRun.status === "complete" ? (
                    <CheckCircle2 size={14} />
                  ) : selectedRun.status === "failed" ||
                    selectedRun.status === "cancelled" ? (
                    <XCircle size={14} />
                  ) : (
                    <Clock3 size={14} />
                  )}
                  {selectedRun.status}
                </span>
                <strong>{selectedRun.progress}%</strong>
              </div>

              {selectedRunRestricted && (
                <div className="run-output-preview restricted-output">
                  <span>Adult content hidden</span>
                </div>
              )}

              {!selectedRunRestricted &&
                selectedRun.kind === "image" &&
                selectedRun.outputUrl && (
                  <div className="run-output-preview">
                    <img src={selectedRun.outputUrl} alt={selectedRun.name} />
                  </div>
                )}

              {selectedRun.error && (
                <div className="run-error" role="alert">
                  <XCircle size={15} />
                  <span>{selectedRun.error}</span>
                </div>
              )}

              <dl className="run-detail-meta">
                <div>
                  <dt>Started</dt>
                  <dd>{formatRunTime(selectedRun.startedAt)}</dd>
                </div>
                <div>
                  <dt>Finished</dt>
                  <dd>{formatRunTime(selectedRun.completedAt)}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{formatRunDuration(selectedRun)}</dd>
                </div>
                <div>
                  <dt>Job ID</dt>
                  <dd title={selectedRun.id}>{selectedRun.id.slice(0, 8)}</dd>
                </div>
              </dl>

              {!selectedRunRestricted && selectedRun.outputPath && (
                <section className="run-detail-section">
                  <span className="eyebrow">Output</span>
                  <code className="run-output-path">
                    {selectedRun.outputPath}
                  </code>
                </section>
              )}

              {!selectedRunRestricted && <RunRecipe run={selectedRun} />}

              <section className="run-detail-section run-log-section">
                <header>
                  <div>
                    <span className="eyebrow">Console</span>
                    <h3>Logs</h3>
                  </div>
                  <button
                    className="icon-button subtle"
                    type="button"
                    title="Copy logs"
                    aria-label={`Copy logs for ${selectedRun.name}`}
                    onClick={() => void copyLogs(selectedRun)}
                  >
                    {copiedRunId === selectedRun.id ? (
                      <CopyCheck size={14} />
                    ) : (
                      <ClipboardCopy size={14} />
                    )}
                  </button>
                </header>
                <ol className="run-log-console" aria-label="Run log entries">
                  {(selectedRun.logs?.length
                    ? selectedRun.logs
                    : [
                        {
                          timestamp:
                            selectedRun.completedAt ?? selectedRun.startedAt,
                          kind: selectedRun.error
                            ? ("error" as const)
                            : ("status" as const),
                          message:
                            selectedRun.error ??
                            selectedRun.message ??
                            selectedRun.detail ??
                            "No log output.",
                        },
                      ]
                  ).map((entry, index) => (
                    <li
                      className={entry.kind}
                      key={`${entry.timestamp}-${index}`}
                    >
                      <time dateTime={entry.timestamp}>
                        {new Date(entry.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </time>
                      <span>{entry.message}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <footer className="run-detail-actions">
                {(selectedRun.status === "queued" ||
                  selectedRun.status === "running") && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => onCancel(selectedRun.id)}
                  >
                    <Square size={14} /> Cancel
                  </button>
                )}
                {!selectedRunRestricted && selectedRun.outputPath && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => onReveal(selectedRun.outputPath!)}
                  >
                    {selectedRun.kind === "image" ? (
                      <Images size={14} />
                    ) : (
                      <FolderOpen size={14} />
                    )}
                    {selectedRun.kind === "tune"
                      ? "Open adapter"
                      : "Show output"}
                  </button>
                )}
                {!selectedRunRestricted &&
                  selectedRun.kind === "image" &&
                  selectedRun.outputUrl && (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => onOpenImage(selectedRun)}
                    >
                      <Images size={14} /> Open in Studio
                    </button>
                  )}
                {!selectedRunRestricted &&
                  selectedRun.recipe &&
                  selectedRun.status !== "queued" &&
                  selectedRun.status !== "running" && (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => onRetry(selectedRun)}
                    >
                      <RotateCcw size={14} /> Run again
                    </button>
                  )}
                {selectedRun.status !== "queued" &&
                  selectedRun.status !== "running" && (
                    <button
                      className="secondary-button danger-button"
                      type="button"
                      onClick={() => {
                        onRemove(selectedRun.id);
                        setSelectedRunId(null);
                      }}
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  )}
              </footer>
            </aside>
          )}
        </div>
      </section>
    </main>
  );
}

interface SettingsViewProps {
  settings: ForgeSettings;
  health: RuntimeHealth;
  system: SystemSnapshot | null;
  models: OllamaModel[];
  onChange: (patch: Partial<ForgeSettings>) => void;
  onCheckRuntime: () => void;
}

const themes: Array<{
  id: ThemeId;
  name: string;
  description: string;
  colors: string[];
}> = [
  {
    id: "forge",
    name: "Foundry",
    description: "Ember, graphite, and cool mint",
    colors: ["#0C0E0C", "#20251F", "#FF7A32", "#72D4A8"],
  },
  {
    id: "slate",
    name: "Monolith",
    description: "Monochromatic slate and soft white",
    colors: ["#0F172A", "#1E293B", "#64748B", "#F1F5F9"],
  },
  {
    id: "current",
    name: "Current",
    description: "Electric blue flowing into cyan",
    colors: ["#07111D", "#2563EB", "#22D3EE", "#E2E8F0"],
  },
  {
    id: "radiant",
    name: "Radiant",
    description: "Violet energy with a pink edge",
    colors: ["#120D1D", "#8B5CF6", "#EC4899", "#F8F2FB"],
  },
  {
    id: "neon",
    name: "Neon Circuit",
    description: "Cyberpunk rose, indigo, and cyan",
    colors: ["#09090B", "#FB7185", "#818CF8", "#22D3EE"],
  },
  {
    id: "signal",
    name: "Signal",
    description: "Accessible cyan, blue, green, and red",
    colors: ["#0E7490", "#0369A1", "#15803D", "#B91C1C"],
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Soft-black violet and teal",
    colors: ["#020617", "#0F172A", "#A855F7", "#2DD4BF"],
  },
];

function pairsToText(value: Record<string, string>): string {
  return Object.entries(value)
    .map(([key, entry]) => `${key}=${entry}`)
    .join("\n");
}

function textToPairs(value: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const line of value.split("\n")) {
    const separator = line.indexOf("=");
    const key = (separator >= 0 ? line.slice(0, separator) : line).trim();
    if (!key) continue;
    pairs[key] = separator >= 0 ? line.slice(separator + 1) : "";
  }
  return pairs;
}

interface McpServerEditorProps {
  server: McpServerConfig;
  status?: McpServerStatus;
  testing: boolean;
  onChange: (patch: Partial<McpServerConfig>) => void;
  onRemove: () => void;
  onTest: () => void;
}

function McpServerEditor({
  server,
  status,
  testing,
  onChange,
  onRemove,
  onTest,
}: McpServerEditorProps) {
  const [args, setArgs] = useState(() => server.args.join("\n"));
  const [environment, setEnvironment] = useState(() => pairsToText(server.env));
  const [headers, setHeaders] = useState(() => pairsToText(server.headers));

  return (
    <div className="mcp-server">
      <div className="mcp-server-heading">
        <label>
          <span>Server name</span>
          <input
            value={server.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </label>
        <label className="mcp-enable">
          <span>{server.enabled ? "Enabled" : "Disabled"}</span>
          <input
            type="checkbox"
            checked={server.enabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
        </label>
        <button
          className="icon-button danger"
          type="button"
          title={`Remove ${server.name}`}
          aria-label={`Remove ${server.name}`}
          onClick={onRemove}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="mcp-transport" role="group" aria-label="Transport">
        <button
          className={server.transport === "stdio" ? "active" : ""}
          type="button"
          onClick={() => onChange({ transport: "stdio" })}
        >
          <Terminal size={14} /> Local process
        </button>
        <button
          className={server.transport === "http" ? "active" : ""}
          type="button"
          onClick={() => onChange({ transport: "http" })}
        >
          <Globe size={14} /> Streamable HTTP
        </button>
      </div>

      {server.transport === "stdio" ? (
        <div className="mcp-fields">
          <div className="form-row two-column">
            <label>
              Command
              <input
                value={server.command}
                placeholder="npx"
                spellCheck={false}
                onChange={(event) => onChange({ command: event.target.value })}
              />
            </label>
            <label>
              Working directory <small>Optional</small>
              <input
                value={server.cwd}
                placeholder="D:\\projects\\my-server"
                spellCheck={false}
                onChange={(event) => onChange({ cwd: event.target.value })}
              />
            </label>
          </div>
          <div className="form-row two-column">
            <label>
              Arguments <small>One per line</small>
              <textarea
                rows={4}
                value={args}
                placeholder={
                  "-y\n@modelcontextprotocol/server-filesystem\nD:\\notes"
                }
                spellCheck={false}
                onChange={(event) => {
                  setArgs(event.target.value);
                  onChange({
                    args: event.target.value
                      .split("\n")
                      .map((argument) => argument.trim())
                      .filter(Boolean),
                  });
                }}
              />
            </label>
            <label>
              Environment <small>KEY=value, one per line</small>
              <textarea
                rows={4}
                value={environment}
                placeholder="API_TOKEN=..."
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => {
                  setEnvironment(event.target.value);
                  onChange({ env: textToPairs(event.target.value) });
                }}
              />
            </label>
          </div>
          <p className="mcp-caution">
            Local process servers can access this computer with your account's
            permissions. Only enable commands you trust.
          </p>
        </div>
      ) : (
        <div className="mcp-fields">
          <label>
            Server URL
            <input
              value={server.url}
              placeholder="http://127.0.0.1:3000/mcp"
              inputMode="url"
              spellCheck={false}
              onChange={(event) => onChange({ url: event.target.value })}
            />
          </label>
          <label>
            Request headers <small>NAME=value, one per line</small>
            <textarea
              rows={3}
              value={headers}
              placeholder="Authorization=Bearer ..."
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => {
                setHeaders(event.target.value);
                onChange({ headers: textToPairs(event.target.value) });
              }}
            />
          </label>
          <p className="mcp-caution">
            Unencrypted HTTP is restricted to this machine. Remote servers must
            use HTTPS.
          </p>
        </div>
      )}

      <div className="mcp-server-footer">
        <button
          className="secondary-button"
          type="button"
          disabled={testing}
          onClick={onTest}
        >
          <Plug size={14} /> {testing ? "Connecting..." : "Test connection"}
        </button>
        {status && (
          <span
            className={`mcp-test-result ${status.state}`}
            role={status.state === "error" ? "alert" : undefined}
          >
            {status.state === "connected"
              ? `${status.serverName ?? server.name}${status.serverVersion ? ` ${status.serverVersion}` : ""} / ${status.tools.length} tool${status.tools.length === 1 ? "" : "s"}`
              : status.error}
          </span>
        )}
      </div>
      {status?.state === "connected" && status.tools.length > 0 && (
        <div className="mcp-tool-list" aria-label="Available tools">
          {status.tools.map((tool) => (
            <span key={tool.name} title={tool.description || tool.name}>
              <Wrench size={11} /> {tool.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function SettingsView({
  settings,
  health,
  system,
  models,
  onChange,
  onCheckRuntime,
}: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<
    "runtime" | "mcp" | "generation" | "interface" | "storage"
  >("runtime");
  const [mcpStatuses, setMcpStatuses] = useState<
    Record<string, McpServerStatus>
  >({});
  const [testingServer, setTestingServer] = useState("");

  function addMcpServer() {
    const server: McpServerConfig = {
      id: crypto.randomUUID(),
      name: "MCP server",
      enabled: false,
      transport: "stdio",
      command: "npx",
      args: [],
      cwd: "",
      env: {},
      url: "http://127.0.0.1:3000/mcp",
      headers: {},
    };
    onChange({ mcpServers: [...settings.mcpServers, server] });
  }

  function updateMcpServer(id: string, patch: Partial<McpServerConfig>) {
    setMcpStatuses((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    const connectionChanged = Object.keys(patch).some(
      (key) => key !== "name" && key !== "enabled",
    );
    if (patch.enabled === false || connectionChanged) {
      void forgeApi.mcp.disconnectServer(id);
    }
    onChange({
      mcpServers: settings.mcpServers.map((server) =>
        server.id === id ? { ...server, ...patch } : server,
      ),
    });
  }

  async function testServer(server: McpServerConfig) {
    setTestingServer(server.id);
    const status = await forgeApi.mcp.testServer(server);
    setMcpStatuses((current) => ({ ...current, [server.id]: status }));
    setTestingServer("");
  }

  function removeMcpServer(id: string) {
    void forgeApi.mcp.disconnectServer(id);
    onChange({
      mcpServers: settings.mcpServers.filter((server) => server.id !== id),
    });
  }

  async function browsePython() {
    const selected = await forgeApi.dialog.choosePython();
    if (selected) onChange({ pythonPath: selected });
  }

  async function browseUpscalerModel() {
    const selected = await forgeApi.dialog.chooseUpscalerModel();
    if (selected) onChange({ upscalerModelPath: selected });
  }

  async function browseFaceDetectorModel() {
    const selected = await forgeApi.dialog.chooseFaceDetectorModel();
    if (selected) onChange({ faceDetectorModelPath: selected });
  }

  async function browseNsfwSegmenterModels() {
    const selected = await forgeApi.dialog.chooseNsfwSegmenterModels();
    if (selected) onChange({ nsfwSegmenterModelPath: selected });
  }

  return (
    <main className="tool-view settings-view">
      <header className="tool-header">
        <div>
          <span className="eyebrow">Application</span>
          <h1>Settings</h1>
        </div>
        <span className="autosave-label">
          <Save size={14} /> Saved locally
        </span>
      </header>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <button
            className={activeSection === "runtime" ? "active" : ""}
            type="button"
            onClick={() => setActiveSection("runtime")}
          >
            <Server size={15} /> Runtimes
          </button>
          <button
            className={activeSection === "generation" ? "active" : ""}
            type="button"
            onClick={() => setActiveSection("generation")}
          >
            <SlidersHorizontal size={15} /> Generation
          </button>
          <button
            className={activeSection === "mcp" ? "active" : ""}
            type="button"
            onClick={() => setActiveSection("mcp")}
          >
            <Plug size={15} /> MCP servers
          </button>
          <button
            className={activeSection === "interface" ? "active" : ""}
            type="button"
            onClick={() => setActiveSection("interface")}
          >
            <Settings2 size={15} /> Interface
          </button>
          <button
            className={activeSection === "storage" ? "active" : ""}
            type="button"
            onClick={() => setActiveSection("storage")}
          >
            <Archive size={15} /> Storage
          </button>
        </nav>
        <div className="settings-content">
          {activeSection === "runtime" && (
            <>
              <section className="settings-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Inference</span>
                    <h2>Ollama runtime</h2>
                  </div>
                  <span
                    className={`status-pill ${health.online ? "success" : "danger"}`}
                  >
                    <span className="status-dot" />
                    {health.online ? "Connected" : "Offline"}
                  </span>
                </div>
                <div className="settings-fields">
                  <label>
                    <span>Runtime address</span>
                    <div className="compound-input">
                      <input
                        value={settings.ollamaUrl}
                        onChange={(event) =>
                          onChange({ ollamaUrl: event.target.value })
                        }
                      />
                      <button type="button" onClick={onCheckRuntime}>
                        Test
                      </button>
                    </div>
                  </label>
                </div>
              </section>
              <section className="settings-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Local jobs</span>
                    <h2>Python runtime</h2>
                  </div>
                </div>
                <div className="settings-fields">
                  <label>
                    <span>Python executable</span>
                    <div className="compound-input">
                      <input
                        value={settings.pythonPath}
                        spellCheck={false}
                        onChange={(event) =>
                          onChange({ pythonPath: event.target.value })
                        }
                      />
                      <button
                        type="button"
                        title="Browse Python executables"
                        aria-label="Browse Python executables"
                        onClick={() => void browsePython()}
                      >
                        <FolderOpen size={15} />
                      </button>
                    </div>
                  </label>
                  <p className="mcp-caution">
                    Install the packaged image or training requirements into
                    this environment. Local Forge never installs packages or
                    downloads models automatically.
                  </p>
                </div>
              </section>
              <section className="settings-section diagnostics-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">System</span>
                    <h2>Diagnostics</h2>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>GPU</dt>
                    <dd>{system?.gpu.name ?? "Checking..."}</dd>
                  </div>
                  <div>
                    <dt>VRAM</dt>
                    <dd>
                      {system?.source === "preview"
                        ? "Preview only"
                        : system?.gpu.available
                          ? `${(system.gpu.memoryTotalMb / 1024).toFixed(1)} GB`
                          : "Unavailable"}
                    </dd>
                  </div>
                  <div>
                    <dt>Platform</dt>
                    <dd>
                      {system ? `${system.platform} / ${system.arch}` : "--"}
                    </dd>
                  </div>
                  <div>
                    <dt>Runtime</dt>
                    <dd>{health.version ?? "Not detected"}</dd>
                  </div>
                  <div>
                    <dt>Hardware source</dt>
                    <dd>
                      {!system
                        ? "Checking..."
                        : system.source === "preview"
                          ? "Preview"
                          : "Live host"}
                    </dd>
                  </div>
                </dl>
              </section>
            </>
          )}
          {activeSection === "generation" && (
            <>
              <section className="settings-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Content access</span>
                    <h2>Adult content</h2>
                  </div>
                </div>
                <label className="toggle-row">
                  <span>
                    <strong>Allow NSFW content</strong>
                    <small>
                      I confirm I am an adult and consent to viewing and
                      generating NSFW content on this device
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    aria-label="Allow NSFW content"
                    checked={settings.nsfwConsent}
                    onChange={(event) =>
                      onChange({ nsfwConsent: event.target.checked })
                    }
                  />
                </label>
                <p className="settings-description">
                  This reveals adult model and prompt controls in Studio. It
                  does not download models or enable them automatically.
                </p>
              </section>
              <section className="settings-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Defaults</span>
                    <h2>Text generation</h2>
                  </div>
                </div>
                <div className="settings-fields">
                  <label>
                    <span>Default model</span>
                    <select
                      value={settings.selectedModel}
                      onChange={(event) =>
                        onChange({ selectedModel: event.target.value })
                      }
                    >
                      <option value="">First available</option>
                      {models.map((model) => (
                        <option key={model.name}>{model.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Context window</span>
                    <select
                      value={settings.contextLength}
                      onChange={(event) =>
                        onChange({ contextLength: Number(event.target.value) })
                      }
                    >
                      <option value="4096">4K tokens</option>
                      <option value="8192">8K tokens</option>
                      <option value="16384">16K tokens</option>
                      <option value="32768">32K tokens</option>
                    </select>
                  </label>
                  <label className="range-field">
                    <span>
                      <b>Default temperature</b>
                      <output>{settings.temperature.toFixed(1)}</output>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={settings.temperature}
                      onChange={(event) =>
                        onChange({ temperature: Number(event.target.value) })
                      }
                    />
                  </label>
                </div>
              </section>
              <section className="settings-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Studio</span>
                    <h2>Image enhancement models</h2>
                  </div>
                </div>
                <div className="settings-fields">
                  <label>
                    <span>ESRGAN upscaler</span>
                    <div className="compound-input">
                      <input
                        value={settings.upscalerModelPath}
                        placeholder="4x-UltraSharp.pth"
                        spellCheck={false}
                        onChange={(event) =>
                          onChange({ upscalerModelPath: event.target.value })
                        }
                      />
                      <button
                        type="button"
                        title="Browse upscaler models"
                        aria-label="Browse upscaler models"
                        onClick={() => void browseUpscalerModel()}
                      >
                        <FolderOpen size={15} />
                      </button>
                    </div>
                  </label>
                  <label>
                    <span>YOLO face detector</span>
                    <div className="compound-input">
                      <input
                        value={settings.faceDetectorModelPath}
                        placeholder="face-detector.pt"
                        spellCheck={false}
                        onChange={(event) =>
                          onChange({
                            faceDetectorModelPath: event.target.value,
                          })
                        }
                      />
                      <button
                        type="button"
                        title="Browse face detector models"
                        aria-label="Browse face detector models"
                        onClick={() => void browseFaceDetectorModel()}
                      >
                        <FolderOpen size={15} />
                      </button>
                    </div>
                  </label>
                  {settings.nsfwConsent && (
                    <label>
                      <span>NSFW segmentation models</span>
                      <div className="compound-input">
                        <input
                          value={settings.nsfwSegmenterModelPath}
                          placeholder="nsfw_segmentation"
                          spellCheck={false}
                          onChange={(event) =>
                            onChange({
                              nsfwSegmenterModelPath: event.target.value,
                            })
                          }
                        />
                        <button
                          type="button"
                          title="Browse NSFW segmentation models"
                          aria-label="Browse NSFW segmentation models"
                          onClick={() => void browseNsfwSegmenterModels()}
                        >
                          <FolderOpen size={15} />
                        </button>
                      </div>
                    </label>
                  )}
                  <p className="mcp-caution">
                    Install actions download pinned, checksum-verified weights
                    to Local Forge storage. You can also choose compatible local
                    files manually.
                  </p>
                </div>
              </section>
            </>
          )}
          {activeSection === "mcp" && (
            <section className="settings-section mcp-settings">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Integrations</span>
                  <h2>Model Context Protocol</h2>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={addMcpServer}
                >
                  <Plus size={14} /> Add server
                </button>
              </div>
              <p className="settings-description">
                Connect local tools and trusted services. Local Forge asks
                before every tool call.
              </p>
              {settings.mcpServers.length === 0 ? (
                <div className="mcp-empty">
                  <Plug size={20} />
                  <strong>No MCP servers configured</strong>
                  <span>Add a local process or Streamable HTTP endpoint.</span>
                </div>
              ) : (
                <div className="mcp-server-list">
                  {settings.mcpServers.map((server) => (
                    <McpServerEditor
                      key={server.id}
                      server={server}
                      status={mcpStatuses[server.id]}
                      testing={testingServer === server.id}
                      onChange={(patch) => updateMcpServer(server.id, patch)}
                      onRemove={() => removeMcpServer(server.id)}
                      onTest={() => void testServer(server)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
          {activeSection === "interface" && (
            <section className="settings-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Interface</span>
                  <h2>Workspace behavior</h2>
                </div>
              </div>
              <fieldset className="theme-picker">
                <legend>Theme</legend>
                <div className="theme-grid">
                  {themes.map((theme) => (
                    <label
                      className={settings.theme === theme.id ? "active" : ""}
                      key={theme.id}
                    >
                      <input
                        type="radio"
                        name="theme"
                        value={theme.id}
                        checked={settings.theme === theme.id}
                        onChange={() => onChange({ theme: theme.id })}
                      />
                      <span className="theme-swatches" aria-hidden="true">
                        {theme.colors.map((color) => (
                          <i key={color} style={{ background: color }} />
                        ))}
                      </span>
                      <span>
                        <strong>{theme.name}</strong>
                        <small>{theme.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="toggle-row">
                <span>
                  <strong>Compact density</strong>
                  <small>Fit more sessions and controls on screen</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.compactMode}
                  onChange={(event) =>
                    onChange({ compactMode: event.target.checked })
                  }
                />
              </label>
              <label className="toggle-row">
                <span>
                  <strong>Reduce motion</strong>
                  <small>Disable non-essential transitions</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.reduceMotion}
                  onChange={(event) =>
                    onChange({ reduceMotion: event.target.checked })
                  }
                />
              </label>
            </section>
          )}
          {activeSection === "storage" && (
            <section className="settings-section diagnostics-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">On device</span>
                  <h2>Local files</h2>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void forgeApi.system.openOutputs()}
                >
                  <FolderOpen size={14} /> Open outputs
                </button>
              </div>
              <dl>
                <div>
                  <dt>Workspace</dt>
                  <dd>Automatic local save</dd>
                </div>
                <div>
                  <dt>Outputs</dt>
                  <dd>Managed folder</dd>
                </div>
                <div>
                  <dt>Cloud sync</dt>
                  <dd>Disabled</dd>
                </div>
              </dl>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
