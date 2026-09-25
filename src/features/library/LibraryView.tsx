import {
  FolderOpen,
  Grid2X2,
  ImagePlus,
  List,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { forgeApi } from "../../lib/forge-api";
import type { LibraryAsset } from "../../state/workspace";

const ASSET_GAP = 12;
const MIN_GRID_TILE_WIDTH = 150;
const VIRTUALIZE_AFTER = 24;

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

function useElementWidth(elementRef: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const updateWidth = () => setWidth(element.clientWidth);
    updateWidth();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef]);

  return width;
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
  const assetGridRef = useRef<HTMLElement>(null);
  const deferredQuery = useDeferredValue(query);
  const selected = assets.find((asset) => asset.id === selectedId) ?? null;
  const filtered = assets.filter((asset) =>
    asset.title.toLowerCase().includes(deferredQuery.toLowerCase()),
  );
  const gridWidth = useElementWidth(assetGridRef);
  const maximumColumns = selected ? 3 : 4;
  const columnCount =
    layout === "list"
      ? 1
      : Math.max(
          1,
          Math.min(
            maximumColumns,
            gridWidth
              ? Math.floor(
                  (gridWidth + ASSET_GAP) / (MIN_GRID_TILE_WIDTH + ASSET_GAP),
                )
              : maximumColumns,
          ),
        );
  const shouldVirtualize = filtered.length > VIRTUALIZE_AFTER;
  const rowCount = Math.ceil(filtered.length / columnCount);
  const estimatedTileWidth =
    ((gridWidth || (selected ? 700 : 900)) - ASSET_GAP * (columnCount - 1)) /
    columnCount;
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? rowCount : 0,
    getScrollElement: () => assetGridRef.current,
    estimateSize: () =>
      layout === "list" ? 84 : estimatedTileWidth * 0.75 + 58,
    getItemKey: (rowIndex) =>
      `${layout}:${filtered[rowIndex * columnCount]?.id ?? rowIndex}`,
    overscan: 3,
    initialRect: { width: 900, height: 600 },
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const visibleRows =
    virtualRows.length > 0
      ? virtualRows
      : [{ index: 0, key: "initial", start: 0 }];

  useEffect(() => {
    assetGridRef.current?.scrollTo?.({ top: 0 });
    rowVirtualizer.measure();
  }, [columnCount, deferredQuery, layout, rowVirtualizer]);

  function renderAsset(asset: LibraryAsset) {
    return (
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
          <img
            src={asset.src}
            alt={asset.title}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
          />
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
    );
  }

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
        <section
          ref={assetGridRef}
          className={`asset-grid ${layout} ${shouldVirtualize ? "virtualized" : ""}`}
          aria-label="Asset gallery"
        >
          {shouldVirtualize ? (
            <div
              className="asset-virtualizer"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {visibleRows.map((virtualRow) => {
                const rowStart = virtualRow.index * columnCount;
                return (
                  <div
                    className={`asset-virtual-row ${layout}`}
                    data-index={virtualRow.index}
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {filtered
                      .slice(rowStart, rowStart + columnCount)
                      .map(renderAsset)}
                  </div>
                );
              })}
            </div>
          ) : (
            filtered.map(renderAsset)
          )}
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
