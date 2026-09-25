export type AppView =
  | "workbench"
  | "studio"
  | "library"
  | "models"
  | "tune"
  | "activity"
  | "settings";

export type MessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  images?: string[];
}

export interface ChatRequest {
  requestId: string;
  baseUrl: string;
  model: string;
  messages: Pick<ChatMessage, "role" | "content" | "images">[];
  options?: {
    temperature?: number;
    numCtx?: number;
    seed?: number;
  };
  mcpServers?: McpServerConfig[];
}

export type VisionDescribeMode = "description" | "prompt";

export interface VisionDescribeRequest {
  baseUrl: string;
  model: string;
  imageUrl: string;
  mode: VisionDescribeMode;
}

export interface VisionDescribeResult {
  text: string;
  model: string;
  mode: VisionDescribeMode;
}

export interface McpServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  transport: "stdio" | "http";
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface McpServerStatus {
  serverId: string;
  state: "connected" | "error";
  serverName?: string;
  serverVersion?: string;
  tools: McpTool[];
  error?: string;
}

export interface McpToolCallRequest {
  requestId: string;
  callId: string;
  serverId: string;
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  destructive: boolean;
  openWorld: boolean;
}

export interface McpToolDecision {
  requestId: string;
  callId: string;
  approved: boolean;
}

export interface ChatStreamEvent {
  requestId: string;
  type:
    | "content"
    | "done"
    | "error"
    | "mcp-status"
    | "tool-approval"
    | "tool-start"
    | "tool-result";
  content?: string;
  error?: string;
  stats?: {
    totalDurationMs: number;
    promptTokens: number;
    outputTokens: number;
    tokensPerSecond: number;
  };
  serverStatus?: McpServerStatus;
  toolCall?: McpToolCallRequest;
  toolResult?: {
    callId: string;
    serverName: string;
    toolName: string;
    status: "completed" | "denied" | "error";
    summary?: string;
  };
}

export interface PullRequest {
  requestId: string;
  baseUrl: string;
  model: string;
}

export interface PullStreamEvent {
  requestId: string;
  status: string;
  digest?: string;
  completed?: number;
  total?: number;
  error?: string;
}

export interface RuntimeHealth {
  online: boolean;
  latencyMs: number;
  version?: string;
  error?: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  modifiedAt: string;
  family: string;
  parameterSize: string;
  quantization: string;
}

export interface GpuSnapshot {
  available: boolean;
  name: string;
  memoryTotalMb: number;
  memoryUsedMb: number;
  utilization: number;
  temperature: number;
  driverVersion: string;
  error?: string;
}

export interface SystemSnapshot {
  source: "host" | "preview";
  platform: string;
  arch: string;
  totalMemoryMb: number;
  freeMemoryMb: number;
  gpu: GpuSnapshot;
}

export interface AppInfo {
  version: string;
  platform: string;
  isPackaged: boolean;
}

export interface ImageAttachment {
  name: string;
  path: string;
  size: number;
  url: string;
  width: number;
  height: number;
}

export interface ImageModel {
  id: string;
  name: string;
  path: string;
  format: "diffusers" | "checkpoint";
  architecture: string;
  modifiedAt: string;
}

export interface EnhancementModelPaths {
  upscalerModelPath: string;
  faceDetectorModelPath: string;
  nsfwSegmenterModelPath: string;
}

export type EnhancementModelKind =
  | "upscaler"
  | "faceDetector"
  | "nsfwSegmenter";

export interface EnhancementInstallResult {
  kind: EnhancementModelKind;
  path: string;
}

export type ModelCatalogCategory = "chat" | "image" | "video" | "training";
export type ModelCatalogSource = "ollama" | "huggingface";
export type ModelCatalogRuntime =
  | "ollama"
  | "diffusers"
  | "transformers"
  | "none";
export type ModelCompatibility =
  | "recommended"
  | "supported"
  | "tight"
  | "unsupported"
  | "catalog-only";

