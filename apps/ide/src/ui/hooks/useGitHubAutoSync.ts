import { useCallback, useEffect, useRef } from "react";
import type { EventBus, StorageBackend } from "@ports";
import {
  autoSyncDebounceMs,
  autoSyncEnabled,
  pullProjectToIdb,
  pushProjectToGitHub,
  remoteSlug,
  remoteSubtreeSha,
  syncedSubtreeSha,
  type GitHubState,
} from "@app";

// Auto-continue across devices (#166): push idle-debounced after edits + on
// tab-hide; pull on project open + window focus. Conflict detection is
// PER-PROJECT (our folder's subtree sha vs the last we synced) so another user
// editing a different project never blocks us. On a real conflict (our project
// changed remotely while we have local edits, or diverged) auto-sync PAUSES for
// that project and toasts — nothing is clobbered, no merge engine. It auto-
// resumes once a manual pull/push makes remote == synced.

interface ToastLike {
  push: (kind: "error" | "info", message: string) => void;
  error: (e: unknown) => void;
}

interface Deps {
  gh: GitHubState;
  events: EventBus;
  storage: StorageBackend;
  /** Active project id, or null when none is open. */
  projectId: string | null;
  /** Reload the active project from storage (after a pull). */
  reloadProject: () => Promise<void>;
  /** Called after a successful pull (refresh lists / project listing). */
  onPulled: () => void;
  toast: ToastLike;
}

export function useGitHubAutoSync(deps: Deps) {
  const ref = useRef(deps);
  useEffect(() => {
    ref.current = deps;
  });

  const dirty = useRef(false); // local edits to the active project since last push
  const paused = useRef<Set<string>>(new Set()); // project ids paused on conflict
  const timer = useRef<number | null>(null);

  const ready = (d: Deps): d is Deps & { projectId: string } =>
    d.gh.available && d.gh.signedIn && !!d.gh.repo && !!d.gh.auth && !!d.projectId && autoSyncEnabled();

  const attemptPush = useCallback(async () => {
    const d = ref.current;
    if (!ready(d)) { d.gh.setSyncStatus("off"); return; }
    if (!dirty.current) return;
    const pid = d.projectId;
    const repo = d.gh.repo!;
    const auth = d.gh.auth!;
    const fetch = (url: string, init?: RequestInit) => auth.fetch(url, init);
    try {
      d.gh.setSyncStatus("syncing");
      const remote = await remoteSubtreeSha(fetch, repo, pid);
      // Safe iff our project's remote state matches what we last synced (both
      // null = new project; same sha = unchanged remotely).
      if (remote !== syncedSubtreeSha(pid)) {
        paused.current.add(pid);
        d.gh.setSyncStatus("paused");
        d.toast.push("info", "Auto-sync paused — this project changed on GitHub. Pull or push via File ▸ GitHub.");
        return;
      }
      paused.current.delete(pid);
      await pushProjectToGitHub(d.storage, fetch, repo, pid); // amend default; updates synced subtree
      dirty.current = false;
      d.gh.setSyncStatus("idle");
    } catch (e) {
      d.gh.setSyncStatus("error");
      d.toast.error(e);
    }
  }, []);

  const schedulePush = useCallback(() => {
    dirty.current = true;
    ref.current.gh.setSyncStatus("pending"); // show "unsynced" immediately on edit
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void attemptPush();
    }, autoSyncDebounceMs());
  }, [attemptPush]);

  const attemptPull = useCallback(async () => {
    const d = ref.current;
    if (!ready(d)) { d.gh.setSyncStatus("off"); return; }
    const pid = d.projectId;
    const repo = d.gh.repo!;
    const auth = d.gh.auth!;
    const fetch = (url: string, init?: RequestInit) => auth.fetch(url, init);
    try {
      d.gh.setSyncStatus("syncing");
      const remote = await remoteSubtreeSha(fetch, repo, pid);
      if (remote === syncedSubtreeSha(pid)) {
        paused.current.delete(pid); // nothing new (and any conflict is resolved)
        d.gh.setSyncStatus("idle");
        return;
      }
      if (dirty.current) {
        paused.current.add(pid);
        d.gh.setSyncStatus("paused");
        d.toast.push("info", "Auto-sync paused — this project changed on GitHub and you have local edits. Resolve via File ▸ GitHub.");
        return;
      }
      paused.current.delete(pid);
      await pullProjectToIdb(d.storage, fetch, repo, remoteSlug(pid));
      await d.reloadProject();
      d.onPulled();
      d.gh.setSyncStatus("idle");
    } catch (e) {
      d.gh.setSyncStatus("error");
      d.toast.error(e);
    }
  }, []);

  // Local edits (the saver's file:changed) schedule a debounced push.
  useEffect(() => {
    const off = ref.current.events.on("file:changed", () => {
      if (ready(ref.current)) schedulePush();
    });
    return off;
  }, [schedulePush]);

  // Pull on project open; reset per-project edit state on switch. Also re-runs
  // when GitHub becomes ready (signed in + repo) after mount.
  const projectId = deps.projectId;
  const signedIn = deps.gh.signedIn;
  const repo = deps.gh.repo;
  useEffect(() => {
    dirty.current = false;
    if (timer.current != null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    void attemptPull();
  }, [projectId, signedIn, repo, attemptPull]);

  // Pull when this device/tab regains focus; flush a pending push on hide.
  useEffect(() => {
    const onFocus = () => void attemptPull();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void attemptPull();
      } else {
        if (timer.current != null) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        void attemptPush();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [attemptPull, attemptPush]);
}
