import { useCallback, useEffect, useRef, useState } from "react";

// Widths in px (1rem = 10px here). Keep in sync with the clamp() in
// Sidebar.module.css, which applies the same limits when the window itself
// is resized.
// 360px keeps the nav tabs on one row (they wrap only when the Admin tab is
// also shown) and leaves room for list content.
export const SIDEBAR_MIN_WIDTH = 360;
export const SIDEBAR_DEFAULT_WIDTH = 560;
const SIDEBAR_MAX_WIDTH = 900;
const MAP_MIN_WIDTH = 360;
const APP_PADDING_X = 48;
const KEYBOARD_STEP = 16;

const STORAGE_KEY = "traveltrack:sidebar";

// Per-browser preference only, so failures (private mode, blocked storage)
// just fall back to the defaults.
function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function save(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function clampWidth(width) {
  const max = Math.max(
    SIDEBAR_MIN_WIDTH,
    Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - APP_PADDING_X - MAP_MIN_WIDTH),
  );
  return Math.round(Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), max));
}

// Sidebar width (drag the right edge or use the arrow keys on it),
// remembered in localStorage. The sidebar can be resized but never hidden.
export function useResizableSidebar() {
  const [width, setWidth] = useState(
    () => readSaved().width ?? SIDEBAR_DEFAULT_WIDTH,
  );
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    save({ width });
  }, [width]);

  // While dragging, keep the resize cursor and stop text selection even when
  // the pointer moves faster than the handle.
  useEffect(() => {
    if (!isResizing) return;
    document.body.classList.add("is-resizing-sidebar");
    return () => document.body.classList.remove("is-resizing-sidebar");
  }, [isResizing]);

  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startWidth: sidebarRef.current.getBoundingClientRect().width,
    };
    setIsResizing(true);
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    const { startX, startWidth } = dragRef.current;
    setWidth(clampWidth(startWidth + e.clientX - startX));
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setIsResizing(false);
  }, []);

  const handleKeyDown = useCallback((e) => {
    const current = sidebarRef.current.getBoundingClientRect().width;
    if (e.key === "ArrowLeft") setWidth(clampWidth(current - KEYBOARD_STEP));
    else if (e.key === "ArrowRight")
      setWidth(clampWidth(current + KEYBOARD_STEP));
    else if (e.key === "Home") setWidth(SIDEBAR_MIN_WIDTH);
    else if (e.key === "End") setWidth(clampWidth(Infinity));
    else return;
    e.preventDefault();
  }, []);

  const resetWidth = useCallback(() => setWidth(SIDEBAR_DEFAULT_WIDTH), []);

  return {
    width,
    isResizing,
    sidebarRef,
    resetWidth,
    handleProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
      onKeyDown: handleKeyDown,
      onDoubleClick: resetWidth,
    },
  };
}
