import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultAssets,
  createDefaultStudioState,
} from "../../state/workspace";
import { StudioView } from "./StudioView";

afterEach(cleanup);

describe("StudioView", () => {
  it("loads thumbnails lazily and selects an asset from the image board", () => {
    const assets = createDefaultAssets().slice(0, 2);
    const onChange = vi.fn();
    const { container } = render(
      <StudioView
        studio={createDefaultStudioState()}
        imageModels={[]}
        assets={assets}
        upscalerConfigured={false}
        faceDetectorConfigured={false}
        nsfwSegmenterConfigured={false}
        nsfwConsent={false}
        installingEnhancement={null}
        enhancementInstallError=""
        visionAvailable={false}
        visionModel=""
        onChange={onChange}
        onGenerate={vi.fn()}
        onCancel={vi.fn()}
        onScanModels={vi.fn(async () => 0)}
        onImportAssets={vi.fn(async () => 0)}
        onRemoveModel={vi.fn()}
        onOpenSettings={vi.fn()}
        onInstallEnhancement={vi.fn()}
        onDescribeImage={vi.fn(async () => "")}
      />,
    );

    const thumbnails = container.querySelectorAll(
      ".studio-history-grid img, .variant-strip img",
    );
    expect(thumbnails).toHaveLength(assets.length * 2);
    thumbnails.forEach((thumbnail) => {
      expect(thumbnail).toHaveAttribute("loading", "lazy");
      expect(thumbnail).toHaveAttribute("decoding", "async");
      expect(thumbnail).toHaveAttribute("fetchpriority", "low");
    });

    fireEvent.click(screen.getByAltText(assets[1].title));
    expect(onChange).toHaveBeenCalledWith({ activeAsset: assets[1].src });
  });

  it("virtualizes large image boards and variant strips", async () => {
    const sample = createDefaultAssets()[0];
    const assets = Array.from({ length: 100 }, (_, index) => ({
      ...sample,
      id: `asset-${index}`,
      src: `./demo/asset-${index}.jpg`,
      title: `Asset ${index}`,
    }));
    const { container } = render(
      <StudioView
        studio={createDefaultStudioState()}
        imageModels={[]}
        assets={assets}
        upscalerConfigured={false}
        faceDetectorConfigured={false}
        nsfwSegmenterConfigured={false}
        nsfwConsent={false}
        installingEnhancement={null}
        enhancementInstallError=""
        visionAvailable={false}
        visionModel=""
        onChange={vi.fn()}
        onGenerate={vi.fn()}
        onCancel={vi.fn()}
        onScanModels={vi.fn(async () => 0)}
        onImportAssets={vi.fn(async () => 0)}
        onRemoveModel={vi.fn()}
        onOpenSettings={vi.fn()}
        onInstallEnhancement={vi.fn()}
        onDescribeImage={vi.fn(async () => "")}
      />,
    );

    await waitFor(() => {
      const historyImages = container.querySelectorAll(
        ".studio-history-grid img",
      );
      const variantImages = container.querySelectorAll(".variant-strip img");
      expect(historyImages.length).toBeGreaterThan(0);
      expect(historyImages.length).toBeLessThan(assets.length);
      expect(variantImages.length).toBeGreaterThan(0);
      expect(variantImages.length).toBeLessThan(assets.length);
    });
  });

  it("describes the selected image and can turn it into a prompt", async () => {
    const onChange = vi.fn();
    const onDescribeImage = vi.fn(
      async (_imageUrl: string, mode: "description" | "prompt") =>
        mode === "description"
          ? "A figure in warm window light."
          : "portrait, warm window light, shallow depth of field",
    );

    render(
      <StudioView
        studio={createDefaultStudioState()}
        imageModels={[]}
        assets={[]}
        upscalerConfigured={false}
        faceDetectorConfigured={false}
        nsfwSegmenterConfigured={false}
        nsfwConsent={false}
        installingEnhancement={null}
        enhancementInstallError=""
        visionAvailable
        visionModel="gemma3:4b"
        onChange={onChange}
        onGenerate={vi.fn()}
        onCancel={vi.fn()}
        onScanModels={vi.fn(async () => 0)}
        onImportAssets={vi.fn(async () => 0)}
        onRemoveModel={vi.fn()}
        onOpenSettings={vi.fn()}
        onInstallEnhancement={vi.fn()}
        onDescribeImage={onDescribeImage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Describe image" }));
    expect(
      await screen.findByText("A figure in warm window light."),
    ).toBeVisible();
    expect(onDescribeImage).toHaveBeenCalledWith(
      "./demo/forge-01.jpg",
      "description",
    );

    fireEvent.click(screen.getByRole("button", { name: "Use as prompt" }));
    expect(onChange).toHaveBeenCalledWith({
      prompt: "A figure in warm window light.",
    });

    fireEvent.click(screen.getByRole("button", { name: "Create prompt" }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        prompt: "portrait, warm window light, shallow depth of field",
      }),
    );
  });

  it("discards a response when the selected image changes", async () => {
    let resolveDescription: (value: string) => void = () => undefined;
    const onDescribeImage = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveDescription = resolve;
        }),
    );
    const props = {
      studio: createDefaultStudioState(),
      imageModels: [],
      assets: [],
      upscalerConfigured: false,
      faceDetectorConfigured: false,
      nsfwSegmenterConfigured: false,
      nsfwConsent: false,
      installingEnhancement: null,
      enhancementInstallError: "",
      visionAvailable: true,
      visionModel: "gemma3:4b",
      onChange: vi.fn(),
      onGenerate: vi.fn(),
      onCancel: vi.fn(),
      onScanModels: vi.fn(async () => 0),
      onImportAssets: vi.fn(async () => 0),
      onRemoveModel: vi.fn(),
      onOpenSettings: vi.fn(),
      onInstallEnhancement: vi.fn(),
      onDescribeImage,
    };
    const { rerender } = render(<StudioView {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Describe image" }));
    rerender(
      <StudioView
        {...props}
        studio={{ ...props.studio, activeAsset: "changed.png" }}
      />,
    );
    await act(async () => resolveDescription("Description for old image"));

    expect(screen.queryByText("Description for old image")).toBeNull();
  });
});
