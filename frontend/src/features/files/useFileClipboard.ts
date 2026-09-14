import { useEffect, useState } from "react";
import type { FileEntry } from "../../lib/api";
import type { Operation } from "./operations";

type Clipboard = { mode: "copy" | "move"; entries: FileEntry[] };

export function useFileClipboard() {
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  function capture(mode: Clipboard["mode"], entries: FileEntry[]) {
    if (entries.length) setClipboard({ mode, entries: [...entries] });
  }
  function reconcile(jobs: Operation[]) {
    const moved = new Set(
      jobs
        .filter((job) => job.kind === "move" || job.kind === "trash")
        .flatMap((job) =>
          job.items
            .filter((item) => item.status === "done")
            .map((item) => item.source),
        ),
    );
    setClipboard((current) => {
      if (!current || current.mode !== "move") return current;
      const entries = current.entries.filter((entry) => !moved.has(entry.path));
      return entries.length ? { ...current, entries } : null;
    });
  }
  return { clipboard, capture, reconcile, clear: () => setClipboard(null) };
}

export function useFileShortcuts({
  enabled,
  selected,
  capture,
  paste,
  trash,
}: {
  enabled: boolean;
  selected: FileEntry[];
  capture: (mode: "copy" | "move", entries: FileEntry[]) => void;
  paste: () => void;
  trash: () => void;
}) {
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        !enabled ||
        event.repeat ||
        event.defaultPrevented ||
        event.altKey ||
        event.isComposing ||
        target?.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='dialog'], [role='menu']",
        ) ||
        Array.from(
          document.querySelectorAll<HTMLElement>(
            '[role="dialog"][aria-modal="true"]',
          ),
        ).some(
          (element) =>
            element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility === "visible",
        ) ||
        window.getSelection()?.toString()
      )
        return;
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if ((key === "c" || key === "x") && selected.length) {
          event.preventDefault();
          capture(key === "c" ? "copy" : "move", selected);
        } else if (key === "v") {
          event.preventDefault();
          paste();
        }
      } else if (event.key === "Delete" && selected.length) {
        event.preventDefault();
        trash();
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [enabled, selected, capture, paste, trash]);
}
