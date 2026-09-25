import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ImageGenerationRequest,
  JobEvent,
  JobKind,
  TrainingRequest,
} from "../src/types";
import { JobProcessManager, type WorkerEvent } from "./job-runner";

interface JobPaths {
  runtimeDirectory: () => string;
  outputDirectory: () => string;
  imageWorker?: () => string;
  trainingWorker?: () => string;
}

interface ActiveJob {
  kind: JobKind;
  outputDirectory: string;
  emit: (event: JobEvent) => void;
  previewPaths: Set<string>;
}

const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const PREVIEW_FILE_PATTERN = /^preview-[A-Za-z0-9_-]+\.png$/;
const NSFW_SEGMENTER_FILES = [
  "nsfw-seg-breast-x.pt",
  "nsfw-seg-penis-x.pt",
  "nsfw-seg-vagina-x.pt",
];

function assertNumber(
  value: number,
  name: string,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
}

function assertBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
}

function assertJobId(value: string): void {
  if (!JOB_ID_PATTERN.test(value)) throw new Error("Invalid job ID.");
}

async function assertFile(filePath: string, label: string): Promise<void> {
  try {
    if (!(await fs.stat(filePath)).isFile()) throw new Error();
  } catch {
    throw new Error(`${label} was not found: ${filePath}`);
  }
}

async function assertModelFile(
  filePath: string,
  label: string,
  extensions: string[],
): Promise<void> {
  await assertFile(filePath, label);
  if (!extensions.includes(path.extname(filePath).toLowerCase())) {
    throw new Error(
      `${label} must use one of these formats: ${extensions.join(", ")}.`,
    );
  }
}

async function assertDirectory(
  directory: string,
  label: string,
): Promise<void> {
  try {
    if (!(await fs.stat(directory)).isDirectory()) throw new Error();
  } catch {
    throw new Error(`${label} was not found: ${directory}`);
  }
}

function assertInside(root: string, candidate: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Worker output escaped the Local Forge output directory.");
  }
}

function workerMessage(event: WorkerEvent): string {
  const value = event.message ?? event.text;
  return typeof value === "string" ? value.slice(0, 16_384) : "";
}

export class LocalJobManager {
  private readonly processes = new JobProcessManager();
  private readonly active = new Map<string, ActiveJob>();

  constructor(private readonly paths: JobPaths) {}

  async startImage(
    request: ImageGenerationRequest,
    emit: (event: JobEvent) => void,
  ): Promise<void> {
    assertJobId(request.jobId);
    this.assertPythonPath(request.pythonPath);
    if (!request.prompt.trim()) throw new Error("An image prompt is required.");
    if (request.prompt.length > 20_000)
      throw new Error("The image prompt is too long.");
    if (request.model.format !== "diffusers") {
      throw new Error(
        "Image execution currently requires a Diffusers model directory. Single-file checkpoints must be converted first.",
      );
    }
    await assertDirectory(request.model.path, "Image model");
    await assertFile(
      path.join(request.model.path, "model_index.json"),
      "Diffusers model index",
    );
    assertNumber(request.width, "Width", 256, 2048);
    assertNumber(request.height, "Height", 256, 2048);
    if (request.width % 8 || request.height % 8) {
      throw new Error("Image dimensions must be divisible by 8.");
    }
    assertNumber(request.steps, "Steps", 1, 100);
    assertNumber(request.guidance, "Guidance", 0, 30);
    assertNumber(request.seed, "Seed", 0, 2 ** 32 - 1);
    assertBoolean(request.faceFix, "Face Fix");
    assertNumber(request.faceFixStrength, "Face Fix strength", 0.1, 0.8);
    assertBoolean(request.upscale, "Upscale");
    assertBoolean(request.nsfwSegmentation, "NSFW segmentation");
    if (request.upscaleFactor !== 2 && request.upscaleFactor !== 4) {
      throw new Error("Upscale factor must be 2 or 4.");
    }
    if (request.faceFix) {
      await assertModelFile(
        request.faceDetectorModelPath,
        "Face detector model",
        [".pt"],
      );
    }
    if (request.upscale) {
      await assertModelFile(request.upscalerModelPath, "Upscaler model", [
        ".pth",
        ".pt",
        ".safetensors",
      ]);
    }
    if (request.nsfwSegmentation) {
      await assertDirectory(
        request.nsfwSegmenterModelPath,
        "NSFW segmentation model directory",
      );
      await Promise.all(
        NSFW_SEGMENTER_FILES.map((filename) =>
          assertFile(
            path.join(request.nsfwSegmenterModelPath, filename),
            `NSFW segmentation model ${filename}`,
          ),
        ),
      );
    }
    if (Boolean(request.sourceImage) !== Boolean(request.editRegion)) {
      throw new Error(
        "Image edits require both a source image and a selection.",
      );
    }
    if (request.sourceImage && request.editRegion) {
      await assertModelFile(request.sourceImage, "Source image", [
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
      ]);
      const { x, y, width, height } = request.editRegion;
      assertNumber(x, "Selection x", 0, 1);
      assertNumber(y, "Selection y", 0, 1);
      assertNumber(width, "Selection width", 0.01, 1);
      assertNumber(height, "Selection height", 0.01, 1);
      if (x + width > 1 || y + height > 1) {
        throw new Error(
          "The image edit selection must stay inside the source image.",
        );
      }
      if ((request.editPrompt?.length ?? 0) > 2_000) {
        throw new Error("The image edit instruction is too long.");
      }
      assertNumber(request.editStrength ?? 0.65, "Edit strength", 0.1, 1);
    }

    const outputDirectory = path.join(this.paths.outputDirectory(), "images");
    await fs.mkdir(outputDirectory, { recursive: true });
    const worker =
      this.paths.imageWorker?.() ??
      path.join(this.paths.runtimeDirectory(), "image_worker.py");
    await assertFile(worker, "Local Forge image worker");
    this.start(
      "image",
      request.jobId,
      request.pythonPath,
      [
        worker,
        "--model",
        request.model.path,
        "--output",
        outputDirectory,
        "--job-id",
        request.jobId,
      ],
      {
        prompt: request.prompt,
        negative_prompt: request.negativePrompt,
        width: request.width,
        height: request.height,
        steps: request.steps,
        guidance: request.guidance,
        seed: request.seed,
        face_fix: request.faceFix,
        face_fix_strength: request.faceFixStrength,
        face_detector_model: request.faceDetectorModelPath,
        upscale: request.upscale,
        upscale_factor: request.upscaleFactor,
        upscaler_model: request.upscalerModelPath,
        nsfw_segmentation: request.nsfwSegmentation,
        nsfw_segmenter_model_dir: request.nsfwSegmenterModelPath,
        ...(request.sourceImage && request.editRegion
          ? {
              source_image: request.sourceImage,
              edit_region: request.editRegion,
              edit_prompt: request.editPrompt?.trim() ?? "",
              edit_strength: request.editStrength ?? 0.65,
            }
          : {}),
      },
      outputDirectory,
      emit,
    );
  }

