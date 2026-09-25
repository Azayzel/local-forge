import {
  FolderOpen,
  Grid2X2,
  ImagePlus,
  List,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { forgeApi } from "../../lib/forge-api";
import type { LibraryAsset } from "../../state/workspace";

interface LibraryViewProps {
  assets: LibraryAsset[];
  onImport: () => Promise<number>;
  onOpenInStudio: (asset: LibraryAsset) => void;
  onRemove: (asset: LibraryAsset) => void;
}

function assetFormat(src: string): string {
  const extension = src.split(".").pop()?.toUpperCase();
  return extension === "JPG" ? "JPEG" : (extension ?? "Image");
}

export function LibraryView({
  assets,
  onImport,
  onOpenInStudio,
  onRemove,
}: LibraryViewProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(assets[0]?.id ?? "");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const selected = assets.find((asset) => asset.id === selectedId) ?? null;
  const filtered = assets.filter((asset) =>
    asset.title.toLowerCase().includes(query.toLowerCase()),
  );

  async function copyPrompt() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.prompt);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <main className="tool-view library-view">
      <header className="tool-header">
        <div>
          <span className="eyebrow">Local assets</span>
          <h1>Library</h1>
        </div>
        <div className="tool-header-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void onImport()}
          >
            <ImagePlus size={15} /> Import images
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void forgeApi.system.openOutputs()}
          >
            <FolderOpen size={15} /> Open outputs
          </button>
        </div>
      </header>
      <div className="library-toolbar">
        <label className="search-field library-search">
          <Search size={15} />
          <span className="sr-only">Search library</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search assets"
          />
        </label>
        <div className="view-toggle">
          <button
            className={layout === "grid" ? "active" : ""}
            type="button"
            title="Grid view"
            aria-label="Grid view"
            onClick={() => setLayout("grid")}
          >
            <Grid2X2 size={16} />
          </button>
          <button
            className={layout === "list" ? "active" : ""}
            type="button"
            title="List view"
            aria-label="List view"
            onClick={() => setLayout("list")}
          >
            <List size={16} />
          </button>
        </div>
        <span className="asset-count">{filtered.length} assets</span>
      </div>
      <div className={`library-content ${selected ? "" : "details-closed"}`}>
        <section className={`asset-grid ${layout}`}>
          {filtered.map((asset) => (
            <button
              className={`asset-tile ${selected?.id === asset.id ? "selected" : ""}`}
              type="button"
              key={asset.src}
              onClick={() => {
                setSelectedId(asset.id);
                setCopyStatus("idle");
              }}
            >
              <span className="asset-image">
                <img src={asset.src} alt={asset.title} />
                <span>
                  {asset.source === "generated"
                    ? "Generated"
                    : asset.source === "imported"
                      ? "Reference"
                      : "Sample"}
                </span>
              </span>
              <span className="asset-copy">
                <strong>{asset.title}</strong>
                <small>
                  {asset.width} x {asset.height} /{" "}
                  {asset.source === "generated"
                    ? "Generated"
                    : asset.source === "imported"
                      ? "Imported"
                      : "Bundled"}
                </small>
              </span>
            </button>
          ))}
        </section>
        {selected && (
          <aside className="asset-details">
            <div className="asset-detail-title">
              <div>
                <span className="eyebrow">Selected</span>
                <strong>{selected.title}</strong>
              </div>
              <button
                className="icon-button subtle"
                type="button"
                title="Close details"
                aria-label="Close details"
                onClick={() => setSelectedId("")}
              >
                <X size={16} />
              </button>
            </div>
            <img
              className="asset-detail-preview"
              src={selected.src}
              alt={selected.title}
            />
            <dl className="asset-metadata">
              <div>
                <dt>Format</dt>
                <dd>{assetFormat(selected.src)}</dd>
              </div>
              <div>
                <dt>Dimensions</dt>
                <dd>
                  {selected.width} x {selected.height}
                </dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>
                  {selected.source === "sample"
                    ? selected.createdAt
                    : new Date(selected.createdAt).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Collection</dt>
                <dd>
                  {selected.source === "generated"
                    ? "Generated outputs"
                    : selected.source === "imported"
                      ? "Imported references"
                      : "Bundled samples"}
                </dd>
              </div>
            </dl>
            {selected.prompt && (
              <div className="asset-prompt">
                <span className="field-label">Prompt</span>
                <p>{selected.prompt}</p>
              </div>
            )}
            <div className="asset-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => onOpenInStudio(selected)}
              >
                Open in Studio
              </button>
              <button
                className="secondary-button"
                type="button"
                aria-live="polite"
                disabled={!selected.prompt}
                onClick={() => void copyPrompt()}
              >
                {copyStatus === "copied"
                  ? "Copied"
                  : copyStatus === "failed"
                    ? "Copy failed"
                    : "Copy prompt"}
              </button>
              {selected.source !== "sample" && (
                <button
                  className="icon-button subtle"
                  type="button"
                  title="Remove image from library"
                  aria-label={`Remove ${selected.title}`}
                  onClick={() => {
                    onRemove(selected);
                    setSelectedId("");
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
