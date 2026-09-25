import { PanelLeftClose, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Thread } from "../state/workspace";

interface SessionSidebarProps {
  threads: Thread[];
  activeThreadId: string;
  onCreate: () => void;
  onSelect: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onCollapse: () => void;
}

function relativeTime(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(elapsed / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function SessionSidebar({
  threads,
  activeThreadId,
  onCreate,
  onSelect,
  onDelete,
  onCollapse,
}: SessionSidebarProps) {
  const [query, setQuery] = useState("");
  const filtered = [...threads]
    .filter((thread) =>
      thread.title.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((left, right) => Number(right.pinned) - Number(left.pinned));

  return (
    <aside className="session-sidebar">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">Workspace</span>
          <strong>Personal forge</strong>
        </div>
        <button
          className="icon-button subtle"
          type="button"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          onClick={onCollapse}
        >
          <PanelLeftClose size={17} />
        </button>
      </div>

      <button className="new-thread-button" type="button" onClick={onCreate}>
        <Plus size={16} />
        New session
        <kbd>Ctrl N</kbd>
      </button>

      <label className="search-field">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">Search sessions</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sessions"
        />
      </label>

      <div className="session-list-heading">
        <span>Recent</span>
      </div>

      <div className="session-list">
        {filtered.map((thread) => {
          const lastMessage =
            thread.messages.at(-1)?.content || "No messages yet";
          return (
            <div
              className={`session-row ${thread.id === activeThreadId ? "active" : ""}`}
              key={thread.id}
            >
              <button
                className="session-row-select"
                type="button"
                onClick={() => onSelect(thread.id)}
              >
                <span className="session-row-main">
                  <span className="session-title">{thread.title}</span>
                  <span className="session-snippet">{lastMessage}</span>
                  <span className="session-meta">
                    {thread.model || "No model"} <i />{" "}
                    {relativeTime(thread.updatedAt)}
                  </span>
                </span>
              </button>
              <button
                className="session-delete"
                type="button"
                title="Delete session"
                aria-label={`Delete ${thread.title}`}
                onClick={() => onDelete(thread.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="empty-filter">No matching sessions</p>
        )}
      </div>
    </aside>
  );
}
