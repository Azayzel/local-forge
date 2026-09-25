import { Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface PaletteAction {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  icon: ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  actions: PaletteAction[];
  onClose: () => void;
}

export function CommandPalette({ actions, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = actions.filter((action) =>
    `${action.label} ${action.group}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  useEffect(() => {
    dialogRef.current?.showModal();
    inputRef.current?.focus();
    return () => dialogRef.current?.close();
  }, []);

  function runAction(action: PaletteAction) {
    action.run();
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="command-dialog"
      aria-label="Quick actions"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="command-palette">
        <label className="command-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search quick actions</span>
          <input
            ref={inputRef}
            value={query}
            placeholder="Type a command or open a view"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) =>
                  Math.min(index + 1, filtered.length - 1),
                );
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              }
              if (event.key === "Enter" && filtered[activeIndex]) {
                event.preventDefault();
                runAction(filtered[activeIndex]);
              }
            }}
          />
          <kbd>Esc</kbd>
        </label>
        <div className="command-results" role="listbox">
          {filtered.map((action, index) => (
            <button
              className={index === activeIndex ? "active" : ""}
              key={action.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => runAction(action)}
            >
              <span className="command-icon">{action.icon}</span>
              <span>
                <strong>{action.label}</strong>
                <small>{action.group}</small>
              </span>
              {action.shortcut && <kbd>{action.shortcut}</kbd>}
            </button>
          ))}
          {filtered.length === 0 && <p>No matching actions</p>}
        </div>
      </div>
    </dialog>
  );
}
