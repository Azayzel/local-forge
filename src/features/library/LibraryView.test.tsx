import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryAsset } from "../../state/workspace";
import { LibraryView } from "./LibraryView";

function createAssets(count: number): LibraryAsset[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `asset-${index}`,
    src: `./demo/asset-${index}.jpg`,
    title: `Asset ${index}`,
    source: "imported" as const,
    width: 1024,
    height: 768,
    createdAt: "2026-09-25T00:00:00.000Z",
    prompt: `Prompt ${index}`,
  }));
}

afterEach(cleanup);

describe("LibraryView", () => {
  it("virtualizes large galleries and lazily decodes mounted thumbnails", async () => {
    const assets = createAssets(100);
    const { container } = render(
      <LibraryView
        assets={assets}
        onImport={vi.fn(async () => 0)}
        onOpenInStudio={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText("100 assets")).toBeVisible();
    await waitFor(() => {
      const mountedTiles = container.querySelectorAll(".asset-tile");
      expect(mountedTiles.length).toBeGreaterThan(0);
      expect(mountedTiles.length).toBeLessThan(assets.length);
    });

    container.querySelectorAll(".asset-tile img").forEach((thumbnail) => {
      expect(thumbnail).toHaveAttribute("loading", "lazy");
      expect(thumbnail).toHaveAttribute("decoding", "async");
      expect(thumbnail).toHaveAttribute("fetchpriority", "low");
    });
  });
});