  async startTraining(
    request: TrainingRequest,
    emit: (event: JobEvent) => void,
  ): Promise<void> {
    assertJobId(request.jobId);
    this.assertPythonPath(request.pythonPath);
    await assertDirectory(request.modelPath, "Training model");
    await assertFile(
      path.join(request.modelPath, "config.json"),
      "Transformers model config",
    );
    await assertFile(request.datasetPath, "Training dataset");
    assertNumber(request.epochs, "Epochs", 1, 100);
    assertNumber(request.batchSize, "Batch size", 1, 64);
    assertNumber(request.gradientAccumulation, "Gradient accumulation", 1, 256);
    assertNumber(request.learningRate, "Learning rate", Number.EPSILON, 0.1);
    assertNumber(request.loraRank, "LoRA rank", 1, 256);
    assertNumber(request.maxSequenceLength, "Max sequence length", 128, 32_768);

    const outputDirectory = path.join(
      this.paths.outputDirectory(),
      "adapters",
      request.jobId,
    );
    await fs.mkdir(outputDirectory, { recursive: true });
    const worker =
      this.paths.trainingWorker?.() ??
      path.join(this.paths.runtimeDirectory(), "train_worker.py");
    await assertFile(worker, "Local Forge training worker");
    this.start(
      "tune",
      request.jobId,
      request.pythonPath,
      [
        worker,
        "--model",
        request.modelPath,
        "--dataset",
        request.datasetPath,
        "--output",
        outputDirectory,
      ],
      {
        epochs: request.epochs,
        batch_size: request.batchSize,
        gradient_accumulation: request.gradientAccumulation,
        learning_rate: request.learningRate,
        lora_rank: request.loraRank,
        max_sequence_length: request.maxSequenceLength,
        use_4bit: request.use4Bit,
        gradient_checkpointing: request.gradientCheckpointing,
      },
      outputDirectory,
      emit,
    );
  }

  cancel(jobId: string): boolean {
    return this.processes.cancel(jobId);
  }

  cancelAll(): void {
    this.processes.cancelAll();
  }

