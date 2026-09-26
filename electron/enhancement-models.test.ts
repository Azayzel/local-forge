import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverEnhancementModels,
  downloadTrustedAsset,
  type TrustedAsset,
} from "./enhancement-models";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "local-forge-enhancements-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("discoverEnhancementModels", () => {
  it("discovers the Lavely enhancement model layout", async () => {
    const root = await temporaryDirectory();
    const upscaler = path.join(root, "upscalers", "4x-UltraSharp.pth");
    const faceDetector = path.join(root, "face_detector", "face_yolov8n.pt");
    const segmenterDirectory = path.join(root, "nsfw_segmentation");
    await fs.mkdir(path.dirname(upscaler), { recursive: true });
    await fs.mkdir(path.dirname(faceDetector), { recursive: true });
    await fs.mkdir(segmenterDirectory, { recursive: true });
    await fs.writeFile(upscaler, "upscaler");
    await fs.writeFile(faceDetector, "detector");
    await Promise.all(
      ["breast", "penis", "vagina"].map((region) =>
        fs.writeFile(
          path.join(segmenterDirectory, `nsfw-seg-${region}-x.pt`),
          region,
        ),
      ),
    );

    await expect(discoverEnhancementModels([root])).resolves.toEqual({
      upscalerModelPath: upscaler,
      faceDetectorModelPath: faceDetector,
      nsfwSegmenterModelPath: segmenterDirectory,
    });
  });

  it("ignores missing and incomplete model files", async () => {
    const root = await temporaryDirectory();
    const upscaler = path.join(root, "upscalers", "4x-UltraSharp.pth");
    const segmenterDirectory = path.join(root, "nsfw_segmentation");
    await fs.mkdir(path.dirname(upscaler), { recursive: true });
    await fs.mkdir(segmenterDirectory, { recursive: true });
    await fs.writeFile(upscaler, "");
    await fs.writeFile(
      path.join(segmenterDirectory, "nsfw-seg-breast-x.pt"),
      "breast",
    );
    await fs.writeFile(
      path.join(segmenterDirectory, "nsfw-seg-penis-x.pt"),
      "penis",
    );

    await expect(discoverEnhancementModels([root])).resolves.toEqual({
      upscalerModelPath: "",
      faceDetectorModelPath: "",
      nsfwSegmenterModelPath: "",
    });
  });
});

describe("downloadTrustedAsset", () => {
  const payload = Buffer.from("trusted model payload");
  const asset: TrustedAsset = {
    directory: "upscalers",
    filename: "model.pth",
    url: "https://models.example/model.pth",
    bytes: payload.byteLength,
    sha256: createHash("sha256").update(payload).digest("hex"),
  };

  it("promotes a verified download to its final path", async () => {
    const root = await temporaryDirectory();
    const target = await downloadTrustedAsset(
      root,
      asset,
      async () => new Response(payload),
    );

    await expect(fs.readFile(target)).resolves.toEqual(payload);
    await expect(fs.stat(`${target}.part`)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a corrupt download without leaving model files", async () => {
    const root = await temporaryDirectory();
    const target = path.join(root, asset.directory, asset.filename);

    await expect(
      downloadTrustedAsset(
        root,
        asset,
        async () => new Response("not the expected model"),
      ),
    ).rejects.toThrow("integrity check");
    await expect(fs.stat(target)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(`${target}.part`)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