export interface ModelCatalogItem {
  id: string;
  name: string;
  source: ModelCatalogSource;
  category: ModelCatalogCategory;
  runtime: ModelCatalogRuntime;
  pipeline: string;
  architecture: string;
  description: string;
  url: string;
  pullTag?: string;
  sizeBytes?: number;
  parameters?: number;
  downloads?: number;
  likes?: number;
  updatedAt?: string;
  gated: boolean;
  verified: boolean;
  compatibility: ModelCompatibility;
  compatibilityLabel: string;
  compatibilityReason: string;
  tags: string[];
}

export interface ModelCatalogResponse {
  items: ModelCatalogItem[];
  fetchedAt: string;
  system: SystemSnapshot;
  warnings: string[];
}

export interface ImageGenerationRequest {
  jobId: string;
  pythonPath: string;
  model: ImageModel;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  guidance: number;
  seed: number;
  faceFix: boolean;
  faceFixStrength: number;
  faceDetectorModelPath: string;
  upscale: boolean;
  upscaleFactor: 2 | 4;
  upscalerModelPath: string;
  nsfwSegmentation: boolean;
  nsfwSegmenterModelPath: string;
}

export interface TrainingRequest {
  jobId: string;
  pythonPath: string;
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

export type JobKind = "image" | "tune";

export type JobEvent = {
  jobId: string;
  kind: JobKind;
  type:
    | "queued"
    | "status"
    | "progress"
    | "preview"
    | "log"
    | "done"
    | "error"
    | "cancelled";
  progress?: number;
  step?: number;
  total?: number;
  message?: string;
  outputPath?: string;
  outputUrl?: string;
  width?: number;
  height?: number;
};

export interface ForgeApi {
  app: {
    info: () => Promise<AppInfo>;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
  storage: {
    loadWorkspace: () => Promise<unknown | null>;
    saveWorkspace: (value: unknown) => Promise<void>;
    deleteAttachment: (url: string) => Promise<void>;
  };
  ollama: {
    health: (baseUrl: string) => Promise<RuntimeHealth>;
    models: (baseUrl: string) => Promise<OllamaModel[]>;
    warmModel: (baseUrl: string, model: string) => Promise<void>;
    chat: (request: ChatRequest) => Promise<{ ok: boolean }>;
    cancelChat: (requestId: string) => Promise<void>;
    pull: (request: PullRequest) => Promise<{ ok: boolean }>;
    cancelPull: (requestId: string) => Promise<void>;
    onChatEvent: (callback: (event: ChatStreamEvent) => void) => () => void;
    onPullEvent: (callback: (event: PullStreamEvent) => void) => () => void;
  };
  vision: {
    describe: (request: VisionDescribeRequest) => Promise<VisionDescribeResult>;
  };
  catalog: {
    list: (refresh?: boolean) => Promise<ModelCatalogResponse>;
    open: (url: string) => Promise<void>;
  };
  enhancements: {
    discover: () => Promise<EnhancementModelPaths>;
    install: (kind: EnhancementModelKind) => Promise<EnhancementInstallResult>;
  };
  mcp: {
    testServer: (server: McpServerConfig) => Promise<McpServerStatus>;
    disconnectServer: (serverId: string) => Promise<void>;
    respondToToolCall: (decision: McpToolDecision) => Promise<void>;
  };
  jobs: {
    startImage: (request: ImageGenerationRequest) => Promise<{ ok: boolean }>;
    startTraining: (request: TrainingRequest) => Promise<{ ok: boolean }>;
    cancel: (jobId: string) => Promise<boolean>;
    revealOutput: (outputPath: string) => Promise<void>;
    onEvent: (callback: (event: JobEvent) => void) => () => void;
  };
  system: {
    snapshot: () => Promise<SystemSnapshot>;
    openOutputs: () => Promise<void>;
  };
  dialog: {
    chooseImages: () => Promise<ImageAttachment[]>;
    chooseImageModels: () => Promise<ImageModel[]>;
    chooseDataset: () => Promise<string | null>;
    choosePython: () => Promise<string | null>;
    chooseTrainingModel: () => Promise<string | null>;
    chooseUpscalerModel: () => Promise<string | null>;
    chooseFaceDetectorModel: () => Promise<string | null>;
    chooseNsfwSegmenterModels: () => Promise<string | null>;
  };
}
