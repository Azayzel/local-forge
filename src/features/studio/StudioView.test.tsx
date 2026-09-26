import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultStudioState } from "../../state/workspace";
import { NSFW_STUDIO_PROMPT } from "../../lib/nsfw";
import { StudioView } from "./StudioView";

afterEach(cleanup);

describe("StudioView", () => {
  it("keeps reference imports without rendering thumbnail collections", async () => {
    const onImportAssets = vi.fn(async () => 2);
    const { container } = render(
      <StudioView
        studio={createDefaultStudioState()}
        imageModels={[]}
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
        onImportAssets={onImportAssets}
        onRemoveModel={vi.fn()}
        onOpenSettings={vi.fn()}
        onInstallEnhancement={vi.fn()}
        onDescribeImage={vi.fn(async () => "")}
      />,
    );

    expect(screen.queryByText("Image board")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Generate a variant" }),
    ).toBeNull();
    expect(container.querySelector(".studio-history-grid")).toBeNull();
    expect(container.querySelector(".variant-strip")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Import screenshots or reference images",
      }),
    );
    await waitFor(() => expect(onImportAssets).toHaveBeenCalledOnce());
    expect(await screen.findByText("Imported 2 images.")).toBeVisible();
  });

  it("reveals adult models and prompts only after both NSFW opt-ins", () => {
    const studio = createDefaultStudioState();
    const safeModel = {
      id: "safe-model",
      name: "Landscape XL",
      path: "D:/models/landscape-xl",
      format: "diffusers" as const,
      architecture: "StableDiffusionPipeline",
      modifiedAt: "2026-09-25T00:00:00.000Z",
    };
    const adultModel = {
      ...safeModel,
      id: "adult-model",
      name: "Portrait NSFW XL",
      path: "D:/models/portrait-nsfw-xl",
    };
    const onChange = vi.fn();
    const props = {
      studio,
      imageModels: [safeModel, adultModel],
      upscalerConfigured: false,
      faceDetectorConfigured: false,
      nsfwSegmenterConfigured: false,
      nsfwConsent: false,
      installingEnhancement: null,
      enhancementInstallError: "",
      visionAvailable: false,
      visionModel: "",
      onChange,
      onGenerate: vi.fn(),
      onCancel: vi.fn(),
      onScanModels: vi.fn(async () => 0),
      onImportAssets: vi.fn(async () => 0),
      onRemoveModel: vi.fn(),
      onOpenSettings: vi.fn(),
      onInstallEnhancement: vi.fn(),
      onDescribeImage: vi.fn(async () => ""),
    };
    const { rerender } = render(<StudioView {...props} />);

    expect(
      screen.queryByRole("checkbox", { name: "Enable NSFW defaults" }),
    ).toBeNull();
    expect(screen.queryByRole("option", { name: /Portrait NSFW/ })).toBeNull();

    rerender(<StudioView {...props} nsfwConsent />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Enable NSFW defaults" }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        nsfwDefaults: true,
        model: adultModel.id,
        prompt: NSFW_STUDIO_PROMPT,
      }),
    );

    rerender(
      <StudioView
        {...props}
        nsfwConsent
        studio={{ ...studio, nsfwDefaults: true, model: adultModel.id }}
      />,
    );
    expect(
      screen.getByRole("option", { name: "Portrait NSFW XL (NSFW)" }),
    ).toBeVisible();
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

  it("submits a normalized selection for masked image editing", () => {
    const studio = {
      ...createDefaultStudioState(),
      model: "edit-model",
    };
    const onGenerate = vi.fn();
    const { container } = render(
      <StudioView
        studio={studio}
        imageModels={[
          {
            id: "edit-model",
            name: "Local Diffusers",
            path: "D:/models/local-diffusers",
            format: "diffusers",
            architecture: "StableDiffusionPipeline",
            modifiedAt: "2026-09-25T00:00:00.000Z",
          },
        ]}
        upscalerConfigured={false}
        faceDetectorConfigured={false}
        nsfwSegmenterConfigured={false}
        nsfwConsent={false}
        installingEnhancement={null}
        enhancementInstallError=""
        visionAvailable={false}
        visionModel=""
        onChange={vi.fn()}
        onGenerate={onGenerate}
        onCancel={vi.fn()}
        onScanModels={vi.fn(async () => 0)}
        onImportAssets={vi.fn(async () => 0)}
        onRemoveModel={vi.fn()}
        onOpenSettings={vi.fn()}
        onInstallEnhancement={vi.fn()}
        onDescribeImage={vi.fn(async () => "")}
      />,
    );

    const artwork = container.querySelector(".active-artwork");
    expect(artwork).toBeInstanceOf(HTMLElement);
    vi.spyOn(artwork as HTMLElement, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 50,
      left: 100,
      top: 50,
      right: 500,
      bottom: 250,
      width: 400,
      height: 200,
      toJSON: () => ({}),
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Select area to edit" }),
    );
    fireEvent(
      artwork as HTMLElement,
      new MouseEvent("pointerdown", {
        bubbles: true,
        clientX: 180,
        clientY: 90,
      }),
    );
    fireEvent(
      artwork as HTMLElement,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 420,
        clientY: 190,
      }),
    );
    fireEvent(
      artwork as HTMLElement,
      new MouseEvent("pointerup", {
        bubbles: true,
        clientX: 420,
        clientY: 190,
      }),
    );

    expect(screen.getByTestId("studio-edit-selection")).toHaveStyle({
      left: "20%",
      top: "20%",
      width: "60%",
      height: "50%",
    });

    fireEvent.change(screen.getByLabelText("Edit instruction"), {
      target: { value: "Change the position to the left" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "Edit strength" }), {
      target: { value: "0.8" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Apply selected edit" }),
    );

    expect(onGenerate).toHaveBeenCalledWith("edit", {
      sourceImage: studio.activeAsset,
      region: {
        x: expect.closeTo(0.2),
        y: expect.closeTo(0.2),
        width: expect.closeTo(0.6),
        height: expect.closeTo(0.5),
      },
      instruction: "Change the position to the left",
      strength: 0.8,
      width: 1024,
      height: 1024,
    });
  });
});
