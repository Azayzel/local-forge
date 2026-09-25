import { contextBridge, ipcRenderer } from "electron";
import type {
  AppInfo,
  ChatRequest,
  ChatStreamEvent,
  EnhancementInstallResult,
  EnhancementModelKind,
  EnhancementModelPaths,
  ForgeApi,
  ImageAttachment,
  ImageGenerationRequest,
  ImageModel,
  JobEvent,
  McpServerConfig,
  McpServerStatus,
  McpToolDecision,
  ModelCatalogResponse,
  OllamaModel,
  PullRequest,
  PullStreamEvent,
  RuntimeHealth,
  SystemSnapshot,
  TrainingRequest,
  VisionDescribeRequest,
  VisionDescribeResult,
} from "../src/types";

function subscribe<T>(
  channel: string,
  callback: (event: T) => void,
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) =>
    callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: ForgeApi = {
  app: {
    info: () => ipcRenderer.invoke("app:info") as Promise<AppInfo>,
  },
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
  },
  storage: {
    loadWorkspace: () =>
      ipcRenderer.invoke("storage:load-workspace") as Promise<unknown>,
    saveWorkspace: (value: unknown) =>
      ipcRenderer.invoke("storage:save-workspace", value),
    deleteAttachment: (url: string) =>
      ipcRenderer.invoke("storage:delete-attachment", url),
  },
  ollama: {
    health: (baseUrl: string) =>
      ipcRenderer.invoke("ollama:health", baseUrl) as Promise<RuntimeHealth>,
    models: (baseUrl: string) =>
      ipcRenderer.invoke("ollama:models", baseUrl) as Promise<OllamaModel[]>,
    warmModel: (baseUrl: string, model: string) =>
      ipcRenderer.invoke("ollama:warm-model", baseUrl, model) as Promise<void>,
    chat: (request: ChatRequest) =>
      ipcRenderer.invoke("ollama:chat", request) as Promise<{ ok: boolean }>,
    cancelChat: (requestId: string) =>
      ipcRenderer.invoke("ollama:cancel-chat", requestId),
    pull: (request: PullRequest) =>
      ipcRenderer.invoke("ollama:pull", request) as Promise<{ ok: boolean }>,
    cancelPull: (requestId: string) =>
      ipcRenderer.invoke("ollama:cancel-pull", requestId),
    onChatEvent: (callback: (event: ChatStreamEvent) => void) =>
      subscribe("ollama:chat-event", callback),
    onPullEvent: (callback: (event: PullStreamEvent) => void) =>
      subscribe("ollama:pull-event", callback),
  },
  vision: {
    describe: (request: VisionDescribeRequest) =>
      ipcRenderer.invoke(
        "vision:describe",
        request,
      ) as Promise<VisionDescribeResult>,
  },
  catalog: {
    list: (refresh = false, includeNsfw = false) =>
      ipcRenderer.invoke(
        "catalog:list",
        refresh,
        includeNsfw,
      ) as Promise<ModelCatalogResponse>,
    open: (url: string) => ipcRenderer.invoke("catalog:open", url),
  },
  enhancements: {
    discover: () =>
      ipcRenderer.invoke(
        "enhancements:discover",
      ) as Promise<EnhancementModelPaths>,
    install: (kind: EnhancementModelKind) =>
      ipcRenderer.invoke(
        "enhancements:install",
        kind,
      ) as Promise<EnhancementInstallResult>,
  },
  mcp: {
    testServer: (server: McpServerConfig) =>
      ipcRenderer.invoke("mcp:test-server", server) as Promise<McpServerStatus>,
    disconnectServer: (serverId: string) =>
      ipcRenderer.invoke("mcp:disconnect-server", serverId),
    respondToToolCall: (decision: McpToolDecision) =>
      ipcRenderer.invoke("mcp:tool-decision", decision),
  },
  jobs: {
    startImage: (request: ImageGenerationRequest) =>
      ipcRenderer.invoke("jobs:start-image", request) as Promise<{
        ok: boolean;
      }>,
    startTraining: (request: TrainingRequest) =>
      ipcRenderer.invoke("jobs:start-training", request) as Promise<{
        ok: boolean;
      }>,
    cancel: (jobId: string) =>
      ipcRenderer.invoke("jobs:cancel", jobId) as Promise<boolean>,
    revealOutput: (outputPath: string) =>
      ipcRenderer.invoke("jobs:reveal-output", outputPath),
    onEvent: (callback: (event: JobEvent) => void) =>
      subscribe("jobs:event", callback),
  },
  system: {
    snapshot: () =>
      ipcRenderer.invoke("system:snapshot") as Promise<SystemSnapshot>,
    openOutputs: () => ipcRenderer.invoke("system:open-outputs"),
  },
  dialog: {
    chooseImages: () =>
      ipcRenderer.invoke("dialog:choose-images") as Promise<ImageAttachment[]>,
    chooseImageModels: () =>
      ipcRenderer.invoke("dialog:choose-image-models") as Promise<ImageModel[]>,
    chooseDataset: () =>
      ipcRenderer.invoke("dialog:choose-dataset") as Promise<string | null>,
    choosePython: () =>
      ipcRenderer.invoke("dialog:choose-python") as Promise<string | null>,
    chooseTrainingModel: () =>
      ipcRenderer.invoke("dialog:choose-training-model") as Promise<
        string | null
      >,
    chooseUpscalerModel: () =>
      ipcRenderer.invoke("dialog:choose-upscaler-model") as Promise<
        string | null
      >,
    chooseFaceDetectorModel: () =>
      ipcRenderer.invoke("dialog:choose-face-detector-model") as Promise<
        string | null
      >,
    chooseNsfwSegmenterModels: () =>
      ipcRenderer.invoke("dialog:choose-nsfw-segmenter-models") as Promise<
        string | null
      >,
  },
};

contextBridge.exposeInMainWorld("forge", api);
