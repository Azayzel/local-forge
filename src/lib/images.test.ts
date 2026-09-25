import { describe, expect, it } from "vitest";
import { imageBase64, imageDataUrl } from "./images";

describe("chat image encoding", () => {
  it("preserves typed data URLs for display", () => {
    expect(imageDataUrl("data:image/webp;base64,UklGRg==")).toBe(
      "data:image/webp;base64,UklGRg==",
    );
  });

  it("preserves stored attachment URLs for display", () => {
    const url =
      "local-forge-attachment://file/123e4567-e89b-12d3-a456-426614174000.png";

    expect(imageDataUrl(url)).toBe(url);
    expect(imageBase64(url)).toBe(url);
  });

  it("detects common legacy raw image formats", () => {
    expect(imageDataUrl("YWJjZA==")).toBe("data:image/jpeg;base64,YWJjZA==");
    expect(imageDataUrl("iVBORw0KGgo=")).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
    expect(imageDataUrl("UklGRg==")).toBe("data:image/webp;base64,UklGRg==");
  });

  it("strips data URL metadata at the Ollama boundary", () => {
    expect(imageBase64("data:image/png;base64,iVBORw==")).toBe("iVBORw==");
    expect(imageBase64("legacy-base64")).toBe("legacy-base64");
  });
});
