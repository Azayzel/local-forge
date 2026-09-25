import type {
  ModelCatalogCategory,
  ModelCatalogItem,
  ModelCatalogResponse,
  ModelCompatibility,
  ModelCatalogRuntime,
  SystemSnapshot,
} from "../src/types";

const GIB = 1024 ** 3;
const REQUEST_TIMEOUT_MS = 12_000;
const HUGGING_FACE_RESULTS_PER_GROUP = 5;

interface CatalogFetchResult {
  items: ModelCatalogItem[];
  warnings: string[];
}

interface OllamaManifest {
  layers?: Array<{
    mediaType?: unknown;
    size?: unknown;
  }>;
}

interface HuggingFaceModel {
  id?: unknown;
  modelId?: unknown;
  gated?: unknown;
  lastModified?: unknown;
  likes?: unknown;
  downloads?: unknown;
  tags?: unknown;
  pipeline_tag?: unknown;
  library_name?: unknown;
  config?: {
    architectures?: unknown;
  };
  transformersInfo?: {
    auto_model?: unknown;
  };
  siblings?: Array<{
    rfilename?: unknown;
    size?: unknown;
  }>;
  safetensors?: {
    total?: unknown;
  };
}

interface OllamaCandidate {
  tag: string;
  title: string;
  description: string;
  parameters: number;
  tags: string[];
}

interface CompatibilityInput {
  runtime: ModelCatalogRuntime;
  system: SystemSnapshot;
  sizeBytes?: number;
  parameters?: number;
  executorSupported: boolean;
  gated?: boolean;
  unsupportedReason?: string;
}

const OLLAMA_CANDIDATES: OllamaCandidate[] = [
  {
    tag: "qwen3:8b",
    title: "Qwen 3 8B",
    description: "Reasoning, multilingual chat, and tool use.",
    parameters: 8.19e9,
    tags: ["reasoning", "tools", "multilingual"],
  },
  {
    tag: "gemma3:4b",
    title: "Gemma 3 4B",
    description: "Fast general-purpose chat with image understanding.",
    parameters: 4.3e9,
    tags: ["vision", "general"],
  },
  {
    tag: "llama3.2:3b",
    title: "Llama 3.2 3B",
    description: "Compact instruction model for everyday local work.",
    parameters: 3.21e9,
    tags: ["compact", "general"],
  },
  {
    tag: "deepseek-r1:7b",
    title: "DeepSeek R1 7B",
    description: "Distilled reasoning model for deliberate problem solving.",
    parameters: 7e9,
    tags: ["reasoning"],
  },
  {
    tag: "qwen2.5-coder:7b",
    title: "Qwen 2.5 Coder 7B",
    description: "Code generation, review, and repository assistance.",
    parameters: 7.6e9,
    tags: ["code", "tools"],
  },
  {
    tag: "llama3.1:8b",
    title: "Llama 3.1 8B",
    description: "Reliable general chat with broad tool support.",
    parameters: 8.03e9,
    tags: ["general", "tools"],
  },
  {
    tag: "mistral:7b",
    title: "Mistral 7B",
    description: "Efficient instruction following and structured output.",
    parameters: 7.25e9,
    tags: ["general", "tools"],
  },
  {
    tag: "qwen3:14b",
    title: "Qwen 3 14B",
    description: "Higher-capacity reasoning and multilingual generation.",
    parameters: 14.8e9,
    tags: ["reasoning", "tools", "multilingual"],
  },
  {
    tag: "gemma3:12b",
    title: "Gemma 3 12B",
    description: "Capable multimodal model with a larger reasoning budget.",
    parameters: 12.2e9,
    tags: ["vision", "general"],
  },
  {
    tag: "qwen3:30b",
    title: "Qwen 3 30B A3B",
    description: "Mixture-of-experts reasoning with 3B active parameters.",
    parameters: 30.5e9,
    tags: ["reasoning", "tools", "moe"],
  },
];

const SUPPORTED_IMAGE_PIPELINES = new Set([
  "StableDiffusionPipeline",
  "StableDiffusionXLPipeline",
]);

const SUPPORTED_TRAINING_ARCHITECTURES = new Set([
  "GemmaForCausalLM",
  "Gemma2ForCausalLM",
  "Gemma3ForCausalLM",
  "LlamaForCausalLM",
  "MistralForCausalLM",
  "MixtralForCausalLM",
  "PhiForCausalLM",
  "Phi3ForCausalLM",
  "Qwen2ForCausalLM",
  "Qwen3ForCausalLM",
]);

