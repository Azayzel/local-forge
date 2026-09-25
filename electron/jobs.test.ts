import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JobEvent } from "../src/types";
import { LocalJobManager } from "./jobs";

const fixture = path.resolve("tests/fixtures/local-job-worker.mjs");
const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "local-forge-job-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

async function waitForDone(events: JobEvent[]): Promise<JobEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          new Error(`Timed out waiting for job: ${JSON.stringify(events)}`),
        ),
      3_000,
    );
    const interval = setInterval(() => {
      const event = events.find(
        (candidate) => candidate.type === "done" || candidate.type === "error",
      );
      if (!event) return;
      clearTimeout(timeout);
      clearInterval(interval);
      resolve(event);
    }, 5);
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("LocalJobManager", () => {
  it("maps an image worker's progress and verified output", async () => {
    const root = await temporaryDirectory();
    const modelPath = path.join(root, "image-model");
    const upscalerPath = path.join(root, "4x-UltraSharp.pth");
    const faceDetectorPath = path.join(root, "face-detector.pt");
    const segmenterPath = path.join(root, "nsfw-segmentation");
    await fs.mkdir(modelPath);
    await fs.mkdir(segmenterPath);
    await fs.writeFile(path.join(modelPath, "model_index.json"), "{}");
    await fs.writeFile(upscalerPath, "fixture");
    await fs.writeFile(faceDetectorPath, "fixture");
    await Promise.all(
      ["breast", "penis", "vagina"].map((region) =>
        fs.writeFile(
          path.join(segmenterPath, `nsfw-seg-${region}-x.pt`),
          "fixture",
        ),
      ),
    );
    const events: JobEvent[] = [];
    const manager = new LocalJobManager({
      runtimeDirectory: () => root,
      outputDirectory: () => path.join(root, "outputs"),
      imageWorker: () => fixture,
    });

    await manager.startImage(
      {
        jobId: "image-fixture",
        pythonPath: process.execPath,
        model: {
          id: modelPath,
          name: "fixture",
          path: modelPath,
          format: "diffusers",
          architecture: "FixturePipeline",
          modifiedAt: new Date().toISOString(),
        },
        prompt: "A fixture image",
        negativePrompt: "",
        width: 512,
        height: 512,
        steps: 2,
        guidance: 5,
        seed: 42,
        faceFix: true,
        faceFixStrength: 0.4,
        faceDetectorModelPath: faceDetectorPath,
        upscale: true,
        upscaleFactor: 4,
        upscalerModelPath: upscalerPath,
        nsfwSegmentation: true,
        nsfwSegmenterModelPath: segmenterPath,
      },
      (event) => events.push(event),
    );

    const done = await waitForDone(events);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "progress",
        progress: 50,
        step: 1,
        total: 2,
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "preview",
        outputPath: path.join(
          root,
          "outputs",
          "images",
          "preview-fixture-1.png",
        ),
        step: 1,
        total: 2,
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "log",
        message: expect.stringContaining(
          "Worker output escaped the Local Forge output directory",
        ),
      }),
    );
    expect(
      events.some(
        (event) => event.type === "preview" && event.outputPath === fixture,
      ),
    ).toBe(false);
    expect(done).toEqual(
      expect.objectContaining({
        type: "done",
        progress: 100,
        width: 640,
        height: 512,
      }),
    );
    await expect(
      fs.stat(path.join(root, "outputs", "images", "preview-fixture-1.png")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.stat(path.join(root, "outputs", "images", "fixture.png")),
    ).resolves.toMatchObject({ size: 7 });
    await expect(
      fs.readFile(path.join(root, "outputs", "images", "request.json"), "utf8"),
    ).resolves.toEqual(
      JSON.stringify({
        prompt: "A fixture image",
        negative_prompt: "",
        width: 512,
        height: 512,
        steps: 2,
        guidance: 5,
        seed: 42,
        face_fix: true,
        face_fix_strength: 0.4,
        face_detector_model: faceDetectorPath,
        upscale: true,
        upscale_factor: 4,
        upscaler_model: upscalerPath,
        nsfw_segmentation: true,
        nsfw_segmenter_model_dir: segmenterPath,
      }),
    );
  });

  it("purges stale previews without deleting final images", async () => {
    const root = await temporaryDirectory();
    const outputDirectory = path.join(root, "outputs", "images");
    const preview = path.join(outputDirectory, "preview-stale-job-001.png");
    const final = path.join(outputDirectory, "final-image.png");
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(preview, "preview");
    await fs.writeFile(final, "final");
    const manager = new LocalJobManager({
      runtimeDirectory: () => root,
      outputDirectory: () => path.join(root, "outputs"),
    });

    await manager.cleanupPreviews();

    await expect(fs.stat(preview)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.readFile(final, "utf8")).resolves.toBe("final");
  });

  it("runs training only with a local Transformers model and dataset", async () => {
    const root = await temporaryDirectory();
    const modelPath = path.join(root, "language-model");
    const datasetPath = path.join(root, "train.jsonl");
    await fs.mkdir(modelPath);
    await fs.writeFile(path.join(modelPath, "config.json"), "{}");
    await fs.writeFile(datasetPath, '{"text":"fixture"}\n');
    const events: JobEvent[] = [];
    const manager = new LocalJobManager({
      runtimeDirectory: () => root,
      outputDirectory: () => path.join(root, "outputs"),
      trainingWorker: () => fixture,
    });

    await manager.startTraining(
      {
        jobId: "training-fixture",
        pythonPath: process.execPath,
        modelPath,
        datasetPath,
        epochs: 1,
        batchSize: 1,
        gradientAccumulation: 8,
        learningRate: 0.0002,
        loraRank: 8,
        maxSequenceLength: 1024,
        use4Bit: false,
        gradientCheckpointing: true,
      },
      (event) => events.push(event),
    );

    const done = await waitForDone(events);
    expect(done).toEqual(
      expect.objectContaining({ type: "done", kind: "tune", progress: 100 }),
    );
    expect(done.outputPath).toMatch(/[\\/]adapters[\\/]training-fixture$/);
  });

  it("rejects missing enabled enhancement models before spawning Python", async () => {
    const root = await temporaryDirectory();
    const modelPath = path.join(root, "image-model");
    await fs.mkdir(modelPath);
    await fs.writeFile(path.join(modelPath, "model_index.json"), "{}");
    const manager = new LocalJobManager({
      runtimeDirectory: () => root,
      outputDirectory: () => path.join(root, "outputs"),
      imageWorker: () => fixture,
    });
    const request = {
      jobId: "enhancement-fixture",
      pythonPath: process.execPath,
      model: {
        id: modelPath,
        name: "fixture",
        path: modelPath,
        format: "diffusers" as const,
        architecture: "FixturePipeline",
        modifiedAt: new Date().toISOString(),
      },
      prompt: "A fixture image",
      negativePrompt: "",
      width: 512,
      height: 512,
      steps: 2,
      guidance: 5,
      seed: 42,
      faceFix: false,
      faceFixStrength: 0.45,
      faceDetectorModelPath: "",
      upscale: false,
      upscaleFactor: 2 as const,
      upscalerModelPath: "",
      nsfwSegmentation: false,
      nsfwSegmenterModelPath: "",
    };

    await expect(
      manager.startImage(
        {
          ...request,
          faceFix: true,
          faceDetectorModelPath: path.join(root, "missing-face.pt"),
        },
        () => undefined,
      ),
    ).rejects.toThrow("Face detector model was not found");
    await expect(
      manager.startImage(
        {
          ...request,
          upscale: true,
          upscalerModelPath: path.join(root, "missing-upscaler.pth"),
        },
        () => undefined,
      ),
    ).rejects.toThrow("Upscaler model was not found");
    await expect(
      manager.startImage(
        {
          ...request,
          nsfwSegmentation: true,
          nsfwSegmenterModelPath: path.join(root, "missing-segmenters"),
        },
        () => undefined,
      ),
    ).rejects.toThrow("NSFW segmentation model directory was not found");
  });

  it("rejects single-file image checkpoints before spawning Python", async () => {
    const root = await temporaryDirectory();
    const manager = new LocalJobManager({
      runtimeDirectory: () => root,
      outputDirectory: () => path.join(root, "outputs"),
    });

    await expect(
      manager.startImage(
        {
          jobId: "checkpoint-fixture",
          pythonPath: process.execPath,
          model: {
            id: "checkpoint",
            name: "checkpoint",
            path: path.join(root, "model.safetensors"),
            format: "checkpoint",
            architecture: "Single-file checkpoint",
            modifiedAt: new Date().toISOString(),
          },
          prompt: "Test",
          negativePrompt: "",
          width: 512,
          height: 512,
          steps: 2,
          guidance: 5,
          seed: 42,
          faceFix: false,
          faceFixStrength: 0.45,
          faceDetectorModelPath: "",
          upscale: false,
          upscaleFactor: 2,
          upscalerModelPath: "",
          nsfwSegmentation: false,
          nsfwSegmenterModelPath: "",
        },
        () => undefined,
      ),
    ).rejects.toThrow("requires a Diffusers model directory");
  });
});
