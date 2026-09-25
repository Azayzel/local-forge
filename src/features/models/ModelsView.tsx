import {
  Box,
  Check,
  Cpu,
  Download,
  ExternalLink,
  Film,
  HardDrive,
  Image as ImageIcon,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { forgeApi } from "../../lib/forge-api";
import type {
  ModelCatalogCategory,
  ModelCatalogItem,
  ModelCatalogResponse,
  OllamaModel,
  PullStreamEvent,
  RuntimeHealth,
} from "../../types";

type CatalogFilter = "all" | ModelCatalogCategory;

const catalogFilters: Array<{
  id: CatalogFilter;
  label: string;
  icon: typeof Box;
}> = [
  { id: "all", label: "All", icon: SlidersHorizontal },
  { id: "chat", label: "Chat", icon: MessageSquareText },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "video", label: "Video", icon: Film },
  { id: "training", label: "Training", icon: Wrench },
];

function formatBytes(value?: number): string {
  if (!value) return "Size unknown";
  return `${(value / 1024 ** 3).toFixed(value >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
}

function formatParameters(value?: number): string {
  if (!value) return "Parameters unknown";
  return value >= 1e9
    ? `${(value / 1e9).toFixed(value >= 10e9 ? 0 : 1)}B params`
    : `${Math.round(value / 1e6)}M params`;
}

function formatCount(value?: number): string {
  if (!value) return "";
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(value);
}

function sourceLabel(model: ModelCatalogItem): string {
  return model.source === "ollama" ? "Ollama" : "Hugging Face";
}

interface ModelsViewProps {
  health: RuntimeHealth;
  models: OllamaModel[];
  baseUrl: string;
  selectedModel: string;
  onSelect: (model: string) => void;
  onRefresh: () => void;
}

export function ModelsView({
  health,
  models,
  baseUrl,
  selectedModel,
  onSelect,
  onRefresh,
}: ModelsViewProps) {
  const [query, setQuery] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("all");
  const [compatibleOnly, setCompatibleOnly] = useState(true);
  const [catalog, setCatalog] = useState<ModelCatalogResponse | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [pull, setPull] = useState<PullStreamEvent | null>(null);
  const installedNames = new Set(models.map((model) => model.name));
  const filtered = models.filter((model) =>
    model.name.toLowerCase().includes(query.toLowerCase()),
  );

  const handlePullEvent = useEffectEvent((event: PullStreamEvent) => {
    setPull(event);
    if (event.status === "success") onRefresh();
  });
  useEffect(() => forgeApi.ollama.onPullEvent(handlePullEvent), []);

  const loadCatalog = useEffectEvent(async (refresh: boolean) => {
    setCatalogLoading(true);
    setCatalogError("");
    try {
      setCatalog(await forgeApi.catalog.list(refresh));
    } catch (error) {
      setCatalogError(
        error instanceof Error ? error.message : "Model discovery failed.",
      );
    } finally {
      setCatalogLoading(false);
    }
  });
  useEffect(() => {
    void loadCatalog(false);
  }, []);

  function install(model: string) {
    if (!model.trim() || !health.online) return;
    const requestId = crypto.randomUUID();
    setPull({ requestId, status: "Preparing download" });
    void forgeApi.ollama.pull({ requestId, baseUrl, model: model.trim() });
  }

  const pullPercent =
    pull?.total && pull.completed
      ? Math.round((pull.completed / pull.total) * 100)
      : 0;
  const normalizedCatalogQuery = catalogQuery.trim().toLowerCase();
  const visibleCatalog = (catalog?.items ?? []).filter((model) => {
    if (catalogFilter !== "all" && model.category !== catalogFilter) {
      return false;
    }
    if (
      compatibleOnly &&
      (model.compatibility === "unsupported" ||
        model.compatibility === "catalog-only")
    ) {
      return false;
    }
    return (
      !normalizedCatalogQuery ||
      model.name.toLowerCase().includes(normalizedCatalogQuery) ||
      model.architecture.toLowerCase().includes(normalizedCatalogQuery) ||
      model.tags.some((tag) =>
        tag.toLowerCase().includes(normalizedCatalogQuery),
      )
    );
  });

  function refreshAll() {
    onRefresh();
    void loadCatalog(true);
  }

  return (
    <main className="tool-view models-view">
      <header className="tool-header">
        <div>
          <span className="eyebrow">Runtime inventory</span>
          <h1>Models</h1>
        </div>
        <button
          className="secondary-button"
          type="button"
          disabled={catalogLoading}
          onClick={refreshAll}
        >
          <RefreshCw className={catalogLoading ? "spin" : ""} size={15} />
          Refresh
        </button>
      </header>

      <section className="model-summary-band">
        <div className={`runtime-orb ${health.online ? "online" : ""}`}>
          <Box size={24} />
        </div>
        <div>
          <span className="eyebrow">Ollama</span>
          <strong>
            {health.online ? "Local runtime connected" : "Runtime unavailable"}
          </strong>
          <small>
            {health.online
              ? `${models.length} installed models / v${health.version ?? "unknown"}`
              : (health.error ?? "Check the runtime address in Settings")}
          </small>
        </div>
        <span className={`status-pill ${health.online ? "success" : "danger"}`}>
          <span className="status-dot" />
          {health.online ? `${health.latencyMs} ms` : "Offline"}
        </span>
      </section>

      <section className="model-section catalog-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Verified against this machine</span>
            <h2>Discover</h2>
          </div>
          {catalog?.system && (
            <div className="catalog-hardware">
              <span>
                <Cpu size={12} /> {catalog.system.gpu.name}
              </span>
              <span>
                {Math.round(catalog.system.gpu.memoryTotalMb / 1024)} GB VRAM
              </span>
              <span>
                {Math.round(catalog.system.totalMemoryMb / 1024)} GB RAM
              </span>
            </div>
          )}
        </div>

        <div className="catalog-controls">
          <div className="catalog-tabs" role="tablist" aria-label="Model types">
            {catalogFilters.map((filter) => {
              const Icon = filter.icon;
              const count =
                filter.id === "all"
                  ? (catalog?.items.length ?? 0)
                  : (catalog?.items.filter(
                      (item) => item.category === filter.id,
                    ).length ?? 0);
              return (
                <button
                  className={catalogFilter === filter.id ? "active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={catalogFilter === filter.id}
                  key={filter.id}
                  onClick={() => setCatalogFilter(filter.id)}
                >
                  <Icon size={13} /> {filter.label} <span>{count}</span>
                </button>
              );
            })}
          </div>
          <label className="search-field catalog-search">
            <Search size={15} />
            <span className="sr-only">Search live model catalog</span>
            <input
              value={catalogQuery}
              onChange={(event) => setCatalogQuery(event.target.value)}
              placeholder="Search models or pipelines"
            />
          </label>
          <label className="catalog-compatible-toggle">
            <input
              type="checkbox"
              checked={compatibleOnly}
              onChange={(event) => setCompatibleOnly(event.target.checked)}
            />
            <span>Compatible only</span>
          </label>
        </div>

        {catalogError && (
          <p className="catalog-notice danger">{catalogError}</p>
        )}
        {catalog?.warnings.length ? (
          <p className="catalog-notice">{catalog.warnings.join(" ")}</p>
        ) : null}

        {catalogLoading && !catalog ? (
          <div className="catalog-loading" aria-live="polite">
            <LoaderCircle className="spin" size={18} />
            Checking official manifests and model metadata...
          </div>
        ) : (
          <div className="catalog-grid">
            {visibleCatalog.map((model) => {
              const installed = Boolean(
                model.pullTag && installedNames.has(model.pullTag),
              );
              const pullDisabled =
                installed ||
                !health.online ||
                Boolean(pull) ||
                model.compatibility === "unsupported";
              return (
                <article
                  className={`catalog-model-card fit-${model.compatibility}`}
                  key={model.id}
                >
                  <header>
                    <span className={`catalog-source ${model.source}`}>
                      {sourceLabel(model)}
                    </span>
                    <span
                      className="catalog-verified"
                      title="Live source verified"
                    >
                      <ShieldCheck size={12} /> Verified
                    </span>
                  </header>
                  <div className="catalog-model-heading">
                    <h3>{model.name}</h3>
                    <span className={`fit-badge ${model.compatibility}`}>
                      {model.compatibilityLabel}
                    </span>
                  </div>
                  <p>{model.description}</p>
                  <div className="catalog-model-facts">
                    <span>{model.architecture}</span>
                    <span>{formatParameters(model.parameters)}</span>
                    <span>
                      <HardDrive size={11} /> {formatBytes(model.sizeBytes)}
                    </span>
                    {model.downloads ? (
                      <span>{formatCount(model.downloads)} downloads</span>
                    ) : null}
                  </div>
                  <footer>
                    <small>{model.compatibilityReason}</small>
                    {model.source === "ollama" && model.pullTag ? (
                      <button
                        className={installed ? "installed" : ""}
                        type="button"
                        disabled={pullDisabled}
                        onClick={() => install(model.pullTag ?? "")}
                      >
                        {installed ? (
                          <>
                            <Check size={14} /> Installed
                          </>
                        ) : (
                          <>
                            <Download size={14} /> Pull
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void forgeApi.catalog.open(model.url)}
                      >
                        <ExternalLink size={14} /> View
                      </button>
                    )}
                  </footer>
                </article>
              );
            })}
            {visibleCatalog.length === 0 && !catalogLoading && (
              <p className="empty-list catalog-empty">
                No verified models match these filters.
              </p>
            )}
          </div>
        )}
      </section>

      {pull && (
        <section className="pull-progress" aria-live="polite">
          <div>
            <LoaderCircle className="spin" size={17} />
            <span>
              <strong>{pull.status}</strong>
              <small>
                {pull.digest?.slice(0, 18) ?? "Preparing model files"}
              </small>
            </span>
          </div>
          <div className="pull-meter">
            <span style={{ width: `${pullPercent}%` }} />
          </div>
          <output>{pullPercent > 0 ? `${pullPercent}%` : ""}</output>
          <button
            type="button"
            aria-label="Cancel model pull"
            onClick={() => {
              void forgeApi.ollama.cancelPull(pull.requestId);
              setPull(null);
            }}
          >
            <X size={15} />
          </button>
        </section>
      )}

      <section className="model-section installed-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">On this machine</span>
            <h2>Installed</h2>
          </div>
          <label className="search-field">
            <Search size={15} />
            <span className="sr-only">Search installed models</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter models"
            />
          </label>
        </div>
        <div className="installed-model-list">
          {filtered.map((model) => (
            <button
              className={`installed-model-row ${selectedModel === model.name ? "active" : ""}`}
              type="button"
              key={model.name}
              onClick={() => onSelect(model.name)}
            >
              <span className="model-monogram">
                {model.family.slice(0, 2).toUpperCase()}
              </span>
              <span className="installed-model-name">
                <strong>{model.name}</strong>
                <small>
                  {model.family} / {model.parameterSize} / {model.quantization}
                </small>
              </span>
              <span>{(model.size / 1024 / 1024 / 1024).toFixed(1)} GB</span>
              <span>
                {selectedModel === model.name ? "Active" : "Use model"}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="empty-list">No installed models match this filter.</p>
          )}
        </div>
        <div className="custom-pull">
          <div>
            <strong>Pull another model</strong>
            <small>Use any model tag published for Ollama.</small>
          </div>
          <input
            value={customModel}
            onChange={(event) => setCustomModel(event.target.value)}
            placeholder="model:tag"
          />
          <button
            className="primary-button"
            type="button"
            disabled={!customModel.trim() || !health.online || Boolean(pull)}
            onClick={() => install(customModel)}
          >
            <Download size={15} /> Pull model
          </button>
        </div>
      </section>
    </main>
  );
}
