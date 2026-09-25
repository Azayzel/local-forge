import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  nativeImage,
  protocol,
  safeStorage,
  shell,
  type WebContents,
} from "electron";
import type {
  ChatRequest,
  ChatStreamEvent,
  EnhancementInstallResult,
  EnhancementModelKind,
  EnhancementModelPaths,
  ImageAttachment,
  ImageGenerationRequest,
  ImageModel,
  JobEvent,
  McpServerConfig,
  McpToolCallRequest,
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
import { runMcpChat, warmChatModel } from "./chat";
import {
  discoverEnhancementModels,
  installEnhancementModel,
} from "./enhancement-models";
import { describeImageWithOllama } from "./vision";
import { LocalJobManager } from "./jobs";
import { closeMcpConnections, disconnectMcpServer, testMcpServer } from "./mcp";
import { discoverModelCatalog } from "./model-catalog";
import { mapWorkspaceMcpSecrets } from "./workspace-secrets";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const activeChats = new Map<string, AbortController>();
const activePulls = new Map<string, AbortController>();
const pendingToolApprovals = new Map<
  string,
  { senderId: number; decide: (approved: boolean) => void }
>();
const MAX_WORKSPACE_BYTES = 5_000_000;
const MAX_IMAGE_BYTES = 20_000_000;
const MODEL_CATALOG_TTL_MS = 10 * 60 * 1000;
const PROTECTED_SECRET_PREFIX = "local-forge-secret:v1:";
const ATTACHMENT_SCHEME = "local-forge-attachment";
const OUTPUT_SCHEME = "local-forge-output";
const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
const IMAGE_CHECKPOINT_EXTENSIONS = new Set([".ckpt", ".safetensors"]);
const MODEL_SCAN_IGNORES = new Set([
  ".git",
  ".venv",
  "node_modules",
  "outputs",
  "venv",
]);

let mainWindow: BrowserWindow | null = null;
let workspaceWrite = Promise.resolve();
const modelCatalogCache = new Map<
  boolean,
  { value: ModelCatalogResponse; expiresAt: number }
>();
const jobs = new LocalJobManager({
  runtimeDirectory: () =>
    app.isPackaged
      ? path.join(process.resourcesPath, "runtime")
      : path.join(__dirname, "../runtime"),
  outputDirectory: () => path.join(app.getPath("userData"), "outputs"),
});

function protectWorkspaceSecrets(value: unknown): unknown {
  return mapWorkspaceMcpSecrets(value, (secret) => {
    if (!secret) return secret;
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        "Secure credential storage is unavailable. Remove MCP secrets before saving.",
      );
    }
    return `${PROTECTED_SECRET_PREFIX}${safeStorage
      .encryptString(secret)
      .toString("base64")}`;
  });
}

