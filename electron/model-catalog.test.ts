import { describe, expect, it, vi } from "vitest";
import type { SystemSnapshot } from "../src/types";
import {
  assessModelCompatibility,
  discoverModelCatalog,
} from "./model-catalog";

const system: SystemSnapshot = {
  source: "host",
  platform: "win32",
  arch: "x64",
  totalMemoryMb: 64 * 1024,
  freeMemoryMb: 48 * 1024,
  gpu: {
    available: true,
    name: "RTX fixture",
    memoryTotalMb: 24 * 1024,
    memoryUsedMb: 1024,
    utilization: 0,
    temperature: 40,
    driverVersion: "fixture",
  },
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("model catalog compatibility", () => {
  it("recommends an Ollama model that fits comfortably in VRAM", () => {
    expect(
      assessModelCompatibility({
        runtime: "ollama",
        system,
        sizeBytes: 5.2 * 1024 ** 3,
        parameters: 8.2e9,
        executorSupported: true,
      }),
    ).toEqual(
      expect.objectContaining({
        compatibility: "recommended",
        compatibilityLabel: "Best fit",
      }),
    );
  });

  it("keeps video models browse-only without claiming execution support", () => {
    expect(
      assessModelCompatibility({
        runtime: "none",
        system,
        executorSupported: false,
        unsupportedReason: "Video execution is not implemented.",
      }),
    ).toEqual({
      compatibility: "catalog-only",
      compatibilityLabel: "Browse only",
      compatibilityReason: "Video execution is not implemented.",
    });
  });

  it("maps only verified manifests and supported Hugging Face pipelines", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("registry.ollama.ai")) {
        if (url.endsWith("/qwen3/manifests/8b")) {
          return jsonResponse({
            layers: [
              {
                mediaType: "application/vnd.ollama.image.model",
                size: 5_225_374_496,
              },
              {
                mediaType: "application/vnd.ollama.image.template",
                size: 1723,
              },
            ],
          });
        }
        return jsonResponse({ error: "not found" }, 404);
      }
      if (url.includes("pipeline_tag=text-to-image")) {
        return jsonResponse([
          {
            id: "fixture/sdxl",
            library_name: "diffusers",
            pipeline_tag: "text-to-image",
            tags: ["diffusers", "diffusers:StableDiffusionXLPipeline"],
          },
        ]);
      }
      if (url.includes("pipeline_tag=text-generation")) {
        return jsonResponse([
          {
            id: "fixture/qwen",
            library_name: "transformers",
            pipeline_tag: "text-generation",
            tags: ["transformers", "safetensors"],
          },
        ]);
      }
      if (url.includes("pipeline_tag=text-to-video")) {
        return jsonResponse([
          {
            id: "fixture/video",
            library_name: "diffusers",
            pipeline_tag: "text-to-video",
            tags: ["diffusers", "diffusers:WanPipeline"],
          },
        ]);
      }
      if (url.includes("pipeline_tag=image-to-video")) return jsonResponse([]);
      if (url.includes("/api/models/fixture/sdxl")) {
        return jsonResponse({
          id: "fixture/sdxl",
          library_name: "diffusers",
          pipeline_tag: "text-to-image",
          gated: false,
          downloads: 2000,
          likes: 20,
          tags: ["diffusers", "diffusers:StableDiffusionXLPipeline"],
          safetensors: { total: 3.5e9 },
        });
      }
      if (url.includes("/api/models/fixture/qwen")) {
        return jsonResponse({
          id: "fixture/qwen",
          library_name: "transformers",
          pipeline_tag: "text-generation",
          gated: false,
          tags: ["transformers", "safetensors"],
          config: { architectures: ["Qwen3ForCausalLM"] },
          safetensors: { total: 8e9 },
        });
      }
      if (url.includes("/api/models/fixture/video")) {
        return jsonResponse({
          id: "fixture/video",
          library_name: "diffusers",
          pipeline_tag: "text-to-video",
          gated: false,
          tags: ["diffusers", "diffusers:WanPipeline"],
          safetensors: { total: 14e9 },
        });
      }
      return jsonResponse({ error: "unexpected URL" }, 404);
    }) as unknown as typeof fetch;

    const catalog = await discoverModelCatalog(system, fetcher);
    const ollama = catalog.items.find((item) => item.id === "ollama:qwen3:8b");
    const image = catalog.items.find(
      (item) => item.id === "huggingface:fixture/sdxl",
    );
    const training = catalog.items.find(
      (item) => item.id === "huggingface:fixture/qwen",
    );
    const video = catalog.items.find(
      (item) => item.id === "huggingface:fixture/video",
    );

    expect(ollama).toEqual(
      expect.objectContaining({
        pullTag: "qwen3:8b",
        sizeBytes: 5_225_376_219,
        compatibility: "recommended",
        verified: true,
      }),
    );
    expect(image).toEqual(
      expect.objectContaining({
        runtime: "diffusers",
        architecture: "StableDiffusionXLPipeline",
        compatibility: "recommended",
      }),
    );
    expect(training).toEqual(
      expect.objectContaining({
        runtime: "transformers",
        architecture: "Qwen3ForCausalLM",
        compatibility: "recommended",
      }),
    );
    expect(video).toEqual(
      expect.objectContaining({
        runtime: "none",
        compatibility: "catalog-only",
      }),
    );
    expect(catalog.items.every((item) => item.verified)).toBe(true);
  });
});
