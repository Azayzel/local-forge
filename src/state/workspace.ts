import type {
  AppView,
  ChatMessage,
  ImageModel,
  McpServerConfig,
} from "../types";

export type ThemeId =
  | "forge"
  | "slate"
  | "current"
  | "radiant"
  | "neon"
  | "signal"
  | "midnight";

export interface Thread {
  id: string;
  title: string;
  updatedAt: string;
  model: string;
  pinned: boolean;
  messages: ChatMessage[];
}

export interface ForgeRun {
  id: string;
  kind: "chat" | "image" | "tune" | "benchmark";
  name: string;
  status: "draft" | "queued" | "running" | "complete" | "failed" | "cancelled";
  progress: number;
  startedAt: string;
  detail?: string;
  message?: string;
  error?: string;
  outputPath?: string;
  outputUrl?: string;
  completedAt?: string;
  recipe?: ImageRunRecipe | TuneRunRecipe;
  logs?: ForgeRunLog[];
}

export interface ForgeRunLog {
  timestamp: string;
  kind: "status" | "log" | "error" | "success";
  message: string;
}

export interface ImageRunRecipe {
  kind: "image";
  modelId: string;
  modelName: string;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  guidance: number;
  seed: number;
  faceFix?: boolean;
  faceFixStrength?: number;
  upscale?: boolean;
  upscaleFactor?: 2 | 4;
  nsfwSegmentation?: boolean;
}

export interface TuneRunRecipe {
  kind: "tune";
  modelPath: string;
  datasetPath: string;
  epochs: number;
  batchSize: number;
  gradientAccumulation: number;
  learningRate: number;
  loraRank: number;
  maxSequenceLength: number;
  use4Bit: boolean;
  gradientCheckpointing: boolean;
}

export interface StudioState {
  preset: string;
  prompt: string;
  negativePrompt: string;
  model: string;
  width: number;
  height: number;
  steps: number;
  guidance: number;
  seed: number;
  faceFix: boolean;
  faceFixStrength: number;
  upscale: boolean;
  upscaleFactor: 2 | 4;
  nsfwSegmentation: boolean;
  activeAsset: string;
}

export interface TuneState {
  modelPath: string;
  datasetPath: string;
  epochs: number;
  batchSize: number;
  gradientAccumulation: number;
  learningRate: number;
  loraRank: number;
  maxSequenceLength: number;
  use4Bit: boolean;
  gradientCheckpointing: boolean;
}

export interface LibraryAsset {
  id: string;
  src: string;
  title: string;
  source: "sample" | "imported" | "generated";
  width: number;
  height: number;
  createdAt: string;
  prompt: string;
  outputPath?: string;
}

export interface ForgeSettings {
  ollamaUrl: string;
  pythonPath: string;
  upscalerModelPath: string;
  faceDetectorModelPath: string;
  nsfwSegmenterModelPath: string;
  selectedModel: string;
  temperature: number;
  contextLength: number;
  reduceMotion: boolean;
  compactMode: boolean;
  theme: ThemeId;
  mcpServers: McpServerConfig[];
  mcpToolApproval: "always-ask";
}

