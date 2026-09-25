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
import { StudioView } from "./StudioView";

afterEach(cleanup);

describe("StudioView image description", () => {
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