function revealWorkspaceSecrets(value: unknown): unknown {
  return mapWorkspaceMcpSecrets(value, (secret) => {
    if (!secret.startsWith(PROTECTED_SECRET_PREFIX)) return secret;
    if (!safeStorage.isEncryptionAvailable()) return "";
    try {
      return safeStorage.decryptString(
        Buffer.from(secret.slice(PROTECTED_SECRET_PREFIX.length), "base64"),
      );
    } catch (error) {
      console.warn("Could not decrypt an MCP credential:", error);
      return "";
    }
  });
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: ATTACHMENT_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
  {
    scheme: OUTPUT_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

function attachmentFilePath(value: string): string {
  const url = new URL(value);
  const fileName = decodeURIComponent(url.pathname.slice(1));
  if (
    url.protocol !== `${ATTACHMENT_SCHEME}:` ||
    url.hostname !== "file" ||
    !/^[0-9a-f-]+\.(?:png|jpe?g|webp)$/i.test(fileName)
  ) {
    throw new Error("Invalid Local Forge attachment URL.");
  }
  return path.join(app.getPath("userData"), "attachments", fileName);
}

function outputImageFilePath(value: string): string {
  const url = new URL(value);
  const fileName = decodeURIComponent(url.pathname.slice(1));
  if (
    url.protocol !== `${OUTPUT_SCHEME}:` ||
    url.hostname !== "image" ||
    !/^[A-Za-z0-9_-]+\.png$/.test(fileName)
  ) {
    throw new Error("Invalid Local Forge output URL.");
  }
  return path.join(app.getPath("userData"), "outputs", "images", fileName);
}

function outputUrl(filePath: string): string {
  return `${OUTPUT_SCHEME}://image/${encodeURIComponent(path.basename(filePath))}`;
}

function assertOutputPath(filePath: string): string {
  const root = path.resolve(app.getPath("userData"), "outputs");
  const candidate = path.resolve(filePath);
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Output path is outside Local Forge storage.");
  }
  return candidate;
}

function emitJob(sender: WebContents, event: JobEvent): void {
  if (sender.isDestroyed()) return;
  emit<JobEvent>(sender, "jobs:event", {
    ...event,
    outputUrl:
      event.kind === "image" &&
      (event.type === "preview" || event.type === "done") &&
      event.outputPath
        ? outputUrl(event.outputPath)
        : undefined,
  });
}

function enhancementModelRoots(): string[] {
  const appRoot = app.getAppPath();
  return [
    path.join(app.getPath("userData"), "models"),
    path.join(appRoot, "models"),
    path.join(process.resourcesPath, "models"),
    path.resolve(appRoot, "..", "Lavely-LLM", "models"),
    path.resolve(process.cwd(), "..", "Lavely-LLM", "models"),
  ].filter((root, index, roots) => roots.indexOf(root) === index);
}

async function localImageFilePath(value: string): Promise<string> {
  if (value.startsWith(`${ATTACHMENT_SCHEME}:`)) {
    return attachmentFilePath(value);
  }
  if (value.startsWith(`${OUTPUT_SCHEME}:`)) {
    return outputImageFilePath(value);
  }
  if (/^\.?\/demo\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp)$/i.test(value)) {
    const relative = value.replace(/^\.?\//, "");
    const candidates = [
      path.join(app.getAppPath(), "dist", relative),
      path.join(app.getAppPath(), "public", relative),
    ];
    for (const candidate of candidates) {
      try {
        if ((await fs.stat(candidate)).isFile()) return candidate;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    throw new Error(`Bundled reference image was not found: ${value}`);
  }
  throw new Error("Unsupported Local Forge image URL.");
}

async function imageForOllama(value: string): Promise<string> {
  if (value.startsWith("data:")) {
    const separator = value.indexOf(",");
    return separator >= 0 ? value.slice(separator + 1) : value;
  }
  return (await fs.readFile(await localImageFilePath(value))).toString(
    "base64",
  );
}

async function describeDiffusersModel(
  directory: string,
): Promise<ImageModel | null> {
  try {
    const index = JSON.parse(
      await fs.readFile(path.join(directory, "model_index.json"), "utf8"),
    ) as { _class_name?: unknown };
    const architecture =
      typeof index._class_name === "string"
        ? index._class_name
        : "Diffusers pipeline";
    if (/Wan(?:ImageToVideo)?Pipeline/i.test(architecture)) return null;
    const stat = await fs.stat(directory);
    return {
      id: path.normalize(directory),
      name: path.basename(directory),
      path: path.normalize(directory),
      format: "diffusers",
      architecture,
      modifiedAt: stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

async function discoverImageModels(root: string): Promise<ImageModel[]> {
  const models: ImageModel[] = [];

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > 4 || models.length >= 200) return;
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    if (
      entries.some(
        (entry) => entry.isFile() && entry.name === "model_index.json",
      )
    ) {
      const model = await describeDiffusersModel(directory);
      if (model) models.push(model);
      return;
    }

    if (depth === 0) {
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const extension = path.extname(entry.name).toLowerCase();
        if (!IMAGE_CHECKPOINT_EXTENSIONS.has(extension)) continue;
        const filePath = path.join(directory, entry.name);
        const stat = await fs.stat(filePath);
        models.push({
          id: path.normalize(filePath),
          name: path.basename(entry.name, extension),
          path: path.normalize(filePath),
          format: "checkpoint",
          architecture: "Single-file checkpoint",
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }

    await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            !MODEL_SCAN_IGNORES.has(entry.name.toLowerCase()),
        )
        .map((entry) => walk(path.join(directory, entry.name), depth + 1)),
    );
  }

  await walk(root, 0);
  return models.sort((left, right) => left.name.localeCompare(right.name));
}

function runtimeUrl(value: string): URL {
  const url = new URL(value);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (url.protocol !== "http:" || !localHosts.has(url.hostname)) {
    throw new Error("Local Forge only connects to runtimes on this machine.");
  }
  return url;
}

function endpoint(baseUrl: string, route: string): string {
  const url = runtimeUrl(baseUrl);
  url.pathname = route;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function emit<T>(sender: WebContents, channel: string, payload: T): void {
  if (!sender.isDestroyed()) sender.send(channel, payload);
}

function toolApprovalKey(requestId: string, callId: string): string {
  return `${requestId}:${callId}`;
}

function waitForToolApproval(
  sender: WebContents,
  call: McpToolCallRequest,
  signal: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    const key = toolApprovalKey(call.requestId, call.callId);
    let settled = false;
    const timeout = setTimeout(() => decide(false), 10 * 60 * 1000);
    const onAbort = () => decide(false);
    const decide = (approved: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      pendingToolApprovals.delete(key);
      resolve(approved);
    };
    pendingToolApprovals.set(key, { senderId: sender.id, decide });
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) decide(false);
  });
}

function clearToolApprovals(requestId: string): void {
  const prefix = `${requestId}:`;
  for (const [key, approval] of pendingToolApprovals) {
    if (key.startsWith(prefix)) approval.decide(false);
  }
}

async function readJsonLines(
  response: Response,
  onValue: (value: Record<string, unknown>) => void,
): Promise<void> {
  if (!response.body) throw new Error("Runtime returned an empty response.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim()) onValue(JSON.parse(line) as Record<string, unknown>);
    }
    if (done) break;
  }

  if (buffer.trim()) onValue(JSON.parse(buffer) as Record<string, unknown>);
}

async function health(baseUrl: string): Promise<RuntimeHealth> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(endpoint(baseUrl, "/api/version"), {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Runtime returned ${response.status}.`);
    const body = (await response.json()) as { version?: string };
    return {
      online: true,
      latencyMs: Math.round(performance.now() - startedAt),
      version: body.version,
    };
  } catch (error) {
    return {
      online: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "Runtime unavailable.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function listModels(baseUrl: string): Promise<OllamaModel[]> {
  const response = await fetch(endpoint(baseUrl, "/api/tags"));
  if (!response.ok)
    throw new Error(`Could not list models (${response.status}).`);
  const body = (await response.json()) as {
    models?: Array<{
      name: string;
      size?: number;
      modified_at?: string;
      details?: {
        family?: string;
        parameter_size?: string;
        quantization_level?: string;
      };
    }>;
  };

  return (body.models ?? []).map((model) => ({
    name: model.name,
    size: model.size ?? 0,
    modifiedAt: model.modified_at ?? "",
    family: model.details?.family ?? "unknown",
    parameterSize: model.details?.parameter_size ?? "unknown",
    quantization: model.details?.quantization_level ?? "unknown",
  }));
}

async function streamChat(
  sender: WebContents,
  request: ChatRequest,
): Promise<{ ok: boolean }> {
  if (!request.requestId || !request.model || request.messages.length === 0) {
    throw new Error(
      "A request id, model, and at least one message are required.",
    );
  }

  const controller = new AbortController();
  activeChats.set(request.requestId, controller);

  try {
    const messages = await Promise.all(
      request.messages.map(async (message) => ({
        ...message,
        images: message.images
          ? await Promise.all(message.images.map(imageForOllama))
          : undefined,
      })),
    );
    await runMcpChat({
      request,
      messages,
      signal: controller.signal,
      emit: (event) =>
        emit<ChatStreamEvent>(sender, "ollama:chat-event", event),
      approve: (call) => waitForToolApproval(sender, call, controller.signal),
    });
    return { ok: true };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    emit<ChatStreamEvent>(sender, "ollama:chat-event", {
      requestId: request.requestId,
      type: aborted ? "done" : "error",
      error: aborted
        ? undefined
        : error instanceof Error
          ? error.message
          : "Chat request failed.",
    });
    return { ok: false };
  } finally {
    clearToolApprovals(request.requestId);
    activeChats.delete(request.requestId);
  }
}

async function pullModel(
  sender: WebContents,
  request: PullRequest,
): Promise<{ ok: boolean }> {
  if (!request.requestId || !request.model.trim()) {
    throw new Error("A request id and model name are required.");
  }

  const controller = new AbortController();
  activePulls.set(request.requestId, controller);

  try {
    const response = await fetch(endpoint(request.baseUrl, "/api/pull"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: request.model.trim(), stream: true }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(await response.text());

    await readJsonLines(response, (chunk) => {
      emit<PullStreamEvent>(sender, "ollama:pull-event", {
        requestId: request.requestId,
        status: String(chunk.status ?? "Working"),
        digest: typeof chunk.digest === "string" ? chunk.digest : undefined,
        completed: Number(chunk.completed ?? 0) || undefined,
        total: Number(chunk.total ?? 0) || undefined,
        error: typeof chunk.error === "string" ? chunk.error : undefined,
      });
    });
    return { ok: true };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    emit<PullStreamEvent>(sender, "ollama:pull-event", {
      requestId: request.requestId,
      status: aborted ? "Cancelled" : "Failed",
      error: aborted
        ? undefined
        : error instanceof Error
          ? error.message
          : "Model pull failed.",
    });
    return { ok: false };
  } finally {
    activePulls.delete(request.requestId);
  }
}

async function getSystemSnapshot(): Promise<SystemSnapshot> {
  const base = {
    source: "host" as const,
    platform: process.platform,
    arch: process.arch,
    totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
    freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
  };

  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      [
        "--query-gpu=name,memory.total,memory.used,utilization.gpu,temperature.gpu,driver_version",
        "--format=csv,noheader,nounits",
      ],
      { timeout: 3000, windowsHide: true },
    );
    const [name, total, used, utilization, temperature, driver] = stdout
      .trim()
      .split(/\r?\n/)[0]
      .split(",")
      .map((value) => value.trim());

    return {
      ...base,
      gpu: {
        available: true,
        name,
        memoryTotalMb: Number(total),
        memoryUsedMb: Number(used),
        utilization: Number(utilization),
        temperature: Number(temperature),
        driverVersion: driver,
      },
    };
  } catch (error) {
    return {
      ...base,
      gpu: {
        available: false,
        name: "No NVIDIA GPU detected",
        memoryTotalMb: 0,
        memoryUsedMb: 0,
        utilization: 0,
        temperature: 0,
        driverVersion: "",
        error: error instanceof Error ? error.message : "GPU query failed.",
      },
    };
  }
}

async function getModelCatalog(
  refresh = false,
  includeNsfw = false,
): Promise<ModelCatalogResponse> {
  const cached = modelCatalogCache.get(includeNsfw);
  if (!refresh && cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const catalog = await discoverModelCatalog(await getSystemSnapshot(), fetch, {
    includeNsfw,
  });
  modelCatalogCache.set(includeNsfw, {
    value: catalog,
    expiresAt: Date.now() + MODEL_CATALOG_TTL_MS,
  });
  return catalog;
}

function modelCatalogUrl(value: string): string {
  const url = new URL(value);
  const allowedHosts = new Set(["huggingface.co", "ollama.com"]);
  if (
    url.protocol !== "https:" ||
    !allowedHosts.has(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error("Model links must use an approved catalog host.");
  }
  return url.toString();
}

function registerIpc(): void {
  ipcMain.handle("app:info", () => ({
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
  }));

  ipcMain.on("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.on("window:maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window?.isMaximized()) window.unmaximize();
    else window?.maximize();
  });
  ipcMain.on("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle("storage:load-workspace", async () => {
    try {
      return revealWorkspaceSecrets(
        JSON.parse(
          await fs.readFile(
            path.join(app.getPath("userData"), "workspace.json"),
            "utf8",
          ),
        ) as unknown,
      );
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      if (!missing) console.warn("Could not load workspace:", error);
      return null;
    }
  });

  ipcMain.handle("storage:save-workspace", async (_event, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Workspace data must be an object.");
    }
    const encoded = JSON.stringify(protectWorkspaceSecrets(value));
    if (Buffer.byteLength(encoded) > MAX_WORKSPACE_BYTES) {
      throw new Error("Workspace data exceeds the 5 MB limit.");
    }

    const target = path.join(app.getPath("userData"), "workspace.json");
    const temporary = `${target}.tmp`;
    const nextWrite = workspaceWrite.then(async () => {
      await fs.writeFile(temporary, encoded, "utf8");
      await fs.rename(temporary, target);
    });
    workspaceWrite = nextWrite.catch(() => undefined);
    await nextWrite;
  });
  ipcMain.handle("storage:delete-attachment", async (_event, url: string) => {
    try {
      await fs.unlink(attachmentFilePath(url));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  });

  ipcMain.handle("ollama:health", (_event, baseUrl: string) => health(baseUrl));
  ipcMain.handle("ollama:models", (_event, baseUrl: string) =>
    listModels(baseUrl),
  );
  ipcMain.handle(
    "ollama:warm-model",
    (_event, baseUrl: string, model: string) => warmChatModel(baseUrl, model),
  );
  ipcMain.handle("ollama:chat", (event, request: ChatRequest) =>
    streamChat(event.sender, request),
  );
  ipcMain.handle("ollama:cancel-chat", (_event, requestId: string) => {
    activeChats.get(requestId)?.abort();
  });
  ipcMain.handle(
    "vision:describe",
    async (
      _event,
      request: VisionDescribeRequest,
    ): Promise<VisionDescribeResult> =>
      describeImageWithOllama({
        baseUrl: request.baseUrl,
        model: request.model,
        imageBase64: await imageForOllama(request.imageUrl),
        mode: request.mode,
      }),
  );
  ipcMain.handle("ollama:pull", (event, request: PullRequest) =>
    pullModel(event.sender, request),
  );
  ipcMain.handle("ollama:cancel-pull", (_event, requestId: string) => {
    activePulls.get(requestId)?.abort();
  });

  ipcMain.handle(
    "catalog:list",
    (_event, refresh: boolean, includeNsfw: boolean) =>
      getModelCatalog(Boolean(refresh), Boolean(includeNsfw)),
  );
  ipcMain.handle("catalog:open", (_event, url: string) =>
    shell.openExternal(modelCatalogUrl(url)),
  );

  ipcMain.handle(
    "enhancements:discover",
    (): Promise<EnhancementModelPaths> =>
      discoverEnhancementModels(enhancementModelRoots()),
  );
  ipcMain.handle(
    "enhancements:install",
    (_event, kind: EnhancementModelKind): Promise<EnhancementInstallResult> =>
      installEnhancementModel(
        path.join(app.getPath("userData"), "models"),
        kind,
        (url) => net.fetch(url),
      ),
  );

  ipcMain.handle("mcp:test-server", (_event, server: McpServerConfig) =>
    testMcpServer(server),
  );
  ipcMain.handle("mcp:disconnect-server", (_event, serverId: string) =>
    disconnectMcpServer(serverId),
  );

  ipcMain.handle(
    "jobs:start-image",
    async (event, request: ImageGenerationRequest) => {
      const resolvedRequest = request.sourceImage
        ? {
            ...request,
            sourceImage: await localImageFilePath(request.sourceImage),
          }
        : request;
      await jobs.startImage(resolvedRequest, (jobEvent) =>
        emitJob(event.sender, jobEvent),
      );
      return { ok: true };
    },
  );
  ipcMain.handle(
    "jobs:start-training",
    async (event, request: TrainingRequest) => {
      await jobs.startTraining(request, (jobEvent) =>
        emitJob(event.sender, jobEvent),
      );
      return { ok: true };
    },
  );
  ipcMain.handle("jobs:cancel", (_event, jobId: string) => jobs.cancel(jobId));
  ipcMain.handle("jobs:reveal-output", async (_event, outputPath: string) => {
    const target = assertOutputPath(outputPath);
    const stat = await fs.stat(target);
    if (stat.isDirectory()) {
      const error = await shell.openPath(target);
      if (error) throw new Error(error);
    } else {
      shell.showItemInFolder(target);
    }
  });
  ipcMain.handle(
    "mcp:tool-decision",
    (event, decision: McpToolDecision): boolean => {
      if (
        !decision ||
        typeof decision.requestId !== "string" ||
        typeof decision.callId !== "string" ||
        typeof decision.approved !== "boolean"
      ) {
        return false;
      }
      const approval = pendingToolApprovals.get(
        toolApprovalKey(decision.requestId, decision.callId),
      );
      if (!approval || approval.senderId !== event.sender.id) return false;
      approval.decide(decision.approved);
      return true;
    },
  );

  ipcMain.handle("system:snapshot", () => getSystemSnapshot());
  ipcMain.handle("system:open-outputs", async () => {
    const outputs = path.join(app.getPath("userData"), "outputs");
    await fs.mkdir(outputs, { recursive: true });
    const error = await shell.openPath(outputs);
    if (error) throw new Error(error);
  });

  ipcMain.handle(
    "dialog:choose-images",
    async (): Promise<ImageAttachment[]> => {
      const result = await dialog.showOpenDialog({
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] },
        ],
      });
      if (result.canceled) return [];

      return Promise.all(
        result.filePaths.map(async (filePath) => {
          const extension = path.extname(filePath).toLowerCase();
          const mime = IMAGE_TYPES[extension];
          if (!mime) throw new Error(`Unsupported image type: ${extension}`);
          const stat = await fs.stat(filePath);
          if (stat.size > MAX_IMAGE_BYTES) {
            throw new Error(
              `${path.basename(filePath)} exceeds the 20 MB limit.`,
            );
          }
          const attachmentDirectory = path.join(
            app.getPath("userData"),
            "attachments",
          );
          const storedName = `${randomUUID()}${extension}`;
          await fs.mkdir(attachmentDirectory, { recursive: true });
          await fs.copyFile(
            filePath,
            path.join(attachmentDirectory, storedName),
          );
          const dimensions = nativeImage.createFromPath(filePath).getSize();
          return {
            name: path.basename(filePath),
            path: filePath,
            size: stat.size,
            url: `${ATTACHMENT_SCHEME}://file/${storedName}`,
            width: dimensions.width,
            height: dimensions.height,
          };
        }),
      );
    },
  );

  ipcMain.handle(
    "dialog:choose-image-models",
    async (): Promise<ImageModel[]> => {
      const result = await dialog.showOpenDialog({
        title: "Select an image model library",
        buttonLabel: "Scan folder",
        properties: ["openDirectory"],
      });
      if (result.canceled || !result.filePaths[0]) return [];
      return discoverImageModels(result.filePaths[0]);
    },
  );

  ipcMain.handle("dialog:choose-dataset", async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Training data", extensions: ["jsonl", "json", "csv"] },
      ],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle("dialog:choose-python", async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: "Select Python executable",
      properties: ["openFile"],
      filters:
        process.platform === "win32"
          ? [{ name: "Python", extensions: ["exe"] }]
          : undefined,
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(
    "dialog:choose-training-model",
    async (): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        title: "Select a Transformers model directory",
        buttonLabel: "Select model",
        properties: ["openDirectory"],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  );

  ipcMain.handle(
    "dialog:choose-upscaler-model",
    async (): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        title: "Select an ESRGAN upscaler model",
        buttonLabel: "Select model",
        properties: ["openFile"],
        filters: [
          { name: "Upscaler models", extensions: ["pth", "pt", "safetensors"] },
        ],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  );

  ipcMain.handle(
    "dialog:choose-face-detector-model",
    async (): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        title: "Select a YOLO face detector model",
        buttonLabel: "Select model",
        properties: ["openFile"],
        filters: [{ name: "YOLO models", extensions: ["pt"] }],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  );

  ipcMain.handle(
    "dialog:choose-nsfw-segmenter-models",
    async (): Promise<string | null> => {
      const result = await dialog.showOpenDialog({
        title: "Select an NSFW segmentation model directory",
        buttonLabel: "Select models",
        properties: ["openDirectory"],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  );
}

function createWindow(): void {
  const iconPath = process.env.VITE_DEV_SERVER_URL
    ? path.join(__dirname, "../public/app-icon.png")
    : path.join(__dirname, "../dist/app-icon.png");
  mainWindow = new BrowserWindow({
    width: 1512,
    height: 940,
    minWidth: 1040,
    minHeight: 680,
    icon: iconPath,
    show: false,
    frame: process.platform === "darwin",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    backgroundColor: "#111310",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const developmentUrl = process.env.VITE_DEV_SERVER_URL;
    if (!developmentUrl || !url.startsWith(developmentUrl))
      event.preventDefault();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

registerIpc();

void app.whenReady().then(async () => {
  app.setAppUserModelId("io.localforge.desktop");
  void protocol.handle(ATTACHMENT_SCHEME, async (request) => {
    try {
      return await net.fetch(
        pathToFileURL(attachmentFilePath(request.url)).toString(),
      );
    } catch {
      return new Response("Attachment not found.", { status: 404 });
    }
  });
  void protocol.handle(OUTPUT_SCHEME, async (request) => {
    try {
      return await net.fetch(
        pathToFileURL(outputImageFilePath(request.url)).toString(),
      );
    } catch {
      return new Response("Output not found.", { status: 404 });
    }
  });
  await jobs.cleanupPreviews().catch((error) => {
    console.warn("Could not remove temporary image previews:", error);
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  for (const controller of activeChats.values()) controller.abort();
  for (const controller of activePulls.values()) controller.abort();
  jobs.cancelAll();
  void closeMcpConnections().finally(() => {
    if (process.platform !== "darwin") app.quit();
  });
});