export interface WorkspaceState {
  version: 3;
  activeView: AppView;
  activeThreadId: string;
  threads: Thread[];
  runs: ForgeRun[];
  imageModels: ImageModel[];
  assets: LibraryAsset[];
  studio: StudioState;
  tune: TuneState;
  settings: ForgeSettings;
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createThread(title = "Untitled session"): Thread {
  return {
    id: createId("thread"),
    title,
    updatedAt: new Date().toISOString(),
    model: "",
    pinned: false,
    messages: [],
  };
}

export function createDefaultStudioState(): StudioState {
  return {
    preset: "Editorial",
    prompt:
      "Editorial portrait of an industrial designer in a sunlit workshop, tactile materials, quiet confidence",
    negativePrompt:
      "text, watermark, oversaturated, distorted hands, duplicate objects",
    model: "",
    width: 1024,
    height: 1024,
    steps: 24,
    guidance: 5.5,
    seed: 184729,
    faceFix: false,
    faceFixStrength: 0.45,
    upscale: false,
    upscaleFactor: 2,
    nsfwSegmentation: false,
    activeAsset: "/demo/forge-01.jpg",
  };
}

export function createDefaultTuneState(): TuneState {
  return {
    modelPath: "",
    datasetPath: "",
    epochs: 3,
    batchSize: 1,
    gradientAccumulation: 8,
    learningRate: 0.0002,
    loraRank: 16,
    maxSequenceLength: 2048,
    use4Bit: true,
    gradientCheckpointing: true,
  };
}

export function createDefaultAssets(): LibraryAsset[] {
  return [
    {
      id: "sample-neon-observer",
      src: "/demo/forge-01.jpg",
      title: "Neon observer",
      source: "sample",
      width: 1200,
      height: 1800,
      createdAt: "Bundled sample",
      prompt:
        "A person immersed in a luminous virtual environment, editorial photography.",
    },
    {
      id: "sample-quiet-geometry",
      src: "/demo/forge-02.jpg",
      title: "Quiet geometry",
      source: "sample",
      width: 1200,
      height: 800,
      createdAt: "Bundled sample",
      prompt:
        "Contemporary residential geometry in soft overcast light, architectural study.",
    },
    {
      id: "sample-material-study",
      src: "/demo/forge-03.jpg",
      title: "Material study",
      source: "sample",
      width: 1200,
      height: 800,
      createdAt: "Bundled sample",
      prompt:
        "Painterly material palette, tactile pigment, close editorial crop.",
    },
    {
      id: "sample-open-country",
      src: "/demo/forge-04.jpg",
      title: "Open country",
      source: "sample",
      width: 1200,
      height: 1800,
      createdAt: "Bundled sample",
      prompt:
        "Wide landscape with a single figure, natural morning haze, documentary tone.",
    },
  ];
}

export function createDefaultWorkspace(): WorkspaceState {
  const thread = createThread();
  return {
    version: 3,
    activeView: "workbench",
    activeThreadId: thread.id,
    threads: [thread],
    runs: [],
    imageModels: [],
    assets: createDefaultAssets(),
    studio: createDefaultStudioState(),
    tune: createDefaultTuneState(),
    settings: {
      ollamaUrl: "http://127.0.0.1:11434",
      pythonPath: "python",
      upscalerModelPath: "",
      faceDetectorModelPath: "",
      nsfwSegmenterModelPath: "",
      selectedModel: "",
      temperature: 0.7,
      contextLength: 8192,
      reduceMotion: false,
      compactMode: false,
      theme: "forge",
      mcpServers: [],
      mcpToolApproval: "always-ask",
    },
  };
}

function normalizeMcpServers(value: unknown): McpServerConfig[] {
  if (!Array.isArray(value)) return [];
  return value.filter((server): server is McpServerConfig =>
    Boolean(
      server &&
      typeof server.id === "string" &&
      typeof server.name === "string" &&
      typeof server.enabled === "boolean" &&
      (server.transport === "stdio" || server.transport === "http") &&
      typeof server.command === "string" &&
      Array.isArray(server.args) &&
      server.args.every((argument) => typeof argument === "string") &&
      typeof server.cwd === "string" &&
      server.env &&
      typeof server.env === "object" &&
      typeof server.url === "string" &&
      server.headers &&
      typeof server.headers === "object",
    ),
  );
}

const MAX_RUN_LOGS = 200;

export function appendRunLog(
  logs: ForgeRunLog[] | undefined,
  entry: ForgeRunLog,
): ForgeRunLog[] {
  return [...(logs ?? []), entry].slice(-MAX_RUN_LOGS);
}

function normalizeRunLogs(value: unknown): ForgeRunLog[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is ForgeRunLog =>
      Boolean(
        entry &&
        typeof entry.timestamp === "string" &&
        typeof entry.message === "string" &&
        ["status", "log", "error", "success"].includes(entry.kind),
      ),
    )
    .slice(-MAX_RUN_LOGS);
}