function numberValue(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function compatibilityResult(
  compatibility: ModelCompatibility,
  compatibilityLabel: string,
  compatibilityReason: string,
): Pick<
  ModelCatalogItem,
  "compatibility" | "compatibilityLabel" | "compatibilityReason"
> {
  return { compatibility, compatibilityLabel, compatibilityReason };
}

export function assessModelCompatibility({
  runtime,
  system,
  sizeBytes,
  parameters,
  executorSupported,
  gated = false,
  unsupportedReason,
}: CompatibilityInput): Pick<
  ModelCatalogItem,
  "compatibility" | "compatibilityLabel" | "compatibilityReason"
> {
  if (gated) {
    return compatibilityResult(
      "unsupported",
      "Access required",
      "This repository requires Hugging Face approval or authentication.",
    );
  }
  if (runtime === "none") {
    return compatibilityResult(
      "catalog-only",
      "Browse only",
      unsupportedReason ??
        "Local Forge does not have an executor for this model yet.",
    );
  }
  if (!executorSupported) {
    return compatibilityResult(
      "unsupported",
      "Pipeline unsupported",
      unsupportedReason ??
        "The current Local Forge worker does not support this architecture.",
    );
  }

  const vramBytes = system.gpu.memoryTotalMb * 1024 ** 2;
  const ramBytes = system.totalMemoryMb * 1024 ** 2;
  if (runtime === "ollama") {
    if (!sizeBytes) {
      return compatibilityResult(
        "unsupported",
        "Size unknown",
        "The official Ollama manifest did not report a model size.",
      );
    }
    if (vramBytes > 0 && sizeBytes <= vramBytes * 0.68) {
      return compatibilityResult(
        "recommended",
        "Best fit",
        "The quantized model fits in GPU memory with working headroom.",
      );
    }
    if (vramBytes > 0 && sizeBytes <= vramBytes * 0.9) {
      return compatibilityResult(
        "supported",
        "GPU fit",
        "The quantized model should remain primarily in GPU memory.",
      );
    }
    if (sizeBytes <= ramBytes * 0.55) {
      return compatibilityResult(
        "tight",
        "RAM offload",
        "It should run using system-memory offload, with lower token speed.",
      );
    }
    return compatibilityResult(
      "unsupported",
      "Too large",
      "The quantized weights exceed the conservative local memory limit.",
    );
  }

  if (!system.gpu.available || vramBytes <= 0) {
    return compatibilityResult(
      "unsupported",
      "CUDA required",
      runtime === "transformers"
        ? "Local Forge QLoRA requires an NVIDIA CUDA GPU."
        : "This image pipeline is not recommended without an NVIDIA CUDA GPU.",
    );
  }
  if (!parameters) {
    return compatibilityResult(
      "unsupported",
      "Size unknown",
      "Hugging Face did not publish enough weight metadata to estimate VRAM use.",
    );
  }

  const estimatedVram =
    runtime === "transformers"
      ? parameters * 0.75 + 4 * GIB
      : parameters * 2.7 + 2 * GIB;
  if (estimatedVram <= vramBytes * 0.7) {
    return compatibilityResult(
      "recommended",
      runtime === "transformers" ? "QLoRA ready" : "Best fit",
      runtime === "transformers"
        ? "Estimated 4-bit training memory leaves room for activations."
        : "Estimated half-precision inference leaves comfortable VRAM headroom.",
    );
  }
  if (estimatedVram <= vramBytes * 0.88) {
    return compatibilityResult(
      "supported",
      "Fits GPU",
      "Estimated runtime memory fits this GPU with limited headroom.",
    );
  }
  if (estimatedVram <= vramBytes * 0.98) {
    return compatibilityResult(
      "tight",
      "Tight fit",
      "It may run at smaller dimensions or sequences, but can exhaust VRAM.",
    );
  }
  return compatibilityResult(
    "unsupported",
    "VRAM shortfall",
    "The conservative runtime estimate exceeds available GPU memory.",
  );
}

async function fetchJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }
  return response.json() as Promise<unknown>;
}

function manifestUrl(tag: string): string {
  const [name, variant = "latest"] = tag.split(":", 2);
  return `https://registry.ollama.ai/v2/library/${encodeURIComponent(name)}/manifests/${encodeURIComponent(variant)}`;
}

function manifestSize(value: unknown): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const manifest = value as OllamaManifest;
  const sizes = (manifest.layers ?? [])
    .map((layer) => numberValue(layer.size))
    .filter((size): size is number => size !== undefined);
  return sizes.length > 0
    ? sizes.reduce((total, size) => total + size, 0)
    : undefined;
}

