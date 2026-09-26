import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("content security policy", () => {
  it("allows both Local Forge image protocols", async () => {
    const html = await readFile(path.join(process.cwd(), "index.html"), "utf8");
    const page = new DOMParser().parseFromString(html, "text/html");
    const policy = page
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute("content");
    const imageSources = policy
      ?.split(";")
      .find((directive) => directive.trim().startsWith("img-src "))
      ?.trim()
      .split(/\s+/)
      .slice(1);

    expect(imageSources).toEqual(
      expect.arrayContaining([
        "local-forge-attachment:",
        "local-forge-output:",
      ]),
    );
  });
});
