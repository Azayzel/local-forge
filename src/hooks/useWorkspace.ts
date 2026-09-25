import { useEffect, useState } from "react";
import { forgeApi } from "../lib/forge-api";
import {
  createDefaultWorkspace,
  createThread,
  normalizeWorkspace,
  type Thread,
  type WorkspaceState,
} from "../state/workspace";

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(
    createDefaultWorkspace,
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void forgeApi.storage.loadWorkspace().then((stored) => {
      if (active) {
        setWorkspace(normalizeWorkspace(stored));
        setLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      void forgeApi.storage.saveWorkspace(workspace).catch((error: unknown) => {
        console.error("Could not save Local Forge workspace:", error);
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [loaded, workspace]);

  const activeThread =
    workspace.threads.find(
      (thread) => thread.id === workspace.activeThreadId,
    ) ?? workspace.threads[0];

  function patchWorkspace(patch: Partial<WorkspaceState>) {
    setWorkspace((current) => ({ ...current, ...patch }));
  }

  function patchThread(threadId: string, patch: Partial<Thread>) {
    setWorkspace((current) => ({
      ...current,
      threads: current.threads.map((thread) =>
        thread.id === threadId
          ? { ...thread, ...patch, updatedAt: new Date().toISOString() }
          : thread,
      ),
    }));
  }

  function updateThread(threadId: string, update: (thread: Thread) => Thread) {
    setWorkspace((current) => ({
      ...current,
      threads: current.threads.map((thread) =>
        thread.id === threadId
          ? { ...update(thread), updatedAt: new Date().toISOString() }
          : thread,
      ),
    }));
  }

  function addThread() {
    const thread = createThread();
    setWorkspace((current) => ({
      ...current,
      activeView: "workbench",
      activeThreadId: thread.id,
      threads: [thread, ...current.threads],
    }));
  }

  function removeThread(threadId: string) {
    setWorkspace((current) => {
      const remaining = current.threads.filter(
        (thread) => thread.id !== threadId,
      );
      const threads = remaining.length > 0 ? remaining : [createThread()];
      return {
        ...current,
        threads,
        activeThreadId:
          current.activeThreadId === threadId
            ? threads[0].id
            : current.activeThreadId,
      };
    });
  }

  return {
    workspace,
    setWorkspace,
    patchWorkspace,
    activeThread,
    patchThread,
    updateThread,
    addThread,
    removeThread,
    loaded,
  };
}