export function normalizeWorkspace(value: unknown): WorkspaceState {
  const fallback = createDefaultWorkspace();
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fallback;

  const candidate = value as Partial<Omit<WorkspaceState, "version">> & {
    version?: number;
  };
  if (
    (candidate.version !== 1 &&
      candidate.version !== 2 &&
      candidate.version !== 3) ||
    !Array.isArray(candidate.threads)
  )
    return fallback;

  const threads = candidate.threads.filter((thread): thread is Thread =>
    Boolean(
      thread &&
      typeof thread.id === "string" &&
      typeof thread.title === "string" &&
      Array.isArray(thread.messages),
    ),
  );
  if (threads.length === 0) threads.push(createThread());

  const runs = Array.isArray(candidate.runs)
    ? candidate.runs.map((run) => {
        const normalized = { ...run, logs: normalizeRunLogs(run.logs) };
        return candidate.version < 3 &&
          run.status === "queued" &&
          (run.kind === "image" || run.kind === "tune")
          ? { ...normalized, status: "draft" as const, progress: 0 }
          : candidate.version === 3 &&
              (run.status === "queued" || run.status === "running") &&
              (run.kind === "image" || run.kind === "tune")
            ? {
                ...normalized,
                status: "failed" as const,
                error: "Interrupted when Local Forge closed.",
                logs: appendRunLog(normalized.logs, {
                  timestamp: new Date().toISOString(),
                  kind: "error",
                  message: "Interrupted when Local Forge closed.",
                }),
              }
            : normalized;
      })
    : [];
  const imageModels = Array.isArray(candidate.imageModels)
    ? candidate.imageModels.filter((model): model is ImageModel =>
        Boolean(
          model &&
          typeof model.id === "string" &&
          typeof model.name === "string" &&
          typeof model.path === "string",
        ),
      )
    : [];
  const assets = Array.isArray(candidate.assets)
    ? candidate.assets.filter((asset): asset is LibraryAsset =>
        Boolean(
          asset &&
          typeof asset.id === "string" &&
          typeof asset.src === "string" &&
          typeof asset.title === "string",
        ),
      )
    : fallback.assets;
  const studio = { ...fallback.studio, ...candidate.studio };
  const tune = { ...fallback.tune, ...candidate.tune };
  if (studio.model === "Flux.1 Schnell") studio.model = "";

  return {
    ...fallback,
    ...candidate,
    version: 3,
    activeThreadId: threads.some(
      (thread) => thread.id === candidate.activeThreadId,
    )
      ? candidate.activeThreadId!
      : threads[0].id,
    threads,
    runs,
    imageModels,
    assets,
    studio,
    tune,
    settings: {
      ...fallback.settings,
      ...candidate.settings,
      pythonPath:
        typeof candidate.settings?.pythonPath === "string" &&
        candidate.settings.pythonPath.trim()
          ? candidate.settings.pythonPath
          : fallback.settings.pythonPath,
      theme:
        candidate.settings?.theme &&
        [
          "forge",
          "slate",
          "current",
          "radiant",
          "neon",
          "signal",
          "midnight",
        ].includes(candidate.settings.theme)
          ? candidate.settings.theme
          : fallback.settings.theme,
      mcpServers: normalizeMcpServers(candidate.settings?.mcpServers),
      mcpToolApproval: "always-ask",
    },
  };
}

export function titleFromPrompt(prompt: string): string {
  const clean = prompt.trim().replace(/\s+/g, " ");
  if (!clean) return "Untitled session";
  return clean.length > 42 ? `${clean.slice(0, 39)}...` : clean;
}