  async cleanupPreviews(): Promise<void> {
    const outputDirectory = path.join(this.paths.outputDirectory(), "images");
    let entries;
    try {
      entries = await fs.readdir(outputDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    await Promise.all(
      entries
        .filter(
          (entry) => entry.isFile() && PREVIEW_FILE_PATTERN.test(entry.name),
        )
        .map((entry) =>
          fs.rm(path.join(outputDirectory, entry.name), { force: true }),
        ),
    );
  }

  private assertPythonPath(value: string): void {
    if (
      !value.trim() ||
      value.length > 4096 ||
      /[\r\n]/.test(value) ||
      value.includes("\0")
    ) {
      throw new Error("Select a valid Python executable in Settings.");
    }
  }

  private start(
    kind: JobKind,
    jobId: string,
    pythonPath: string,
    args: string[],
    input: unknown,
    outputDirectory: string,
    emit: (event: JobEvent) => void,
  ): void {
    if (this.active.has(jobId))
      throw new Error(`Job ${jobId} is already active.`);
    this.active.set(jobId, {
      kind,
      outputDirectory,
      emit,
      previewPaths: new Set(),
    });
    emit({ jobId, kind, type: "queued", progress: 0 });
    try {
      this.processes.start(
        {
          id: jobId,
          command: pythonPath.trim(),
          args,
          input,
          env: {
            ...process.env,
            PYTHONUNBUFFERED: "1",
            HF_HUB_OFFLINE: "1",
            TRANSFORMERS_OFFLINE: "1",
          },
        },
        (event) => void this.handleWorkerEvent(jobId, event),
      );
    } catch (error) {
      this.active.delete(jobId);
      throw error;
    }
  }

  private async handleWorkerEvent(
    jobId: string,
    event: WorkerEvent,
  ): Promise<void> {
    const job = this.active.get(jobId);
    if (!job) return;

    if (event.type === "progress") {
      const step = Number(event.step);
      const total = Number(event.total);
      const progress =
        Number.isFinite(step) && Number.isFinite(total) && total > 0
          ? Math.max(0, Math.min(99, Math.round((step / total) * 100)))
          : undefined;
      job.emit({
        jobId,
        kind: job.kind,
        type: "progress",
        progress,
        step: Number.isFinite(step) ? step : undefined,
        total: Number.isFinite(total) ? total : undefined,
      });
      return;
    }
    if (event.type === "preview") {
      let outputPath = "";
      try {
        if (job.kind !== "image" || typeof event.path !== "string") {
          throw new Error("Worker preview is not a valid image output.");
        }
        outputPath = path.resolve(event.path);
        assertInside(job.outputDirectory, outputPath);
        if (!PREVIEW_FILE_PATTERN.test(path.basename(outputPath))) {
          throw new Error("Worker preview has an invalid filename.");
        }
        job.previewPaths.add(outputPath);
        const stat = await fs.stat(outputPath);
        if (!stat.isFile()) throw new Error("Worker preview is not a file.");
        if (this.active.get(jobId) !== job) {
          await fs.rm(outputPath, { force: true });
          return;
        }
        const step = Number(event.step);
        const total = Number(event.total);
        const progress =
          Number.isFinite(step) && Number.isFinite(total) && total > 0
            ? Math.max(0, Math.min(99, Math.round((step / total) * 100)))
            : undefined;
        job.emit({
          jobId,
          kind: job.kind,
          type: "preview",
          outputPath,
          progress,
          step: Number.isFinite(step) ? step : undefined,
          total: Number.isFinite(total) ? total : undefined,
          width: Number.isFinite(Number(event.width))
            ? Number(event.width)
            : undefined,
          height: Number.isFinite(Number(event.height))
            ? Number(event.height)
            : undefined,
        });
      } catch (error) {
        if (outputPath) job.previewPaths.delete(outputPath);
        if (this.active.get(jobId) !== job) return;
        job.emit({
          jobId,
          kind: job.kind,
          type: "log",
          message: `Preview ignored: ${
            error instanceof Error ? error.message : "invalid worker output"
          }`,
        });
      }
      return;
    }
    if (event.type === "status" || event.type === "log") {
      job.emit({
        jobId,
        kind: job.kind,
        type: event.type,
        message: workerMessage(event),
      });
      return;
    }
    if (event.type === "error" || event.type === "cancelled") {
      this.active.delete(jobId);
      await this.cleanupJobPreviews(job);
      job.emit({
        jobId,
        kind: job.kind,
        type: event.type,
        message: workerMessage(event),
      });
      return;
    }
    if (event.type !== "done") return;

    try {
      if (typeof event.path !== "string") {
        throw new Error("Worker completed without an output path.");
      }
      const outputPath = path.resolve(event.path);
      assertInside(job.outputDirectory, outputPath);
      const stat = await fs.stat(outputPath);
      if (job.kind === "image" && !stat.isFile()) {
        throw new Error("Image worker output is not a file.");
      }
      if (job.kind === "tune" && !stat.isDirectory()) {
        throw new Error("Training worker output is not a directory.");
      }
      this.active.delete(jobId);
      await this.cleanupJobPreviews(job);
      job.emit({
        jobId,
        kind: job.kind,
        type: "done",
        progress: 100,
        outputPath,
        width: Number.isFinite(Number(event.width))
          ? Number(event.width)
          : undefined,
        height: Number.isFinite(Number(event.height))
          ? Number(event.height)
          : undefined,
      });
    } catch (error) {
      this.active.delete(jobId);
      await this.cleanupJobPreviews(job);
      job.emit({
        jobId,
        kind: job.kind,
        type: "error",
        message:
          error instanceof Error ? error.message : "Invalid worker output.",
      });
    }
  }

  private async cleanupJobPreviews(job: ActiveJob): Promise<void> {
    const previewPaths = [...job.previewPaths];
    job.previewPaths.clear();
    await Promise.all(
      previewPaths.map((previewPath) =>
        fs.rm(previewPath, { force: true }).catch(() => undefined),
      ),
    );
  }
}
