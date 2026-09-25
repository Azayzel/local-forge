import {
  Download,
  FolderSearch,
  Image as ImageIcon,
  ImagePlus,
  Maximize2,
  RotateCcw,
  ScanText,
  Sparkles,
  Square,
  Trash2,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  createDefaultStudioState,
  type ForgeRun,
  type LibraryAsset,
  type StudioState,
} from "../../state/workspace";
import type {
  EnhancementModelKind,
  ImageModel,
  VisionDescribeMode,
} from "../../types";

const stylePresets = [
  { name: "Editorial", description: "Natural light / tactile" },
  { name: "Cinematic", description: "Contrast / atmosphere" },
  { name: "Product", description: "Precise / polished" },
  { name: "Documentary", description: "Observed / natural" },
];

interface StudioViewProps {
  studio: StudioState;
  imageModels: ImageModel[];
  assets: LibraryAsset[];
  activeRun?: ForgeRun;
  upscalerConfigured: boolean;
  faceDetectorConfigured: boolean;
  nsfwSegmenterConfigured: boolean;
  installingEnhancement: EnhancementModelKind | null;
  enhancementInstallError: string;
  visionAvailable: boolean;
  visionModel: string;
  preview?: {
    src: string;
    step?: number;
    total?: number;
  };
  onChange: (patch: Partial<StudioState>) => void;
  onGenerate: (action: "render" | "variant") => void;
  onCancel: (jobId: string) => void;
  onScanModels: () => Promise<number>;
  onImportAssets: () => Promise<number>;
  onRemoveModel: (model: ImageModel) => void;
  onOpenSettings: () => void;
  onInstallEnhancement: (kind: EnhancementModelKind) => void;
  onDescribeImage: (
    imageUrl: string,
    mode: VisionDescribeMode,
  ) => Promise<string>;
}