async function discoverOllama(
  system: SystemSnapshot,
  fetcher: typeof fetch,
): Promise<CatalogFetchResult> {
  const results = await Promise.allSettled(
    OLLAMA_CANDIDATES.map(async (candidate): Promise<ModelCatalogItem> => {
      const manifest = await fetchJson(manifestUrl(candidate.tag), fetcher);
      const sizeBytes = manifestSize(manifest);
      return {
        id: `ollama:${candidate.tag}`,
        name: candidate.title,
        source: "ollama",
        category: "chat",
        runtime: "ollama",
        pipeline: "chat",
        architecture: candidate.tag.split(":", 1)[0],
        description: candidate.description,
        url: `https://ollama.com/library/${candidate.tag}`,
        pullTag: candidate.tag,
        sizeBytes,
        parameters: candidate.parameters,
        gated: false,
        verified: true,
        ...assessModelCompatibility({
          runtime: "ollama",
          system,
          sizeBytes,
          parameters: candidate.parameters,
          executorSupported: true,
        }),
        tags: candidate.tags,
      };
    }),
  );

  const items: ModelCatalogItem[] = [];
  let failed = 0;
  for (const result of results) {
    if (result.status === "fulfilled") items.push(result.value);
    else failed += 1;
  }
  return {
    items,
    warnings:
      failed > 0
        ? [
            `${failed} Ollama manifest${failed === 1 ? "" : "s"} could not be verified.`,
          ]
        : [],
  };
}

function huggingFaceSearchUrl(pipeline: string): string {
  const params = new URLSearchParams({
    pipeline_tag: pipeline,
    sort: "downloads",
    direction: "-1",
    limit: "24",
    full: "true",
  });
  return `https://huggingface.co/api/models?${params}`;
}

function modelId(model: HuggingFaceModel): string {
  return stringValue(model.id) || stringValue(model.modelId);
}

function modelArchitecture(model: HuggingFaceModel): string {
  const pipelineTag = stringArray(model.tags).find((tag) =>
    tag.startsWith("diffusers:"),
  );
  if (pipelineTag) return pipelineTag.slice("diffusers:".length);
  const architectures = stringArray(model.config?.architectures);
  return architectures[0] || stringValue(model.transformersInfo?.auto_model);
}

function modelParameters(model: HuggingFaceModel): number | undefined {
  return numberValue(model.safetensors?.total);
}

function modelWeightBytes(model: HuggingFaceModel): number | undefined {
  const parameters = modelParameters(model);
  if (parameters) return parameters * 2;
  const sizes = (model.siblings ?? [])
    .filter((file) =>
      /(?:\.safetensors|\.bin|\.gguf)$/i.test(stringValue(file.rfilename)),
    )
    .map((file) => numberValue(file.size))
    .filter((size): size is number => size !== undefined);
  return sizes.length > 0
    ? sizes.reduce((total, size) => total + size, 0)
    : undefined;
}

function huggingFaceItem(
  model: HuggingFaceModel,
  category: ModelCatalogCategory,
  system: SystemSnapshot,
): ModelCatalogItem {
  const id = modelId(model);
  const tags = stringArray(model.tags);
  const pipeline = stringValue(model.pipeline_tag);
  const library = stringValue(model.library_name);
  const architecture = modelArchitecture(model);
  const parameters = modelParameters(model);
  const sizeBytes = modelWeightBytes(model);
  const gated = model.gated !== false && Boolean(model.gated);
  let runtime: ModelCatalogRuntime = "none";
  let executorSupported = false;
  let unsupportedReason: string | undefined;

  if (category === "image") {
    runtime = "diffusers";
    executorSupported =
      library === "diffusers" && SUPPORTED_IMAGE_PIPELINES.has(architecture);
    if (!executorSupported) {
      unsupportedReason = architecture
        ? `${architecture} is not supported by the current image worker.`
        : "The repository does not identify a supported Diffusers pipeline.";
    }
  } else if (category === "training") {
    runtime = "transformers";
    executorSupported =
      library === "transformers" &&
      SUPPORTED_TRAINING_ARCHITECTURES.has(architecture);
    if (!executorSupported) {
      unsupportedReason = architecture
        ? `${architecture} is not supported by the current QLoRA worker.`
        : "The repository does not identify a supported causal language model.";
    }
  } else {
    unsupportedReason =
      "Video execution is not implemented in Local Forge yet.";
  }

  return {
    id: `huggingface:${id}`,
    name: id,
    source: "huggingface",
    category,
    runtime,
    pipeline,
    architecture: architecture || library || "Unknown architecture",
    description:
      category === "training"
        ? "Transformers causal language model for local QLoRA adapters."
        : category === "image"
          ? "Diffusers text-to-image pipeline from Hugging Face."
          : "Video pipeline listed for discovery; execution is not enabled yet.",
    url: `https://huggingface.co/${id}`,
    sizeBytes,
    parameters,
    downloads: numberValue(model.downloads),
    likes: numberValue(model.likes),
    updatedAt: stringValue(model.lastModified) || undefined,
    gated,
    verified: true,
    ...assessModelCompatibility({
      runtime,
      system,
      sizeBytes,
      parameters,
      executorSupported,
      gated,
      unsupportedReason,
    }),
    tags: tags.filter(
      (tag) =>
        !tag.startsWith("arxiv:") &&
        !tag.startsWith("base_model:") &&
        !tag.startsWith("region:"),
    ),
  };
}

