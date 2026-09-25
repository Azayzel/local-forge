import {
  Activity,
  Boxes,
  Command,
  Images,
  Library,
  MessageSquareText,
  Minus,
  Settings,
  SlidersHorizontal,
  Square,
  WandSparkles,
  X,
} from "lucide-react";
import { forgeApi, isBrowserPreview } from "../lib/forge-api";
import type { AppView, RuntimeHealth } from "../types";
import { BrandMark } from "./BrandMark";

const navigation: Array<{
  id: AppView;
  label: string;
  icon: typeof MessageSquareText;
}> = [
  { id: "workbench", label: "Workbench", icon: MessageSquareText },
  { id: "studio", label: "Studio", icon: WandSparkles },
  { id: "library", label: "Library", icon: Images },
  { id: "models", label: "Models", icon: Boxes },
  { id: "tune", label: "Tune", icon: SlidersHorizontal },
  { id: "activity", label: "Activity", icon: Activity },
];

interface TitleBarProps {
  health: RuntimeHealth;
  modelName: string;
  onOpenCommand: () => void;
}

export function TitleBar({ health, modelName, onOpenCommand }: TitleBarProps) {
  return (
    <header className="titlebar drag-region">
      <div className="titlebar-brand">
        <span className="brand-mark" aria-hidden="true">
          <BrandMark size={20} />
        </span>
        <span className="brand-name">LOCAL FORGE</span>
        <span className="brand-scope">WORKBENCH</span>
      </div>

      <button
        className="command-trigger no-drag"
        type="button"
        onClick={onOpenCommand}
      >
        <Command size={14} />
        <span>Quick actions</span>
        <kbd>Ctrl K</kbd>
      </button>

      <div className="titlebar-runtime" aria-live="polite">
        <span
          className={`status-dot ${health.online ? "online" : "offline"}`}
        />
        <span>
          {isBrowserPreview
            ? "Preview runtime"
            : health.online
              ? modelName || "Ollama ready"
              : "Runtime offline"}
        </span>
      </div>

      {!isBrowserPreview && (
        <div className="window-controls no-drag">
          <button
            type="button"
            title="Minimize"
            aria-label="Minimize window"
            onClick={forgeApi.window.minimize}
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            title="Maximize"
            aria-label="Maximize window"
            onClick={forgeApi.window.maximize}
          >
            <Square size={12} />
          </button>
          <button
            className="window-close"
            type="button"
            title="Close"
            aria-label="Close window"
            onClick={forgeApi.window.close}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </header>
  );
}

interface NavRailProps {
  activeView: AppView;
  onChange: (view: AppView) => void;
}

export function NavRail({ activeView, onChange }: NavRailProps) {
  return (
    <nav className="nav-rail" aria-label="Primary navigation">
      <div className="rail-glyph" aria-hidden="true">
        <BrandMark size={27} />
      </div>
      <div className="nav-rail-items">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`rail-button ${activeView === item.id ? "active" : ""}`}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-current={activeView === item.id ? "page" : undefined}
              onClick={() => onChange(item.id)}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span className="rail-tooltip">{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="nav-rail-bottom">
        <button
          className={`rail-button ${activeView === "settings" ? "active" : ""}`}
          type="button"
          title="Settings"
          aria-label="Settings"
          aria-current={activeView === "settings" ? "page" : undefined}
          onClick={() => onChange("settings")}
        >
          <Settings size={19} strokeWidth={1.8} />
          <span className="rail-tooltip">Settings</span>
        </button>
        <div className="local-only-badge" title="Data stays on this device">
          <Library size={13} />
        </div>
      </div>
    </nav>
  );
}
