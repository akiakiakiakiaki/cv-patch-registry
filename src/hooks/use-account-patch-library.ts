"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEmptyPatch } from "@/lib/domain/patch-service";
import { diffPatchLibraries } from "@/lib/patches/library-diff";
import type { PatchLibrary, PatchRecord } from "@/lib/domain/types";

export type AccountSaveStatus = "idle" | "saving" | "saved" | "conflict" | "error";

export interface PatchMeta {
  visibility: "private" | "public";
  tags: string[];
}

interface PatchStateResponse {
  id: string;
  name: string;
  updatedAt: string;
  revision: number;
  visibility: "private" | "public";
  tags: string[];
  data: PatchRecord["data"];
}

const SAVE_DELAY_MS = 500;

/**
 * The signed-in user's patches for one synth, as a PatchLibrary. Local edits are diffed against the
 * last snapshot and sent in order: creates, then updates (debounced per save), then deletes.
 * Each update carries the revision it was based on, so a concurrent change from another tab is detected (409).
 */
export function useAccountPatchLibrary(synthSlug: string, enabled: boolean) {
  const [library, setLibrary] = useState<PatchLibrary | null>(null);
  const [meta, setMeta] = useState<Record<string, PatchMeta>>({});
  const [status, setStatus] = useState<AccountSaveStatus>("idle");
  const libraryRef = useRef<PatchLibrary | null>(null);
  const revisions = useRef(new Map<string, number>());
  const dirtyIds = useRef(new Set<string>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enqueue = useCallback((task: () => Promise<void>) => {
    queue.current = queue.current.then(task).catch(() => setStatus("error"));
    return queue.current;
  }, []);

  const applyStates = useCallback((states: PatchStateResponse[]) => {
    revisions.current = new Map(states.map((state) => [state.id, state.revision]));
    const next: PatchLibrary = {
      activeId: states[0]?.id ?? "",
      patches: states.map((state) => ({ id: state.id, name: state.name, updatedAt: state.updatedAt, data: state.data })),
    };
    libraryRef.current = next;
    setLibrary(next);
    setMeta(Object.fromEntries(states.map((state) => [state.id, { visibility: state.visibility, tags: state.tags }])));
  }, []);

  const load = useCallback(async () => {
    const response = await fetch(`/api/patches?synth=${encodeURIComponent(synthSlug)}`, { cache: "no-store" });
    if (!response.ok) return setStatus("error");
    const body = (await response.json()) as { patches: PatchStateResponse[] };
    if (body.patches.length === 0) {
      // Like the local library, an account always has one patch to edit.
      const first = createEmptyPatch();
      const created = await fetch("/api/patches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: first.id, synthSlug, name: first.name, data: first.data }),
      });
      if (!created.ok) return setStatus("error");
      return load();
    }
    applyStates(body.patches);
  }, [synthSlug, applyStates]);

  const putPatch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const expectedRevision = revisions.current.get(id);
      if (expectedRevision === undefined) return;
      setStatus("saving");
      const response = await fetch(`/api/patches/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, expectedRevision }),
      });
      // Runs inside the queue already, so reload directly instead of re-queueing (that would wait for itself).
      if (response.status === 409) {
        setStatus("conflict");
        return load();
      }
      if (!response.ok) return setStatus("error");
      const saved = (await response.json()) as { revision: number };
      revisions.current.set(id, saved.revision);
      setStatus("saved");
    },
    [enqueue, load],
  );

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const ids = [...dirtyIds.current];
    dirtyIds.current.clear();
    for (const id of ids) {
      const patch = libraryRef.current?.patches.find((item) => item.id === id);
      if (patch) void enqueue(() => putPatch(id, { name: patch.name, data: patch.data }));
    }
  }, [enqueue, putPatch]);

  useEffect(() => {
    if (!enabled) return;
    void enqueue(load);
    return () => {
      // Drain pending edits before the next synth's load replaces the shared snapshot refs.
      // This also flushes when the editor unmounts or account mode is disabled.
      flush();
    };
  }, [enabled, load, enqueue, flush]);

  /** Applies a new library snapshot from the editor and schedules the matching API calls. */
  const commit = useCallback(
    (next: PatchLibrary) => {
      const diff = diffPatchLibraries(libraryRef.current, next);
      libraryRef.current = next;
      setLibrary(next);
      for (const patch of diff.created) {
        void enqueue(async () => {
          const response = await fetch("/api/patches", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: patch.id, synthSlug, name: patch.name, data: patch.data }),
          });
          if (!response.ok) return setStatus("error");
          const created = (await response.json()) as { revision: number };
          revisions.current.set(patch.id, created.revision);
          setStatus("saved");
        });
      }
      for (const id of diff.deleted) {
        void enqueue(async () => {
          const response = await fetch(`/api/patches/${encodeURIComponent(id)}`, { method: "DELETE" });
          if (!response.ok) return setStatus("error");
          revisions.current.delete(id);
          setStatus("saved");
        });
      }
      for (const id of diff.changed) dirtyIds.current.add(id);
      if (diff.changed.length > 0) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, SAVE_DELAY_MS);
        setStatus("saving");
      }
    },
    [enqueue, flush, synthSlug],
  );

  /** Visibility and tags are saved at once, with the same revision check. */
  const updateMeta = useCallback(
    (id: string, change: Partial<PatchMeta>) => {
      setMeta((current) => ({ ...current, [id]: { ...(current[id] ?? { visibility: "private", tags: [] }), ...change } }));
      const patch = libraryRef.current?.patches.find((item) => item.id === id);
      if (!patch) return;
      void enqueue(() => putPatch(id, { name: patch.name, ...change }));
    },
    [enqueue, putPatch],
  );

  const reload = useCallback(() => void enqueue(load), [enqueue, load]);
  return useMemo(
    () => ({ library, meta, status, commit, updateMeta, reload }),
    [library, meta, status, commit, updateMeta, reload],
  );
}
