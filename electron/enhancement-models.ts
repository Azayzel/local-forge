import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  EnhancementInstallResult,
  EnhancementModelKind,
  EnhancementModelPaths,
} from "../src/types";

export interface TrustedAsset {
  directory: string;
  filename: string;
  url: string;
  bytes: number;
  sha256: string;
}

const TRUSTED_ASSETS: Record<EnhancementModelKind, TrustedAsset[]> = {
  upscaler: [
    {
      directory: "upscalers",
      filename: "4x-UltraSharp.pth",
      url: "https://huggingface.co/lokCX/4x-Ultrasharp/resolve/1856559b50de25116a7c07261177dd128f1f5664/4x-UltraSharp.pth",
      bytes: 66_961_958,
      sha256:
        "a5812231fc936b42af08a5edba784195495d303d5b3248c24489ef0c4021fe01",
    },
  ],
  faceDetector: [
    {
      directory: "face_detector",
      filename: "face_yolov8n.pt",
      url: "https://huggingface.co/Bingsu/adetailer/resolve/53cc19de382014514d9d4038601d261a7faa9b7b/face_yolov8n.pt",
      bytes: 6_230_011,
      sha256:
        "70b640f8f60b1cf0dcc72f30caf3da9495eb2fb6509da48c53374ad6806e6a9c",
    },
  ],
  nsfwSegmenter: [
    {
      directory: "nsfw_segmentation",
      filename: "nsfw-seg-breast-x.pt",
      url: "https://huggingface.co/NSFW-API/NSFW_Segmentation/resolve/818199566a6e3aa0acec2dd1f98bc98c9b99750d/nsfw-seg-breast-x.pt",
      bytes: 124_800_929,
      sha256:
        "5ad882ddaf149873be131943b373da9f15a0603c91508e2291ece83d729c8ecc",
    },
    {
      directory: "nsfw_segmentation",
      filename: "nsfw-seg-penis-x.pt",
      url: "https://huggingface.co/NSFW-API/NSFW_Segmentation/resolve/818199566a6e3aa0acec2dd1f98bc98c9b99750d/nsfw-seg-penis-x.pt",
      bytes: 124_844_641,
      sha256:
        "49d9fc8ee67d3bdee44e46bf75aeb76058f5cd074bac027b55ff071b63a32e21",
    },
    {
      directory: "nsfw_segmentation",
      filename: "nsfw-seg-vagina-x.pt",
      url: "https://huggingface.co/NSFW-API/NSFW_Segmentation/resolve/818199566a6e3aa0acec2dd1f98bc98c9b99750d/nsfw-seg-vagina-x.pt",
      bytes: 124_817_249,
      sha256:
        "f8349ae348f5cf041809c38bf38d2c80a0f3dccdb1375b97971358cde742197f",
    },
  ],
};

const UPSCALER_FILES = [
  ["upscalers", "4x-UltraSharp.pth"],
  ["4x-UltraSharp.pth"],
];
const FACE_DETECTOR_FILES = [
  ["face_detector", "face_yolov8n.pt"],
  ["face_yolov8n.pt"],
];
const NSFW_SEGMENTER_FILES = [
  "nsfw-seg-breast-x.pt",
  "nsfw-seg-penis-x.pt",
  "nsfw-seg-vagina-x.pt",
];

async function firstUsableFile(
  roots: string[],
  candidates: string[][],
): Promise<string> {
  for (const root of roots) {
    for (const candidate of candidates) {
      const filePath = path.resolve(root, ...candidate);
      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile() && stat.size > 0) return filePath;
      } catch {
        // Continue through known locations.
      }
    }
  }
  return "";
}

async function firstUsableSegmenterDirectory(roots: string[]): Promise<string> {
  for (const root of roots) {
    const directory = path.resolve(root, "nsfw_segmentation");
    const filesAreUsable = await Promise.all(
      NSFW_SEGMENTER_FILES.map(async (filename) => {
        try {
          const stat = await fs.stat(path.join(directory, filename));
          return stat.isFile() && stat.size > 0;
        } catch {
          return false;
        }
      }),
    );
    if (filesAreUsable.every(Boolean)) return directory;
  }
  return "";
}

export async function discoverEnhancementModels(
  modelRoots: string[],
): Promise<EnhancementModelPaths> {
  const [upscalerModelPath, faceDetectorModelPath, nsfwSegmenterModelPath] =
    await Promise.all([
      firstUsableFile(modelRoots, UPSCALER_FILES),
      firstUsableFile(modelRoots, FACE_DETECTOR_FILES),
      firstUsableSegmenterDirectory(modelRoots),
    ]);
  return {
    upscalerModelPath,
    faceDetectorModelPath,
    nsfwSegmenterModelPath,
  };
}

function validPayload(payload: Buffer, asset: TrustedAsset): boolean {
  return (
    payload.byteLength === asset.bytes &&
    createHash("sha256").update(payload).digest("hex") === asset.sha256
  );
}

export async function downloadTrustedAsset(
  modelsRoot: string,
  asset: TrustedAsset,
  fetchAsset: (url: string) => Promise<Response>,
): Promise<string> {
  const targetDirectory = path.resolve(modelsRoot, asset.directory);
  const target = path.join(targetDirectory, asset.filename);
  const temporary = `${target}.part`;

  try {
    const existing = await fs.readFile(target);
    if (validPayload(existing, asset)) return target;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const response = await fetchAsset(asset.url);
  if (!response.ok) {
    throw new Error(
      `Model download failed with HTTP ${response.status} ${response.statusText}.`,
    );
  }
  const payload = Buffer.from(await response.arrayBuffer());
  if (!validPayload(payload, asset)) {
    throw new Error("Downloaded model failed its integrity check.");
  }

  await fs.mkdir(targetDirectory, { recursive: true });
  try {
    await fs.writeFile(temporary, payload);
    await fs.rm(target, { force: true });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
  return target;
}

export async function installEnhancementModel(
  modelsRoot: string,
  kind: EnhancementModelKind,
  fetchAsset: (url: string) => Promise<Response>,
): Promise<EnhancementInstallResult> {
  const assets = TRUSTED_ASSETS[kind];
  if (!assets) throw new Error("Unknown enhancement model.");
  const installedPaths: string[] = [];
  for (const asset of assets) {
    installedPaths.push(
      await downloadTrustedAsset(modelsRoot, asset, fetchAsset),
    );
  }
  return {
    kind,
    path:
      kind === "nsfwSegmenter"
        ? path.dirname(installedPaths[0])
        : installedPaths[0],
  };
}
