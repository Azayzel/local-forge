import { describe, expect, it } from "vitest";
import { forgeApi, isBrowserPreview } from "./forge-api";

describe("browser preview system data", () => {
  it("never presents simulated values as detected hardware", async () => {
    const snapshot = await forgeApi.system.snapshot();

    expect(isBrowserPreview).toBe(true);
    expect(snapshot.source).toBe("preview");
    expect(snapshot.gpu.available).toBe(false);
    expect(snapshot.gpu.name).toBe("Not sampled in browser preview");
    expect(snapshot.gpu.memoryTotalMb).toBe(0);
  });
});
