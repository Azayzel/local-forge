import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgeApi } from "../../lib/forge-api";
import type { ModelCatalogResponse } from "../../types";
import { ModelsView } from "./ModelsView";

const catalog: ModelCatalogResponse = {
  items: [
    {
      id: "huggingface:fixture/nsfw-sdxl",
      name: "fixture/nsfw-sdxl",
      source: "huggingface",
      category: "image",
      runtime: "diffusers",
      pipeline: "text-to-image",
      architecture: "StableDiffusionXLPipeline",
      description: "Diffusers text-to-image pipeline from Hugging Face.",
      url: "https://huggingface.co/fixture/nsfw-sdxl",
      parameters: 3.5e9,
      gated: false,
      nsfw: true,
      verified: true,
      compatibility: "recommended",
      compatibilityLabel: "Best fit",
      compatibilityReason: "Estimated inference leaves VRAM headroom.",
      tags: ["diffusers", "nsfw"],
    },
  ],
  fetchedAt: "2026-09-25T00:00:00.000Z",
  system: {
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
  },
  warnings: [],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ModelsView", () => {
  it("discovers and searches NSFW pipelines only after consent", async () => {
    const listCatalog = vi
      .spyOn(forgeApi.catalog, "list")
      .mockResolvedValue(catalog);
    const props = {
      health: { online: true, latencyMs: 8, version: "fixture" },
      models: [],
      baseUrl: "http://127.0.0.1:11434",
      selectedModel: "",
      onSelect: vi.fn(),
      onRefresh: vi.fn(),
    };
    const { rerender } = render(<ModelsView {...props} nsfwConsent={false} />);

    await waitFor(() => expect(listCatalog).toHaveBeenCalledWith(false, false));
    expect(screen.queryByText("fixture/nsfw-sdxl")).toBeNull();

    rerender(<ModelsView {...props} nsfwConsent />);

    await waitFor(() => expect(listCatalog).toHaveBeenCalledWith(false, true));
    expect(await screen.findByText("fixture/nsfw-sdxl")).toBeVisible();
    expect(screen.getByTitle("Adult content")).toHaveTextContent("18+");

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search live model catalog" }),
      { target: { value: "nsfw" } },
    );
    expect(screen.getByText("fixture/nsfw-sdxl")).toBeVisible();
  });
});
