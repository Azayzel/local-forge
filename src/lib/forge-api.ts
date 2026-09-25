import type {
  ChatStreamEvent,
  ForgeApi,
  OllamaModel,
  PullStreamEvent,
} from "../types";

const chatListeners = new Set<(event: ChatStreamEvent) => void>();
const pullListeners = new Set<(event: PullStreamEvent) => void>();
const jobListeners = new Set<Parameters<ForgeApi["jobs"]["onEvent"]>[0]>();

const previewModels: OllamaModel[] = [
  {
    name: "qwen3:8b",
    size: 5_230_000_000,
    modifiedAt: new Date().toISOString(),
    family: "qwen3",
    parameterSize: "8.2B",
    quantization: "Q4_K_M",
  },
  {
    name: "llama3.2:3b",
    size: 2_020_000_000,
    modifiedAt: new Date(Date.now() - 86_400_000).toISOString(),
    family: "llama",
    parameterSize: "3.2B",
    quantization: "Q4_K_M",
  },
  {
    name: "gemma3:4b",
    size: 3_330_000_000,
    modifiedAt: new Date(Date.now() - 172_800_000).toISOString(),
    family: "gemma3",
    parameterSize: "4.3B",
    quantization: "Q4_K_M",
  },
];

function createBrowserApi(): ForgeApi {
  return {
    app: {
      info: async () => ({
        version: "0.1.0-preview",
        platform: "browser",
        isPackaged: false,
      }),
    },
    window: {
      minimize: () => undefined,
      maximize: () => undefined,
      close: () => undefined,
    },
    storage: {
      loadWorkspace: async () => {
        const stored = localStorage.getItem("local-forge-workspace");
        return stored ? (JSON.parse(stored) as unknown) : null;
      },
      saveWorkspace: async (value) => {
        localStorage.setItem("local-forge-workspace", JSON.stringify(value));
      },
      deleteAttachment: async () => undefined,
    },
    ollama: {
      health: async () => ({
        online: true,
        latencyMs: 8,
        version: "preview-runtime",
      }),
      models: async () => previewModels,
      chat: async (request) => {
        const response =
          "This browser preview is using a simulated local runtime. Launch the Electron app to stream a response from your installed Ollama models.";
        for (const token of response.split(/(\s+)/)) {
          await new Promise((resolve) => setTimeout(resolve, 18));
          for (const listener of chatListeners) {
            listener({
              requestId: request.requestId,
              type: "content",
              content: token,
            });
          }
        }
        for (const listener of chatListeners) {
          listener({
            requestId: request.requestId,
            type: "done",
            stats: {
              totalDurationMs: 740,
              promptTokens: 18,
              outputTokens: 24,
              tokensPerSecond: 32.4,
            },
          });
        }
        return { ok: true };
      },
      cancelChat: async () => undefined,
      pull: async (request) => {
        for (const listener of pullListeners) {
          listener({
            requestId: request.requestId,
            status: "Preview only",
            completed: 1,
            total: 1,
          });
        }
        return { ok: true };
      },
      cancelPull: async () => undefined,
      onChatEvent: (callback) => {
        chatListeners.add(callback);
        return () => chatListeners.delete(callback);
      },
      onPullEvent: (callback) => {
        pullListeners.add(callback);
        return () => pullListeners.delete(callback);
      },
    },
    vision: {
      describe: async (request) => ({
        text:
          request.mode === "prompt"
            ? "editorial portrait, natural window light, centered composition, tactile detail"
            : "An editorial portrait composed with natural window light and tactile detail.",
        model: request.model,
        mode: request.mode,
      }),
    },
    catalog: {
      list: async () => ({
        items: [],
        fetchedAt: new Date().toISOString(),
        system: {
          source: "preview",
          platform: "browser",
          arch: "unknown",
          totalMemoryMb: 0,
          freeMemoryMb: 0,
          gpu: {
            available: false,
            name: "Not sampled in browser preview",
            memoryTotalMb: 0,
            memoryUsedMb: 0,
            utilization: 0,
            temperature: 0,
            driverVersion: "",
          },
        },
        warnings: ["Live model discovery is available in the desktop app."],
      }),
      open: async (url) => {
        globalThis.open(url, "_blank", "noopener,noreferrer");
      },
    },
    enhancements: {
      discover: async () => ({
        upscalerModelPath: "",
        faceDetectorModelPath: "",
        nsfwSegmenterModelPath: "",
      }),
      install: async () => {
        throw new Error(
          "Enhancement models can only be installed from the desktop app.",
        );
      },
    },
    mcp: {
      testServer: async (server) => ({
        serverId: server.id,
        state: "error",
        tools: [],
        error: "MCP servers are available in the desktop app.",
      }),
      disconnectServer: async () => undefined,
      respondToToolCall: async () => undefined,
    },
    jobs: {
      startImage: async () => {
        throw new Error(
          "Image generation requires the Local Forge desktop app.",
        );
      },
      startTraining: async () => {
        throw new Error("Training requires the Local Forge desktop app.");
      },
      cancel: async () => false,
      revealOutput: async () => undefined,
      onEvent: (callback) => {
        jobListeners.add(callback);
        return () => jobListeners.delete(callback);
      },
    },
    system: {
      snapshot: async () => ({
        source: "preview",
        platform: "browser",
        arch: "unknown",
        totalMemoryMb: 0,
        freeMemoryMb: 0,
        gpu: {
          available: false,
          name: "Not sampled in browser preview",
          memoryTotalMb: 0,
          memoryUsedMb: 0,
          utilization: 0,
          temperature: 0,
          driverVersion: "",
        },
      }),
      openOutputs: async () => undefined,
    },
    dialog: {
      chooseImages: async () => [],
      chooseImageModels: async () => [],
      chooseDataset: async () => null,
      choosePython: async () => null,
      chooseTrainingModel: async () => null,
      chooseUpscalerModel: async () => null,
      chooseFaceDetectorModel: async () => null,
      chooseNsfwSegmenterModels: async () => null,
    },
  };
}

export const forgeApi =
  (window as Window & { forge?: ForgeApi }).forge ?? createBrowserApi();

export const isBrowserPreview = !(window as Window & { forge?: ForgeApi })
  .forge;
