import {
  Boxes,
  FolderOpen,
  Images,
  MessageSquarePlus,
  MessageSquareText,
  PanelLeftOpen,
  Settings,
  WandSparkles,
} from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import "./App.css";
import { NavRail, TitleBar } from "./components/AppChrome";
import {
  CommandPalette,
  type PaletteAction,
} from "./components/CommandPalette";
import { RuntimePanel } from "./components/RuntimePanel";
import { SessionSidebar } from "./components/SessionSidebar";
import {
  ActivityView,
  SettingsView,
  TuneView,
} from "./features/operations/OperationalViews";
import { LibraryView } from "./features/library/LibraryView";
import { ModelsView } from "./features/models/ModelsView";
import { StudioView } from "./features/studio/StudioView";
import { Workbench } from "./features/workbench/Workbench";
import { useWorkspace } from "./hooks/useWorkspace";
import { forgeApi } from "./lib/forge-api";
import { appendRunLog } from "./state/workspace";
import type {
  ForgeRun,
  ForgeRunLog,
  ImageRunRecipe,
  LibraryAsset,
  TuneRunRecipe,
} from "./state/workspace";
import type {
  AppView,
  EnhancementModelKind,
  ImageModel,
  JobEvent,
  OllamaModel,
  RuntimeHealth,
  SystemSnapshot,
} from "./types";

function jobLogEntry(event: JobEvent): ForgeRunLog | null {
  const timestamp = new Date().toISOString();
  if (event.type === "progress" || event.type === "preview") return null;
  if (event.type === "status" || event.type === "log") {
    return event.message
      ? { timestamp, kind: event.type, message: event.message }
      : null;
  }
  if (event.type === "error") {
    return {
      timestamp,
      kind: "error",
      message: event.message || "Job failed.",
    };
  }
  if (event.type === "done") {
    return {
      timestamp,
      kind: "success",
      message: event.outputPath
        ? `Completed: ${event.outputPath}`
        : "Job completed.",
    };
  }
  return {
    timestamp,
    kind: "status",
    message: event.type === "cancelled" ? "Job cancelled." : "Job queued.",
  };
}

