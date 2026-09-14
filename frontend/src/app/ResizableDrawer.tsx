import { useEffect, useRef, useState } from "react";
import { Drawer, type DrawerProps } from "antd";

/** Right-hand panels share one mouse, keyboard and responsive sizing policy. */
export function ResizableDrawer(
  props: Omit<DrawerProps, "width" | "size" | "placement" | "drawerRender">,
) {
  const [viewport, setViewport] = useState(() => window.innerWidth);
  const [preferredWidth, setPreferredWidth] = useState(800);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const mobile = viewport < 768;
  const maximum = Math.max(480, viewport - 48);
  const width = Math.min(maximum, Math.max(480, preferredWidth));
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (!props.open || mobile) {
      drag.current = null;
      setResizing(false);
    }
  }, [props.open, mobile]);
  const changeWidth = (value: number) =>
    setPreferredWidth(Math.min(maximum, Math.max(480, value)));
  return (
    <Drawer
      {...props}
      placement="right"
      width={mobile ? "100%" : width}
      styles={{
        ...props.styles,
        wrapper: {
          ...(typeof props.styles === "object" ? props.styles.wrapper : {}),
          ...(resizing ? { transition: "none" } : {}),
        },
      }}
      drawerRender={(node) => (
        <div className="resizable-drawer-panel">
          {!mobile && (
            <div
              className="drawer-resize-handle"
              role="separator"
              tabIndex={0}
              aria-label="調整側邊面板寬度"
              aria-orientation="vertical"
              aria-valuemin={480}
              aria-valuemax={maximum}
              aria-valuenow={Math.round(width)}
              aria-valuetext={`${Math.round(width)} 像素`}
              title="拖曳調整寬度；方向鍵微調，Home 還原預設"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = { x: event.clientX, width };
                setResizing(true);
              }}
              onPointerMove={(event) => {
                if (drag.current)
                  changeWidth(
                    drag.current.width + drag.current.x - event.clientX,
                  );
              }}
              onPointerUp={(event) => {
                drag.current = null;
                setResizing(false);
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                drag.current = null;
                setResizing(false);
              }}
              onLostPointerCapture={() => {
                drag.current = null;
                setResizing(false);
              }}
              onDoubleClick={() => changeWidth(800)}
              onKeyDown={(event) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  changeWidth(
                    event.key === "Home"
                      ? 800
                      : event.key === "End"
                        ? maximum
                        : width + (event.key === "ArrowLeft" ? 32 : -32),
                  );
                }
              }}
            />
          )}
          {node}
        </div>
      )}
    />
  );
}
