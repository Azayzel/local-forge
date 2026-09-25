import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ForgeRun } from "../../state/workspace";
import { ActivityView } from "./OperationalViews";

const adultRun: ForgeRun = {
  id: "adult-run",
  kind: "image",
  name: "Adult render",
  status: "complete",
  progress: 100,
  startedAt: "2026-09-25T00:00:00.000Z",
  completedAt: "2026-09-25T00:01:00.000Z",
  outputPath: "D:/outputs/adult.png",
  outputUrl: "local-forge-output://image/adult.png",
  recipe: {
    kind: "image",
    modelId: "portrait-nsfw-xl",
    modelName: "Portrait NSFW XL",
    prompt: "Adult prompt",
    negativePrompt: "Negative prompt",
    width: 1024,
    height: 1024,
    steps: 24,
    guidance: 5.5,
    seed: 42,
    nsfwDefaults: true,
  },
};

afterEach(cleanup);

describe("ActivityView", () => {
  it("hides adult output details and actions until consent is granted", () => {
    const props = {
      runs: [adultRun],
      nsfwConsent: false,
      onCancel: vi.fn(),
      onReveal: vi.fn(),
      onRemove: vi.fn(),
      onRetry: vi.fn(),
      onOpenImage: vi.fn(),
    };
    const { rerender } = render(<ActivityView {...props} />);

    fireEvent.click(screen.getByLabelText("View details for Adult render"));
    expect(screen.getAllByText("Adult content hidden")).toHaveLength(2);
    expect(screen.queryByRole("img", { name: "Adult render" })).toBeNull();
    expect(screen.queryByText("Adult prompt")).toBeNull();
    expect(screen.queryByRole("button", { name: /Open in Studio/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Run again/ })).toBeNull();

    rerender(<ActivityView {...props} nsfwConsent />);
    expect(screen.getByRole("img", { name: "Adult render" })).toBeVisible();
    expect(screen.getByText("Adult prompt")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Open in Studio/ }),
    ).toBeVisible();
  });
});