function App() {
  const {
    workspace,
    setWorkspace,
    patchWorkspace,
    activeThread,
    updateThread,
    addThread,
    removeThread,
    loaded,
  } = useWorkspace();
  const [health, setHealth] = useState<RuntimeHealth>({
    online: false,
    latencyMs: 0,
  });
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [system, setSystem] = useState<SystemSnapshot | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<JobEvent | null>(null);
  const [installingEnhancement, setInstallingEnhancement] =
    useState<EnhancementModelKind | null>(null);
  const [enhancementInstallError, setEnhancementInstallError] = useState("");

  const discoverEnhancements = useEffectEvent(async () => {
    try {
      const discovered = await forgeApi.enhancements.discover();
      setWorkspace((current) => {
        const upscalerModelPath = current.settings.upscalerModelPath.trim()
          ? current.settings.upscalerModelPath
          : discovered.upscalerModelPath;
        const faceDetectorModelPath =
          current.settings.faceDetectorModelPath.trim()
            ? current.settings.faceDetectorModelPath
            : discovered.faceDetectorModelPath;
        const nsfwSegmenterModelPath =
          current.settings.nsfwSegmenterModelPath.trim()
            ? current.settings.nsfwSegmenterModelPath
            : discovered.nsfwSegmenterModelPath;
        if (
          upscalerModelPath === current.settings.upscalerModelPath &&
          faceDetectorModelPath === current.settings.faceDetectorModelPath &&
          nsfwSegmenterModelPath === current.settings.nsfwSegmenterModelPath
        ) {
          return current;
        }
        return {
          ...current,
          settings: {
            ...current.settings,
            upscalerModelPath,
            faceDetectorModelPath,
            nsfwSegmenterModelPath,
          },
        };
      });
    } catch (error) {
      console.warn("Could not discover enhancement models:", error);
    }
  });

  useEffect(() => {
    if (loaded) void discoverEnhancements();
  }, [loaded]);

  async function installEnhancement(kind: EnhancementModelKind) {
    setInstallingEnhancement(kind);
    setEnhancementInstallError("");
    try {
      const installed = await forgeApi.enhancements.install(kind);
      setWorkspace((current) => ({
        ...current,
        settings: {
          ...current.settings,
          ...(installed.kind === "upscaler"
            ? { upscalerModelPath: installed.path }
            : installed.kind === "faceDetector"
              ? { faceDetectorModelPath: installed.path }
              : { nsfwSegmenterModelPath: installed.path }),
        },
      }));
    } catch (error) {
      setEnhancementInstallError(
        error instanceof Error ? error.message : "Model installation failed.",
      );
    } finally {
      setInstallingEnhancement(null);
    }
  }

  async function refreshModels() {
    try {
      const nextModels = await forgeApi.ollama.models(
        workspace.settings.ollamaUrl,
      );
      setModels(nextModels);
      setWorkspace((current) => {
        if (current.settings.selectedModel || nextModels.length === 0)
          return current;
        return {
          ...current,
          settings: { ...current.settings, selectedModel: nextModels[0].name },
        };
      });
    } catch {
      setModels([]);
    }
  }

  async function checkRuntime() {
    const nextHealth = await forgeApi.ollama.health(
      workspace.settings.ollamaUrl,
    );
    setHealth(nextHealth);
    if (nextHealth.online) await refreshModels();
  }

  useEffect(() => {
    let active = true;
    async function pollRuntime() {
      const nextHealth = await forgeApi.ollama.health(
        workspace.settings.ollamaUrl,
      );
      if (!active) return;
      setHealth(nextHealth);
      if (nextHealth.online) {
        try {
          const nextModels = await forgeApi.ollama.models(
            workspace.settings.ollamaUrl,
          );
          if (active) setModels(nextModels);
        } catch {
          if (active) setModels([]);
        }
      }
    }
    void pollRuntime();
    const interval = window.setInterval(() => void pollRuntime(), 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [workspace.settings.ollamaUrl]);

  useEffect(() => {
    let active = true;
    async function pollSystem() {
      const snapshot = await forgeApi.system.snapshot();
      if (active) setSystem(snapshot);
    }
    void pollSystem();
    const interval = window.setInterval(() => void pollSystem(), 8_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(
    () =>
      forgeApi.jobs.onEvent((event: JobEvent) => {
        if (event.kind === "image") {
          if (event.type === "preview" && event.outputUrl) {
            setImagePreview(event);
          } else if (
            event.type === "queued" ||
            event.type === "done" ||
            event.type === "error" ||
            event.type === "cancelled"
          ) {
            setImagePreview((current) =>
              !current || current.jobId === event.jobId ? null : current,
            );
          }
        }
        setWorkspace((current) => {
          const existing = current.runs.find((run) => run.id === event.jobId);
          if (!existing) return current;
          const logEntry = jobLogEntry(event);

          const status: ForgeRun["status"] =
            event.type === "done"
              ? "complete"
              : event.type === "error"
                ? "failed"
                : event.type === "cancelled"
                  ? "cancelled"
                  : event.type === "queued"
                    ? "queued"
                    : "running";
          const updatedRun: ForgeRun = {
            ...existing,
            status,
            progress:
              event.progress ??
              (event.type === "done" ? 100 : existing.progress),
            message: event.message || existing.message,
            error:
              event.type === "error"
                ? event.message || "Job failed."
                : existing.error,
            outputPath:
              event.type === "done"
                ? (event.outputPath ?? existing.outputPath)
                : existing.outputPath,
            outputUrl:
              event.type === "done"
                ? (event.outputUrl ?? existing.outputUrl)
                : existing.outputUrl,
            completedAt:
              event.type === "done" ||
              event.type === "error" ||
              event.type === "cancelled"
                ? new Date().toISOString()
                : existing.completedAt,
            logs: logEntry
              ? appendRunLog(existing.logs, logEntry)
              : existing.logs,
          };
          const runs = current.runs.map((run) =>
            run.id === event.jobId ? updatedRun : run,
          );

          if (
            event.type !== "done" ||
            event.kind !== "image" ||
            !event.outputUrl
          ) {
            return { ...current, runs };
          }

          const imageRecipe =
            existing.recipe?.kind === "image" ? existing.recipe : null;
          const generated: LibraryAsset = {
            id: `generated-${event.jobId}`,
            src: event.outputUrl,
            title: existing.name,
            source: "generated",
            width: event.width ?? imageRecipe?.width ?? 0,
            height: event.height ?? imageRecipe?.height ?? 0,
            createdAt: new Date().toISOString(),
            prompt: imageRecipe?.prompt ?? "",
            outputPath: event.outputPath,
          };
          return {
            ...current,
            runs,
            assets: current.assets.some((asset) => asset.id === generated.id)
              ? current.assets
              : [generated, ...current.assets],
            studio: { ...current.studio, activeAsset: generated.src },
          };
        });
      }),
    [setWorkspace],
  );

  function selectView(view: AppView) {
    patchWorkspace({ activeView: view });
  }

  function selectModel(model: string) {
    setWorkspace((current) => ({
      ...current,
      settings: { ...current.settings, selectedModel: model },
      threads: current.threads.map((thread) =>
        thread.id === current.activeThreadId ? { ...thread, model } : thread,
      ),
    }));
  }

  function addRun(run: ForgeRun) {
    setWorkspace((current) => ({
      ...current,
      runs: [run, ...current.runs],
    }));
  }

  function failRun(jobId: string, error: unknown) {
    const message = error instanceof Error ? error.message : "Job failed.";
    setWorkspace((current) => ({
      ...current,
      runs: current.runs.map((run) =>
        run.id === jobId
          ? {
              ...run,
              status: "failed",
              error: message,
              completedAt: new Date().toISOString(),
              logs: appendRunLog(run.logs, {
                timestamp: new Date().toISOString(),
                kind: "error",
                message,
              }),
            }
          : run,
      ),
    }));
  }

  async function queueImageRun(
    recipe: ImageRunRecipe,
    model: ImageModel,
    name: string,
  ) {
    setImagePreview(null);
    const jobId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    addRun({
      id: jobId,
      kind: "image",
      name,
      detail: `${model.name} / ${recipe.width} x ${recipe.height} / ${recipe.steps} steps`,
      status: "queued",
      progress: 0,
      startedAt,
      recipe,
      logs: [
        {
          timestamp: startedAt,
          kind: "status",
          message: "Image generation queued.",
        },
      ],
    });
    try {
      await forgeApi.jobs.startImage({
        jobId,
        pythonPath: workspace.settings.pythonPath,
        model,
        prompt: recipe.prompt,
        negativePrompt: recipe.negativePrompt,
        width: recipe.width,
        height: recipe.height,
        steps: recipe.steps,
        guidance: recipe.guidance,
        seed: recipe.seed,
        faceFix: Boolean(recipe.faceFix),
        faceFixStrength: recipe.faceFixStrength ?? 0.45,
        faceDetectorModelPath: workspace.settings.faceDetectorModelPath,
        upscale: Boolean(recipe.upscale),
        upscaleFactor: recipe.upscaleFactor ?? 2,
        upscalerModelPath: workspace.settings.upscalerModelPath,
        nsfwSegmentation: Boolean(recipe.nsfwSegmentation),
        nsfwSegmenterModelPath: workspace.settings.nsfwSegmenterModelPath,
      });
    } catch (error) {
      failRun(jobId, error);
    }
  }

  async function queueTrainingRun(recipe: TuneRunRecipe, name: string) {
    const jobId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    addRun({
      id: jobId,
      kind: "tune",
      name,
      detail: `${recipe.epochs} epochs / rank ${recipe.loraRank} / ${recipe.maxSequenceLength} tokens`,
      status: "queued",
      progress: 0,
      startedAt,
      recipe,
      logs: [
        {
          timestamp: startedAt,
          kind: "status",
          message: "Adapter training queued.",
        },
      ],
    });
    try {
      await forgeApi.jobs.startTraining({
        jobId,
        pythonPath: workspace.settings.pythonPath,
        modelPath: recipe.modelPath,
        datasetPath: recipe.datasetPath,
        epochs: recipe.epochs,
        batchSize: recipe.batchSize,
        gradientAccumulation: recipe.gradientAccumulation,
        learningRate: recipe.learningRate,
        loraRank: recipe.loraRank,
        maxSequenceLength: recipe.maxSequenceLength,
        use4Bit: recipe.use4Bit,
        gradientCheckpointing: recipe.gradientCheckpointing,
      });
    } catch (error) {
      failRun(jobId, error);
    }
  }

  async function startImage(action: "render" | "variant") {
    const model = workspace.imageModels.find(
      (item) => item.id === workspace.studio.model,
    );
    if (!model) return;
    const seed =
      action === "variant"
        ? Math.floor(Math.random() * 2 ** 32)
        : workspace.studio.seed;
    const recipe: ImageRunRecipe = {
      kind: "image",
      modelId: model.id,
      modelName: model.name,
      prompt: workspace.studio.prompt,
      negativePrompt: workspace.studio.negativePrompt,
      width: workspace.studio.width,
      height: workspace.studio.height,
      steps: workspace.studio.steps,
      guidance: workspace.studio.guidance,
      seed,
      faceFix:
        workspace.studio.faceFix &&
        Boolean(workspace.settings.faceDetectorModelPath.trim()),
      faceFixStrength: workspace.studio.faceFixStrength,
      upscale:
        workspace.studio.upscale &&
        Boolean(workspace.settings.upscalerModelPath.trim()),
      upscaleFactor: workspace.studio.upscaleFactor,
      nsfwSegmentation:
        workspace.studio.nsfwSegmentation &&
        Boolean(workspace.settings.nsfwSegmenterModelPath.trim()),
    };
    await queueImageRun(
      recipe,
      model,
      action === "variant" ? "Studio variant" : "Studio render",
    );
  }

  async function startTraining() {
    const recipe: TuneRunRecipe = {
      kind: "tune",
      ...workspace.tune,
    };
    const modelName =
      recipe.modelPath.split(/[\\/]/).filter(Boolean).at(-1) || "Local model";
    await queueTrainingRun(recipe, `${modelName} adapter`);
  }

  async function retryRun(run: ForgeRun) {
    const recipe = run.recipe;
    if (!recipe) return;
    if (recipe.kind === "image") {
      const model = workspace.imageModels.find(
        (item) => item.id === recipe.modelId,
      );
      if (!model) {
        const jobId = crypto.randomUUID();
        const timestamp = new Date().toISOString();
        addRun({
          ...run,
          id: jobId,
          name: `${run.name} retry`,
          status: "failed",
          progress: 0,
          startedAt: timestamp,
          completedAt: timestamp,
          error: "The registered image model is no longer available.",
          outputPath: undefined,
          outputUrl: undefined,
          logs: [
            {
              timestamp,
              kind: "error",
              message: "The registered image model is no longer available.",
            },
          ],
        });
        return;
      }
      await queueImageRun(recipe, model, `${run.name} retry`);
      return;
    }
    await queueTrainingRun(recipe, `${run.name} retry`);
  }

  function openRunImage(run: ForgeRun) {
    const recipe = run.recipe;
    const outputUrl = run.outputUrl;
    if (recipe?.kind !== "image" || !outputUrl) return;
    setWorkspace((current) => ({
      ...current,
      activeView: "studio",
      studio: {
        ...current.studio,
        model: recipe.modelId,
        prompt: recipe.prompt,
        negativePrompt: recipe.negativePrompt,
        width: recipe.width,
        height: recipe.height,
        steps: recipe.steps,
        guidance: recipe.guidance,
        seed: recipe.seed,
        faceFix: recipe.faceFix ?? false,
        faceFixStrength: recipe.faceFixStrength ?? 0.45,
        upscale: recipe.upscale ?? false,
        upscaleFactor: recipe.upscaleFactor ?? 2,
        nsfwSegmentation: recipe.nsfwSegmentation ?? false,
        activeAsset: outputUrl,
      },
    }));
  }

  async function scanImageModels(): Promise<number> {
    const discovered = await forgeApi.dialog.chooseImageModels();
    if (discovered.length === 0) return 0;
    setWorkspace((current) => {
      const modelsByPath = new Map(
        current.imageModels.map((model) => [model.path, model]),
      );
      for (const model of discovered) modelsByPath.set(model.path, model);
      return {
        ...current,
        imageModels: [...modelsByPath.values()].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
        studio: {
          ...current.studio,
          model: current.studio.model || discovered[0].id,
        },
      };
    });
    return discovered.length;
  }

  async function importStudioAssets(): Promise<number> {
    const selected = await forgeApi.dialog.chooseImages();
    if (selected.length === 0) return 0;
    const imported: LibraryAsset[] = selected.map((image) => ({
      id: image.url,
      src: image.url,
      title: image.name.replace(/\.[^.]+$/, ""),
      source: "imported",
      width: image.width,
      height: image.height,
      createdAt: new Date().toISOString(),
      prompt: "",
    }));
    setWorkspace((current) => ({
      ...current,
      assets: [...imported, ...current.assets],
      studio: { ...current.studio, activeAsset: imported[0].src },
    }));
    return imported.length;
  }

  function removeImageModel(model: ImageModel) {
    setWorkspace((current) => ({
      ...current,
      imageModels: current.imageModels.filter((item) => item.id !== model.id),
      studio: {
        ...current.studio,
        model: current.studio.model === model.id ? "" : current.studio.model,
      },
    }));
  }

  async function removeAsset(asset: LibraryAsset) {
    if (asset.source === "sample") return;
    if (asset.source === "imported") {
      await forgeApi.storage.deleteAttachment(asset.src);
    }
    setWorkspace((current) => {
      const assets = current.assets.filter((item) => item.id !== asset.id);
      return {
        ...current,
        assets,
        studio: {
          ...current.studio,
          activeAsset:
            current.studio.activeAsset === asset.src
              ? (assets[0]?.src ?? "")
              : current.studio.activeAsset,
        },
      };
    });
  }

  const handleShortcut = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === "k") {
      event.preventDefault();
      setCommandOpen((open) => !open);
    }
    if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      addThread();
    }
    if (event.key.toLowerCase() === "b") {
      event.preventDefault();
      setSidebarCollapsed((value) => !value);
    }
    const views: AppView[] = [
      "workbench",
      "studio",
      "library",
      "models",
      "tune",
      "activity",
    ];
    const numeric = Number(event.key);
    if (numeric >= 1 && numeric <= views.length) {
      event.preventDefault();
      selectView(views[numeric - 1]);
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  if (!loaded) {
    return (
      <div className="app-loading">
        <span>
          <WandSparkles size={22} />
        </span>
        <strong>LOCAL FORGE</strong>
      </div>
    );
  }

  const selectedModelName =
    activeThread.model ||
    workspace.settings.selectedModel ||
    models[0]?.name ||
    "";
  const selectedModel =
    models.find((model) => model.name === selectedModelName) ?? null;
  const activeImageRun = workspace.runs.find(
    (run) =>
      run.kind === "image" &&
      (run.status === "queued" || run.status === "running"),
  );
  const activeTuneRun = workspace.runs.find(
    (run) =>
      run.kind === "tune" &&
      (run.status === "queued" || run.status === "running"),
  );
  const paletteActions: PaletteAction[] = [
    {
      id: "new",
      label: "New session",
      group: "Workspace",
      shortcut: "Ctrl N",
      icon: <MessageSquarePlus size={17} />,
      run: addThread,
    },
    {
      id: "workbench",
      label: "Open Workbench",
      group: "Navigate",
      shortcut: "Ctrl 1",
      icon: <MessageSquareText size={17} />,
      run: () => selectView("workbench"),
    },
    {
      id: "studio",
      label: "Open Studio",
      group: "Navigate",
      shortcut: "Ctrl 2",
      icon: <WandSparkles size={17} />,
      run: () => selectView("studio"),
    },
    {
      id: "library",
      label: "Open Library",
      group: "Navigate",
      shortcut: "Ctrl 3",
      icon: <Images size={17} />,
      run: () => selectView("library"),
    },
    {
      id: "models",
      label: "Manage models",
      group: "Runtime",
      shortcut: "Ctrl 4",
      icon: <Boxes size={17} />,
      run: () => selectView("models"),
    },
    {
      id: "outputs",
      label: "Open outputs folder",
      group: "System",
      icon: <FolderOpen size={17} />,
      run: () => void forgeApi.system.openOutputs(),
    },
    {
      id: "settings",
      label: "Open Settings",
      group: "Application",
      icon: <Settings size={17} />,
      run: () => selectView("settings"),
    },
  ];

  return (
    <div
      data-theme={workspace.settings.theme}
      className={`forge-app ${workspace.settings.compactMode ? "compact" : ""} ${workspace.settings.reduceMotion ? "reduce-motion" : ""}`}
    >
      <TitleBar
        health={health}
        modelName={selectedModelName}
        onOpenCommand={() => setCommandOpen(true)}
      />
      <div className="app-shell">
        <NavRail activeView={workspace.activeView} onChange={selectView} />
        {workspace.activeView === "workbench" && !sidebarCollapsed && (
          <SessionSidebar
            threads={workspace.threads}
            activeThreadId={workspace.activeThreadId}
            onCreate={addThread}
            onSelect={(threadId) =>
              patchWorkspace({ activeThreadId: threadId })
            }
            onDelete={removeThread}
            onCollapse={() => setSidebarCollapsed(true)}
          />
        )}
        {workspace.activeView === "workbench" && sidebarCollapsed && (
          <button
            className="sidebar-expand"
            type="button"
            title="Expand sessions"
            aria-label="Expand sessions"
            onClick={() => setSidebarCollapsed(false)}
          >
            <PanelLeftOpen size={17} />
          </button>
        )}

        <div className="view-host">
          {workspace.activeView === "workbench" && (
            <Workbench
              thread={activeThread}
              settings={workspace.settings}
              models={models}
              runtimeOnline={health.online}
              onUpdateThread={updateThread}
              onModelChange={selectModel}
              onOpenModels={() => selectView("models")}
            />
          )}
          {workspace.activeView === "studio" && (
            <StudioView
              studio={workspace.studio}
              imageModels={workspace.imageModels}
              assets={workspace.assets}
              activeRun={activeImageRun}
              upscalerConfigured={Boolean(
                workspace.settings.upscalerModelPath.trim(),
              )}
              faceDetectorConfigured={Boolean(
                workspace.settings.faceDetectorModelPath.trim(),
              )}
              nsfwSegmenterConfigured={Boolean(
                workspace.settings.nsfwSegmenterModelPath.trim(),
              )}
              installingEnhancement={installingEnhancement}
              enhancementInstallError={enhancementInstallError}
              visionAvailable={health.online && Boolean(selectedModelName)}
              visionModel={selectedModelName}
              preview={
                imagePreview &&
                imagePreview.jobId === activeImageRun?.id &&
                imagePreview.outputUrl
                  ? {
                      src: imagePreview.outputUrl,
                      step: imagePreview.step,
                      total: imagePreview.total,
                    }
                  : undefined
              }
              onChange={(patch) =>
                setWorkspace((current) => ({
                  ...current,
                  studio: { ...current.studio, ...patch },
                }))
              }
              onGenerate={(action) => void startImage(action)}
              onCancel={(jobId) => void forgeApi.jobs.cancel(jobId)}
              onScanModels={scanImageModels}
              onImportAssets={importStudioAssets}
              onRemoveModel={removeImageModel}
              onOpenSettings={() => selectView("settings")}
              onInstallEnhancement={(kind) => void installEnhancement(kind)}
              onDescribeImage={async (imageUrl, mode) => {
                const result = await forgeApi.vision.describe({
                  baseUrl: workspace.settings.ollamaUrl,
                  model: selectedModelName,
                  imageUrl,
                  mode,
                });
                return result.text;
              }}
            />
          )}
          {workspace.activeView === "library" && (
            <LibraryView
              assets={workspace.assets}
              onImport={importStudioAssets}
              onOpenInStudio={(asset) =>
                setWorkspace((current) => ({
                  ...current,
                  activeView: "studio",
                  studio: {
                    ...current.studio,
                    activeAsset: asset.src,
                    prompt: asset.prompt,
                  },
                }))
              }
              onRemove={(asset) => void removeAsset(asset)}
            />
          )}
          {workspace.activeView === "models" && (
            <ModelsView
              health={health}
              models={models}
              baseUrl={workspace.settings.ollamaUrl}
              selectedModel={selectedModelName}
              onSelect={selectModel}
              onRefresh={() => void checkRuntime()}
            />
          )}
          {workspace.activeView === "tune" && (
            <TuneView
              tune={workspace.tune}
              activeRun={activeTuneRun}
              onChange={(patch) =>
                setWorkspace((current) => ({
                  ...current,
                  tune: { ...current.tune, ...patch },
                }))
              }
              onStart={() => void startTraining()}
              onCancel={(jobId) => void forgeApi.jobs.cancel(jobId)}
            />
          )}
          {workspace.activeView === "activity" && (
            <ActivityView
              runs={workspace.runs}
              onCancel={(id) => void forgeApi.jobs.cancel(id)}
              onReveal={(outputPath) =>
                void forgeApi.jobs.revealOutput(outputPath)
              }
              onRemove={(id) =>
                setWorkspace((current) => ({
                  ...current,
                  runs: current.runs.filter((run) => run.id !== id),
                }))
              }
              onRetry={(run) => void retryRun(run)}
              onOpenImage={openRunImage}
            />
          )}
          {workspace.activeView === "settings" && (
            <SettingsView
              settings={workspace.settings}
              health={health}
              system={system}
              models={models}
              onChange={(patch) =>
                setWorkspace((current) => ({
                  ...current,
                  settings: { ...current.settings, ...patch },
                }))
              }
              onCheckRuntime={() => void checkRuntime()}
            />
          )}
        </div>

        {workspace.activeView === "workbench" && (
          <RuntimePanel
            health={health}
            system={system}
            selectedModel={selectedModel}
            thread={activeThread}
            runs={workspace.runs}
          />
        )}
      </div>
      {commandOpen && (
        <CommandPalette
          actions={paletteActions}
          onClose={() => setCommandOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
