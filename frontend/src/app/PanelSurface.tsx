import type { ReactNode } from "react";
import { ResizableDrawer } from "./ResizableDrawer";

/** One content surface for standalone management pages and contextual drawers. */
export function PanelSurface({
  title,
  open,
  onClose,
  mode = "drawer",
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  mode?: "drawer" | "page" | "inline";
  children: ReactNode;
}) {
  if (mode === "page")
    return open ? (
      <section className="management-page" aria-label={title}>
        <header className="management-heading">
          <h1>{title}</h1>
        </header>
        {children}
      </section>
    ) : null;
  if (mode === "inline")
    return <section aria-label={title}>{children}</section>;
  return (
    <ResizableDrawer title={title} open={open} onClose={onClose}>
      {children}
    </ResizableDrawer>
  );
}
