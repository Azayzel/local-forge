import { describe, expect, it } from "vitest";
import {
  appendRunLog,
  createDefaultWorkspace,
  normalizeWorkspace,
  titleFromPrompt,
} from "./workspace";

describe("workspace state", () => {
  it("creates a usable first session", () => {
    const workspace = createDefaultWorkspace();

    expect(workspace.version).toBe(3);
    expect(workspace.activeView).toBe("workbench");
    expect(workspace.threads).toHaveLength(1);
    expect(workspace.activeThreadId).toBe(workspace.threads[0].id);
    expect(workspace.settings.ollamaUrl).toBe("http://127.0.0.1:11434");
    expect(workspace.studio.preset).toBe("Editorial");
    expect(workspace.studio.model).toBe("");
    expect(workspace.assets).toHaveLength(4);
    expect(workspace.settings.theme).toBe("forge");
    expect(workspace.settings.mcpServers).toEqual([]);
    expect(workspace.settings.pythonPath).toBe("python");
    expect(workspace.settings.upscalerModelPath).toBe("");
    expect(workspace.settings.faceDetectorModelPath).toBe("");
    expect(workspace.settings.nsfwSegmenterModelPath).toBe("");
    expect(workspace.settings.nsfwConsent).toBe(false);
    expect(workspace.studio.upscale).toBe(false);
    expect(workspace.studio.faceFix).toBe(false);
    expect(workspace.studio.nsfwSegmentation).toBe(false);
    expect(workspace.studio.nsfwDefaults).toBe(false);
    expect(workspace.tune.gradientAccumulation).toBe(8);
  });

  it("recovers from invalid persisted data", () => {
    const workspace = normalizeWorkspace({ version: 99, threads: [] });

    expect(workspace.version).toBe(3);
    expect(workspace.threads).toHaveLength(1);
    expect(workspace.activeThreadId).toBe(workspace.threads[0].id);
  });

  it("fills missing settings while preserving valid sessions", () => {
    const persisted = {
      version: 1,
      activeView: "studio",
      activeThreadId: "thread-existing",
      threads: [
        {
          id: "thread-existing",
          title: "Existing work",
          updatedAt: "2026-09-23T10:00:00.000Z",
          model: "qwen3:8b",
          pinned: false,
          messages: [],
        },
      ],
      settings: { temperature: 0.2 },
    };

    const workspace = normalizeWorkspace(persisted);

    expect(workspace.activeView).toBe("studio");
    expect(workspace.activeThreadId).toBe("thread-existing");
    expect(workspace.settings.temperature).toBe(0.2);
    expect(workspace.settings.contextLength).toBe(8192);
    expect(workspace.settings.theme).toBe("forge");
  });

  it("does not restore NSFW defaults without persisted consent", () => {
    const persisted = createDefaultWorkspace();
    persisted.settings.nsfwConsent = false;
    persisted.studio.nsfwDefaults = true;
    persisted.studio.prompt = "Persisted adult prompt";
    persisted.studio.model = "adult-model";
    persisted.imageModels = [
      {
        id: "adult-model",
        name: "portrait-nsfw",
        path: "D:/models/portrait-nsfw",
        format: "diffusers",
        architecture: "StableDiffusionPipeline",
        modifiedAt: "2026-09-25T00:00:00.000Z",
      },
    ];

    const workspace = normalizeWorkspace(persisted);

    expect(workspace.settings.nsfwConsent).toBe(false);
    expect(workspace.studio.nsfwDefaults).toBe(false);
    expect(workspace.studio.model).toBe("");
    expect(workspace.studio.prompt).toBe(
      createDefaultWorkspace().studio.prompt,
    );
  });

  it("migrates version one workspaces and preserves MCP configuration", () => {
    const persisted = {
      ...createDefaultWorkspace(),
      version: 1,
      settings: {
        ...createDefaultWorkspace().settings,
        theme: "midnight",
        mcpServers: [
          {
            id: "filesystem",
            name: "Filesystem",
            enabled: true,
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "D:/notes"],
            cwd: "",
            env: {},
            url: "",
            headers: {},
          },
        ],
      },
    };

    const workspace = normalizeWorkspace(persisted);

    expect(workspace.version).toBe(3);
    expect(workspace.settings.theme).toBe("midnight");
    expect(workspace.settings.mcpServers).toHaveLength(1);
    expect(workspace.settings.mcpServers[0].command).toBe("npx");
    expect(workspace.settings.mcpToolApproval).toBe("always-ask");
  });

  it("migrates legacy non-executable queued work to drafts", () => {
    const persisted = { ...createDefaultWorkspace(), version: 2 };
    persisted.runs = [
      {
        id: "image-run",
        kind: "image",
        name: "Studio render",
        status: "queued",
        progress: 42,
        startedAt: "2026-09-23T10:00:00.000Z",
      },
      {
        id: "benchmark-run",
        kind: "benchmark",
        name: "Live benchmark",
        status: "queued",
        progress: 25,
        startedAt: "2026-09-23T10:01:00.000Z",
      },
    ];

    const workspace = normalizeWorkspace(persisted);

    expect(workspace.runs[0]).toMatchObject({ status: "draft", progress: 0 });
    expect(workspace.runs[1]).toMatchObject({ status: "queued", progress: 25 });
  });

  it("marks executable work interrupted across an application restart", () => {
    const persisted = createDefaultWorkspace();
    persisted.runs = [
      {
        id: "training-run",
        kind: "tune",
        name: "Adapter training",
        status: "running",
        progress: 42,
        startedAt: "2026-09-23T10:00:00.000Z",
      },
    ];

    const workspace = normalizeWorkspace(persisted);

    expect(workspace.runs[0]).toMatchObject({
      status: "failed",
      progress: 42,
      error: "Interrupted when Local Forge closed.",
    });
    expect(workspace.runs[0].logs?.at(-1)).toMatchObject({
      kind: "error",
      message: "Interrupted when Local Forge closed.",
    });
  });

  it("bounds persisted job logs and discards invalid entries", () => {
    const logs = Array.from({ length: 205 }, (_, index) => ({
      timestamp: `2026-09-24T10:00:${String(index).padStart(2, "0")}.000Z`,
      kind: "log" as const,
      message: `line ${index}`,
    }));
    const next = appendRunLog(logs, {
      timestamp: "2026-09-24T10:04:00.000Z",
      kind: "success",
      message: "done",
    });

    expect(next).toHaveLength(200);
    expect(next[0].message).toBe("line 6");
    expect(next.at(-1)?.message).toBe("done");

    const persisted = createDefaultWorkspace();
    persisted.runs = [
      {
        id: "logged-run",
        kind: "image",
        name: "Logged image",
        status: "complete",
        progress: 100,
        startedAt: "2026-09-24T10:00:00.000Z",
        logs: [
          ...logs,
          { timestamp: "", kind: "invalid" as "log", message: "bad" },
        ],
      },
    ];

    const workspace = normalizeWorkspace(persisted);
    expect(workspace.runs[0].logs).toHaveLength(200);
    expect(
      workspace.runs[0].logs?.some((entry) => entry.message === "bad"),
    ).toBe(false);
  });

  it("migrates the prototype model while preserving registered selections", () => {
    const legacy = createDefaultWorkspace();
    legacy.studio.model = "Flux.1 Schnell";
    const migrated = normalizeWorkspace(legacy);

    const persisted = createDefaultWorkspace();
    persisted.imageModels = [
      {
        id: "D:/models/real-model",
        name: "real-model",
        path: "D:/models/real-model",
        format: "diffusers",
        architecture: "StableDiffusionXLPipeline",
        modifiedAt: "2026-09-24T10:00:00.000Z",
      },
    ];
    persisted.studio.model = persisted.imageModels[0].id;
    const restored = normalizeWorkspace(persisted);

    expect(migrated.studio.model).toBe("");
    expect(restored.imageModels).toHaveLength(1);
    expect(restored.studio.model).toBe("D:/models/real-model");
  });

  it("makes legacy bundled image URLs relative for packaged Electron", () => {
    const persisted = createDefaultWorkspace();
    persisted.studio.activeAsset = "/demo/forge-01.jpg";
    persisted.assets[0].src = "/demo/forge-01.jpg";

    const restored = normalizeWorkspace(persisted);

    expect(restored.studio.activeAsset).toBe("./demo/forge-01.jpg");
    expect(restored.assets[0].src).toBe("./demo/forge-01.jpg");
  });
});

describe("titleFromPrompt", () => {
  it("normalizes whitespace and keeps short prompts intact", () => {
    expect(titleFromPrompt("  Review   this architecture  ")).toBe(
      "Review this architecture",
    );
  });

  it("caps long prompts at a scannable sidebar length", () => {
    const title = titleFromPrompt(
      "Compare this implementation with a completely different architecture and explain the tradeoffs",
    );

    expect(title).toHaveLength(42);
    expect(title.endsWith("...")).toBe(true);
  });
});