async function searchHuggingFaceGroup(
  pipeline: string,
  library: string,
  category: ModelCatalogCategory,
  system: SystemSnapshot,
  fetcher: typeof fetch,
): Promise<CatalogFetchResult> {
  const search = await fetchJson(huggingFaceSearchUrl(pipeline), fetcher);
  if (!Array.isArray(search))
    throw new Error("Hugging Face returned an invalid model list.");
  const candidates = (search as HuggingFaceModel[])
    .filter(
      (model) =>
        stringValue(model.library_name) === library &&
        !stringArray(model.tags).includes("nsfw") &&
        Boolean(modelId(model)),
    )
    .slice(0, HUGGING_FACE_RESULTS_PER_GROUP);
  const details = await Promise.allSettled(
    candidates.map((candidate) =>
      fetchJson(
        `https://huggingface.co/api/models/${modelId(candidate)}?blobs=true`,
        fetcher,
      ),
    ),
  );
  const items: ModelCatalogItem[] = [];
  let failed = 0;
  for (const result of details) {
    if (
      result.status === "fulfilled" &&
      result.value &&
      typeof result.value === "object" &&
      !Array.isArray(result.value)
    ) {
      items.push(
        huggingFaceItem(result.value as HuggingFaceModel, category, system),
      );
    } else {
      failed += 1;
    }
  }
  return {
    items,
    warnings:
      failed > 0
        ? [
            `${failed} Hugging Face model detail${failed === 1 ? "" : "s"} could not be loaded.`,
          ]
        : [],
  };
}

async function discoverHuggingFace(
  system: SystemSnapshot,
  fetcher: typeof fetch,
): Promise<CatalogFetchResult> {
  const groups = await Promise.allSettled([
    searchHuggingFaceGroup(
      "text-to-image",
      "diffusers",
      "image",
      system,
      fetcher,
    ),
    searchHuggingFaceGroup(
      "text-generation",
      "transformers",
      "training",
      system,
      fetcher,
    ),
    searchHuggingFaceGroup(
      "text-to-video",
      "diffusers",
      "video",
      system,
      fetcher,
    ),
    searchHuggingFaceGroup(
      "image-to-video",
      "diffusers",
      "video",
      system,
      fetcher,
    ),
  ]);
  const items: ModelCatalogItem[] = [];
  const warnings: string[] = [];
  for (const group of groups) {
    if (group.status === "fulfilled") {
      items.push(...group.value.items);
      warnings.push(...group.value.warnings);
    } else {
      warnings.push(
        `Hugging Face discovery failed: ${
          group.reason instanceof Error ? group.reason.message : "unknown error"
        }`,
      );
    }
  }
  return { items, warnings };
}

const COMPATIBILITY_ORDER: Record<ModelCompatibility, number> = {
  recommended: 0,
  supported: 1,
  tight: 2,
  "catalog-only": 3,
  unsupported: 4,
};

export async function discoverModelCatalog(
  system: SystemSnapshot,
  fetcher: typeof fetch = fetch,
): Promise<ModelCatalogResponse> {
  const sources = await Promise.allSettled([
    discoverOllama(system, fetcher),
    discoverHuggingFace(system, fetcher),
  ]);
  const items: ModelCatalogItem[] = [];
  const warnings: string[] = [];
  for (const source of sources) {
    if (source.status === "fulfilled") {
      items.push(...source.value.items);
      warnings.push(...source.value.warnings);
    } else {
      warnings.push(
        source.reason instanceof Error
          ? source.reason.message
          : "A model catalog source failed.",
      );
    }
  }
  items.sort(
    (left, right) =>
      COMPATIBILITY_ORDER[left.compatibility] -
        COMPATIBILITY_ORDER[right.compatibility] ||
      (right.downloads ?? 0) - (left.downloads ?? 0) ||
      left.name.localeCompare(right.name),
  );
  return {
    items,
    fetchedAt: new Date().toISOString(),
    system,
    warnings,
  };
}