export function StudioView({
  studio,
  imageModels,
  assets,
  activeRun,
  upscalerConfigured,
  faceDetectorConfigured,
  nsfwSegmenterConfigured,
  installingEnhancement,
  enhancementInstallError,
  visionAvailable,
  visionModel,
  preview,
  onChange,
  onGenerate,
  onCancel,
  onScanModels,
  onImportAssets,
  onRemoveModel,
  onOpenSettings,
  onInstallEnhancement,
  onDescribeImage,
}: StudioViewProps) {
  const [zoom, setZoom] = useState(67);
  const [notice, setNotice] = useState("");
  const [visionBusy, setVisionBusy] = useState<VisionDescribeMode | null>(null);
  const [visionDescription, setVisionDescription] = useState("");
  const [visionError, setVisionError] = useState("");
  const visionRequestId = useRef(0);
  const activeAsset = useRef(studio.activeAsset);
  activeAsset.current = studio.activeAsset;
  const selectedModel = imageModels.find((model) => model.id === studio.model);
  const artworkSource = preview?.src ?? studio.activeAsset;
  const previewLabel =
    preview?.step && preview.total
      ? `Denoising ${preview.step} / ${preview.total}`
      : preview
        ? "Denoising"
        : "Preview";

  useEffect(() => {
    visionRequestId.current += 1;
    setVisionBusy(null);
    setVisionDescription("");
    setVisionError("");
  }, [studio.activeAsset]);

  async function describeActiveImage(mode: VisionDescribeMode) {
    if (!studio.activeAsset || visionBusy) return;
    const imageUrl = studio.activeAsset;
    const requestId = ++visionRequestId.current;
    setVisionBusy(mode);
    setVisionError("");
    try {
      const text = await onDescribeImage(imageUrl, mode);
      if (
        requestId !== visionRequestId.current ||
        imageUrl !== activeAsset.current
      ) {
        return;
      }
      if (mode === "prompt") {
        onChange({ prompt: text });
      } else {
        setVisionDescription(text);
      }
    } catch (error) {
      if (
        requestId !== visionRequestId.current ||
        imageUrl !== activeAsset.current
      ) {
        return;
      }
      setVisionError(
        error instanceof Error ? error.message : "Image description failed.",
      );
    } finally {
      if (requestId === visionRequestId.current) setVisionBusy(null);
    }
  }

  async function scanModels() {
    try {
      const count = await onScanModels();
      setNotice(
        count > 0
          ? `Found ${count} image model${count === 1 ? "" : "s"}.`
          : "No supported models found. Select a Diffusers folder or a folder with top-level .safetensors or .ckpt files.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Model scan failed.");
    }
  }

  async function importAssets() {
    try {
      const count = await onImportAssets();
      setNotice(
        count > 0
          ? `Imported ${count} image${count === 1 ? "" : "s"}.`
          : "No images selected.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Import failed.");
    }
  }

  function resetStudio() {
    onChange(createDefaultStudioState());
    setZoom(67);
  }

  return (
    <main className="tool-view studio-view">
      <header className="tool-header">
        <div>
          <span className="eyebrow">Creative workspace</span>
          <h1>Studio</h1>
        </div>
        <span className="status-pill neutral">
          <WandSparkles size={13} />
          {activeRun ? `${activeRun.progress}%` : "Image generation"}
        </span>
      </header>

      <div className="studio-layout">
        <aside className="studio-presets">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Collection</span>
              <strong>Visual directions</strong>
            </div>
            <button
              className="icon-button subtle"
              type="button"
              title="Import screenshots or reference images"
              aria-label="Import screenshots or reference images"
              onClick={() => void importAssets()}
            >
              <ImagePlus size={15} />
            </button>
          </div>
          <div className="style-presets">
            {stylePresets.map((preset, index) => (
              <button
                className={studio.preset === preset.name ? "active" : ""}
                type="button"
                key={preset.name}
                onClick={() => onChange({ preset: preset.name })}
              >
                <span className={`preset-swatch swatch-${index + 1}`} />
                <span>
                  <strong>{preset.name}</strong>
                  <small>{preset.description}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="studio-history-heading">
            <span>Image board</span>
            <span>{assets.length}</span>
          </div>
          <div className="studio-history-grid">
            {assets.map((asset) => (
              <button
                className={studio.activeAsset === asset.src ? "active" : ""}
                key={asset.src}
                type="button"
                onClick={() => onChange({ activeAsset: asset.src })}
              >
                <img src={asset.src} alt={asset.title} />
              </button>
            ))}
          </div>
        </aside>

        <section className="studio-canvas-wrap">
          <div className="canvas-toolbar">
            <div className="canvas-preview-label">
              <ImageIcon size={14} />
              <span>{previewLabel}</span>
            </div>
            <div>
              <button
                type="button"
                title="Zoom out"
                aria-label="Zoom out"
                onClick={() => setZoom((value) => Math.max(25, value - 10))}
              >
                <ZoomOut size={16} />
              </button>
              <span aria-live="polite">{zoom}%</span>
              <button
                type="button"
                title="Zoom in"
                aria-label="Zoom in"
                onClick={() => setZoom((value) => Math.min(150, value + 10))}
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                title="Fit to canvas"
                aria-label="Fit to canvas"
                onClick={() => setZoom(67)}
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
          <div className="studio-canvas">
            <div className="canvas-grid" />
            <figure
              className={`active-artwork ${preview ? "is-denoising" : ""}`}
              style={{ transform: `scale(${zoom / 67})` }}
            >
              {artworkSource ? (
                <img
                  key={artworkSource}
                  src={artworkSource}
                  alt={
                    preview
                      ? "Live generation preview"
                      : "Selected studio reference"
                  }
                />
              ) : (
                <span className="empty-canvas-copy">Import an image</span>
              )}
              <figcaption>
                <span>{preview ? previewLabel : "Selected reference"}</span>
                <span>
                  {studio.width} x {studio.height}
                </span>
              </figcaption>
            </figure>
          </div>
          <div className="variant-strip">
            {assets.map((asset, index) => (
              <button
                className={studio.activeAsset === asset.src ? "active" : ""}
                type="button"
                key={asset.src}
                onClick={() => onChange({ activeAsset: asset.src })}
              >
                <img src={asset.src} alt="" />
                <span>V{index + 1}</span>
              </button>
            ))}
            <button
              className="variant-add"
              type="button"
              title="Generate a variant"
              aria-label="Generate a variant"
              disabled={
                Boolean(activeRun) ||
                selectedModel?.format !== "diffusers" ||
                !studio.prompt.trim()
              }
              onClick={() => onGenerate("variant")}
            >
              <Sparkles size={17} />
            </button>
          </div>
        </section>

        <aside className="studio-inspector">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Recipe</span>
              <strong>Image settings</strong>
            </div>
            <button
              className="icon-button subtle"
              type="button"
              title="Reset settings"
              aria-label="Reset settings"
              onClick={resetStudio}
            >
              <RotateCcw size={15} />
            </button>
          </div>

          <div className="studio-model-field">
            <label className="field-label" htmlFor="studio-model">
              Image model
            </label>
            <div className="studio-model-control">
              <select
                id="studio-model"
                value={studio.model}
                onChange={(event) => onChange({ model: event.target.value })}
              >
                <option value="">No model selected</option>
                {imageModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                title="Scan an image model folder"
                aria-label="Scan an image model folder"
                onClick={() => void scanModels()}
              >
                <FolderSearch size={15} />
              </button>
            </div>
            {selectedModel && (
              <div className="studio-model-meta">
                <span>
                  {selectedModel.architecture} / {selectedModel.format}
                </span>
                <button
                  type="button"
                  title="Remove model from Local Forge"
                  aria-label={`Remove ${selectedModel.name} from Local Forge`}
                  onClick={() => onRemoveModel(selectedModel)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
            {notice && (
              <p className="studio-import-notice" role="status">
                {notice}
              </p>
            )}
            {selectedModel?.format === "checkpoint" && (
              <p className="studio-import-notice" role="alert">
                Convert this checkpoint to a Diffusers directory before
                generating.
              </p>
            )}
          </div>

          <div className="studio-prompt-heading">
            <label className="field-label">Prompt</label>
            <span
              title={visionModel ? `Vision model: ${visionModel}` : undefined}
            >
              {visionModel || "No vision model"}
            </span>
          </div>
          <textarea
            className="prompt-field"
            value={studio.prompt}
            rows={6}
            onChange={(event) => onChange({ prompt: event.target.value })}
          />
          <div className="prompt-meta">
            <span>{studio.prompt.length} chars</span>
            <div className="prompt-image-actions">
              <button
                type="button"
                title="Describe the selected image"
                disabled={!visionAvailable || visionBusy !== null}
                onClick={() => void describeActiveImage("description")}
              >
                <ScanText size={12} />
                {visionBusy === "description"
                  ? "Describing..."
                  : "Describe image"}
              </button>
              <button
                type="button"
                title="Create a generation prompt from the selected image"
                disabled={!visionAvailable || visionBusy !== null}
                onClick={() => void describeActiveImage("prompt")}
              >
                <WandSparkles size={12} />
                {visionBusy === "prompt" ? "Creating..." : "Create prompt"}
              </button>
            </div>
          </div>
          {visionError && (
            <p className="studio-vision-error" role="alert">
              {visionError}
            </p>
          )}
          {visionDescription && (
            <section className="studio-vision-output" aria-live="polite">
              <div>
                <strong>Image description</strong>
                <button
                  type="button"
                  onClick={() => onChange({ prompt: visionDescription })}
                >
                  Use as prompt
                </button>
              </div>
              <p>{visionDescription}</p>
            </section>
          )}

          <label className="field-label" htmlFor="negative-prompt">
            Negative prompt
          </label>
          <textarea
            id="negative-prompt"
            className="compact-textarea"
            value={studio.negativePrompt}
            rows={3}
            onChange={(event) =>
              onChange({ negativePrompt: event.target.value })
            }
          />

          <div className="form-row two-column">
            <label>
              <span>Width</span>
              <select
                value={studio.width}
                onChange={(event) =>
                  onChange({ width: Number(event.target.value) })
                }
              >
                <option>768</option>
                <option>1024</option>
                <option>1344</option>
              </select>
            </label>
            <label>
              <span>Height</span>
              <select
                value={studio.height}
                onChange={(event) =>
                  onChange({ height: Number(event.target.value) })
                }
              >
                <option>768</option>
                <option>1024</option>
                <option>1344</option>
              </select>
            </label>
          </div>

          <label className="range-field">
            <span>
              <b>Steps</b>
              <output>{studio.steps}</output>
            </span>
            <input
              type="range"
              min="4"
              max="50"
              value={studio.steps}
              onChange={(event) =>
                onChange({ steps: Number(event.target.value) })
              }
            />
          </label>
          <label className="range-field">
            <span>
              <b>Guidance</b>
              <output>{studio.guidance.toFixed(1)}</output>
            </span>
            <input
              type="range"
              min="1"
              max="12"
              step="0.5"
              value={studio.guidance}
              onChange={(event) =>
                onChange({ guidance: Number(event.target.value) })
              }
            />
          </label>

          <label className="seed-field">
            <span>Seed</span>
            <input
              type="number"
              value={studio.seed}
              onChange={(event) =>
                onChange({ seed: Number(event.target.value) })
              }
            />
            <button
              type="button"
              title="Random seed"
              aria-label="Random seed"
              onClick={() =>
                onChange({ seed: Math.floor(Math.random() * 1_000_000) })
              }
            >
              <ImageIcon size={14} />
            </button>
          </label>

          <section className="studio-enhancements">
            <div className="studio-enhancement-heading">
              <span>Enhance</span>
              {(!faceDetectorConfigured ||
                !upscalerConfigured ||
                !nsfwSegmenterConfigured) && (
                <button type="button" onClick={onOpenSettings}>
                  Configure
                </button>
              )}
            </div>
            {enhancementInstallError && (
              <p className="studio-enhancement-error" role="alert">
                {enhancementInstallError}
              </p>
            )}
            <div className="toggle-row">
              <span>
                <strong>Face Fix</strong>
                <small>
                  {faceDetectorConfigured
                    ? "Detect and refine up to four faces"
                    : "Face detector model required"}
                </small>
              </span>
              {faceDetectorConfigured ? (
                <input
                  type="checkbox"
                  aria-label="Face Fix"
                  checked={studio.faceFix}
                  onChange={(event) =>
                    onChange({ faceFix: event.target.checked })
                  }
                />
              ) : (
                <button
                  className="studio-model-install"
                  type="button"
                  disabled={installingEnhancement !== null}
                  onClick={() => onInstallEnhancement("faceDetector")}
                >
                  <Download size={12} />
                  {installingEnhancement === "faceDetector"
                    ? "Installing..."
                    : "Install"}
                </button>
              )}
            </div>
            {studio.faceFix && faceDetectorConfigured && (
              <label className="range-field studio-strength">
                <span>
                  <b>Face Fix strength</b>
                  <output>{studio.faceFixStrength.toFixed(2)}</output>
                </span>
                <input
                  type="range"
                  min="0.1"
                  max="0.8"
                  step="0.05"
                  value={studio.faceFixStrength}
                  onChange={(event) =>
                    onChange({ faceFixStrength: Number(event.target.value) })
                  }
                />
              </label>
            )}
            <div className="toggle-row">
              <span>
                <strong>Upscale</strong>
                <small>
                  {upscalerConfigured
                    ? `${studio.upscaleFactor}x tiled detail recovery`
                    : "ESRGAN model required"}
                </small>
              </span>
              {upscalerConfigured ? (
                <input
                  type="checkbox"
                  aria-label="Upscale"
                  checked={studio.upscale}
                  onChange={(event) =>
                    onChange({ upscale: event.target.checked })
                  }
                />
              ) : (
                <button
                  className="studio-model-install"
                  type="button"
                  disabled={installingEnhancement !== null}
                  onClick={() => onInstallEnhancement("upscaler")}
                >
                  <Download size={12} />
                  {installingEnhancement === "upscaler"
                    ? "Installing..."
                    : "Install"}
                </button>
              )}
            </div>
            {studio.upscale && upscalerConfigured && (
              <div className="studio-upscale-factor">
                <span>Output scale</span>
                <div className="segmented-control">
                  {([2, 4] as const).map((factor) => (
                    <button
                      className={
                        studio.upscaleFactor === factor ? "active" : ""
                      }
                      type="button"
                      key={factor}
                      onClick={() => onChange({ upscaleFactor: factor })}
                    >
                      {factor}x
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="toggle-row">
              <span>
                <strong>NSFW Segmentation</strong>
                <small>
                  {nsfwSegmenterConfigured
                    ? "Save detected-region masks"
                    : "Segmentation models required"}
                </small>
              </span>
              {nsfwSegmenterConfigured ? (
                <input
                  type="checkbox"
                  aria-label="NSFW Segmentation"
                  checked={studio.nsfwSegmentation}
                  onChange={(event) =>
                    onChange({ nsfwSegmentation: event.target.checked })
                  }
                />
              ) : (
                <button
                  className="studio-model-install"
                  type="button"
                  disabled={installingEnhancement !== null}
                  onClick={() => onInstallEnhancement("nsfwSegmenter")}
                >
                  <Download size={12} />
                  {installingEnhancement === "nsfwSegmenter"
                    ? "Installing..."
                    : "Install"}
                </button>
              )}
            </div>
          </section>

          <button
            className="primary-button studio-generate"
            type="button"
            disabled={
              !activeRun &&
              (selectedModel?.format !== "diffusers" || !studio.prompt.trim())
            }
            onClick={() =>
              activeRun ? onCancel(activeRun.id) : onGenerate("render")
            }
          >
            {activeRun ? <Square size={15} /> : <WandSparkles size={16} />}
            {activeRun ? `Cancel ${activeRun.progress}%` : "Generate image"}
          </button>
        </aside>
      </div>
    </main>
  );
}
