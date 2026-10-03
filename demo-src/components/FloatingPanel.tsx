/**
 * FloatingPanel — the shell every panel renders inside.
 *
 * Capabilities:
 *   - Draggable by the header
 *   - Resizable from the bottom-right corner (and edges)
 *   - Position + size persist per `panelId` in localStorage
 *   - Auto-clamps to viewport so it never gets stuck off-screen
 *   - Supports a default starting position + size
 *   - Esc closes
 *
 * Persistence model: one localStorage entry per panel id, storing
 * {x, y, width, height}. When a panel opens, it restores the full
 * geometry. When the user drags or resizes, the change writes back
 * on pointer-up (not every frame — avoids localStorage churn).
 *
 * Resize handles:
 *   - SE corner (primary): both width and height
 *   - E edge: width only
 *   - S edge: height only
 *
 * Resizing has explicit min/max so panels stay usable. Caller can
 * override the defaults via minWidth/minHeight/maxWidth/maxHeight.
 *
 * The body uses overflow:auto so content scrolls within the resized
 * panel — callers don't need to worry about layout breaking when
 * the user shrinks the panel below their content's natural size.
 */

import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { getPanelTheme, panelThemeVariables } from "../theme/panelThemes";
import { readPanelGeometry, resetPanelGeometry, writePanelGeometry } from "../lib/panelGeometry";
import "./FloatingPanel.css";

export type FloatingPanelProps = {
  /** Stable identifier for persistence. Position+size keyed off this. */
  panelId: string;
  open: boolean;
  onClose: () => void;
  onActivate?: () => void;
  zIndex?: number;
  titleIcon?: string;
  title: string;
  /** Default width if no stored width and no defaultGeometry. */
  width?: number;
  /** Default height if no stored height and no defaultGeometry. */
  height?: number;
  /** Default {x,y,width,height} for the very first time this panel
   *  opens (overrides the width/height defaults if set). */
  defaultGeometry?: { x?: number; y?: number; width?: number; height?: number };
  /** Resize bounds. Sensible defaults provided. */
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** Set to false to disable resizing for a specific panel (rare). */
  resizable?: boolean;
  /** Preserve the window's proportions when resized. Useful for live media surfaces. */
  proportionalResize?: boolean;
  /** Legacy alias for defaultGeometry.x/y — preserved for callers
   *  that already pass it. */
  defaultPosition?: { x: number; y: number };
  headerActions?: ReactNode;
  /** When false, Esc still restores a maximized window but never
   *  CLOSES the panel. Used by the chat window, whose close action
   *  exits hub mode — Esc aimed at another panel shouldn't do that. */
  closeOnEsc?: boolean;
  /** When true, children stay mounted (hidden) when the panel is closed,
   *  preserving React state across open/close cycles. Essential for
   *  CodeWorkspace, which must retain busyMap, live output, and SSE
   *  streams when the panel is hidden and reopened. */
  keepMounted?: boolean;
  children: ReactNode;
};

type Geometry = { x: number; y: number; width: number; height: number };
const PANEL_EXIT_MS = 180;


/** Workspace top edge — windows live below the topbar. */
function workspaceTop(): number {
  const bannerHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--demo-banner-height"));
  return (Number.isFinite(bannerHeight) ? bannerHeight : 124) + 8;
}

function clampGeometry(g: Geometry, minW: number, minH: number, maxW: number, maxH: number): Geometry {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const top = workspaceTop();

  // HARD containment: the screen edge IS the border. Size first (a
  // window can never be larger than the workspace), then position so
  // every edge stays on-screen.
  const width = Math.max(minW, Math.min(maxW, Math.min(vw, g.width)));
  const height = Math.max(minH, Math.min(maxH, Math.min(vh - top, g.height)));

  return {
    x: Math.min(Math.max(0, vw - width), Math.max(0, g.x)),
    y: Math.min(Math.max(top, vh - height), Math.max(top, g.y)),
    width,
    height,
  };
}

export function FloatingPanel({
  panelId,
  open,
  onClose,
  onActivate,
  zIndex,
  titleIcon,
  title,
  width = 420,
  height = 400,
  defaultGeometry,
  defaultPosition,
  minWidth = 280,
  minHeight = 220,
  maxWidth = 1600,
  maxHeight = 1400,
  resizable = true,
  proportionalResize = false,
  headerActions,
  closeOnEsc = true,
  keepMounted = false,
  children,
}: FloatingPanelProps) {
  // Compute the initial geometry exactly once per mount.
  const initial = (() => {
    const stored = readPanelGeometry(panelId)?.geometry;
    // Stagger so multiple first-time-opened panels cascade instead
    // of stacking. Hash the id to a deterministic offset.
    let staggerHash = 0;
    for (let i = 0; i < panelId.length; i++) staggerHash = (staggerHash + panelId.charCodeAt(i)) % 8;
    const staggerPx = staggerHash * 24;
    const defWidth = defaultGeometry?.width ?? width;
    const defHeight = defaultGeometry?.height ?? height;
    const defX = defaultGeometry?.x ?? defaultPosition?.x ?? (window.innerWidth - defWidth - 16 - staggerPx);
    const defY = defaultGeometry?.y ?? defaultPosition?.y ?? (56 + staggerPx);
    const g: Geometry = {
      x: stored?.x ?? defX,
      y: stored?.y ?? defY,
      width: stored?.width ?? defWidth,
      height: stored?.height ?? defHeight,
    };
    return proportionalResize
      ? fitProportionalGeometry(g, width / height, minWidth, minHeight, maxWidth, maxHeight)
      : clampGeometry(g, minWidth, minHeight, maxWidth, maxHeight);
  });
  // Maximize: every dashboard window can expand to fill the workspace
  // (below the topbar) and restore back to its floating geometry —
  // like maximizing an OS window, NOT a fullscreen takeover: the
  // header chrome stays, it's still a window. Transient by design.
  const [maximized, setMaximized] = useState(false);
  const [geom, setGeom] = useState<Geometry>(initial);
  const [present, setPresent] = useState(open);
  const [exitComplete, setExitComplete] = useState(!open);
  const [isInteracting, setIsInteracting] = useState(false);

  // Pointer interaction state. Tracks whether a drag or resize is in
  // progress; populated on pointerdown, consumed on pointermove,
  // committed to storage on pointerup.
  type InteractionMode =
    | "drag"
    | "resize-e" | "resize-w" | "resize-s" | "resize-n"
    | "resize-se" | "resize-sw" | "resize-ne" | "resize-nw";
  const dragRef = useRef<{
    mode: InteractionMode | null;
    startX: number; startY: number;
    origGeom: Geometry;
  }>({ mode: null, startX: 0, startY: 0, origGeom: { x: 0, y: 0, width: 0, height: 0 } });

  // Re-clamp when viewport resizes so panels stay on-screen.
  useEffect(() => {
    const onResize = () => setGeom((g) => proportionalResize
      ? fitProportionalGeometry(g, width / height, minWidth, minHeight, maxWidth, maxHeight)
      : clampGeometry(g, minWidth, minHeight, maxWidth, maxHeight));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [minWidth, minHeight, maxWidth, maxHeight, proportionalResize, width, height]);

  useEffect(() => {
    if (open) {
      const frame = window.requestAnimationFrame(() => {
        setPresent(true);
        setExitComplete(false);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (!present) return;
    const timer = window.setTimeout(() => {
      setExitComplete(true);
      if (!keepMounted) setPresent(false);
    }, PANEL_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [keepMounted, open, present]);

  function startInteraction(
    e: PointerEvent<HTMLElement>,
    mode: InteractionMode,
  ) {
    // Ignore clicks on buttons inside the header.
    if (mode === "drag" && (e.target as HTMLElement).closest("button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsInteracting(true);
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origGeom: { ...geom },
    };
  }

  function onPointerMove(e: PointerEvent<HTMLElement>) {
    const d = dragRef.current;
    if (!d.mode) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const g = d.origGeom;
    // Edge math: east/south grow width/height; WEST and NORTH edges
    // move the origin AND counter-resize so the opposite edge stays
    // anchored. Width/height floors keep the origin from "running
    // away" once the minimum is hit.
    const m = d.mode;
    // Explicit per-mode sets — substring tests are a trap here because
    // the word "resize" itself contains 'e' and 's', which made EVERY
    // resize mode read as east+south.
    const east  = m === "resize-e" || m === "resize-se" || m === "resize-ne";
    const west  = m === "resize-w" || m === "resize-sw" || m === "resize-nw";
    const south = m === "resize-s" || m === "resize-se" || m === "resize-sw";
    const north = m === "resize-n" || m === "resize-ne" || m === "resize-nw";
    let next: Geometry;
    if (m === "drag") {
      next = { ...g, x: g.x + dx, y: g.y + dy };
    } else {
      let { x, y, width, height } = g;
      if (proportionalResize) {
        const horizontal = (east ? dx : west ? -dx : 0) / g.width;
        const vertical = (south ? dy : north ? -dy : 0) / g.height;
        const change = Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical;
        const minScale = Math.max(minWidth / g.width, minHeight / g.height);
        const maxScale = Math.min(maxWidth / g.width, maxHeight / g.height, window.innerWidth / g.width, (window.innerHeight - workspaceTop()) / g.height);
        const scale = Math.max(Math.min(minScale, maxScale), Math.min(maxScale, 1 + change));
        width = Math.round(g.width * scale);
        height = Math.round(g.height * scale);
        if (west) x = g.x + g.width - width;
        if (north) y = g.y + g.height - height;
      } else {
        if (east) width = g.width + dx;
        if (west) { width = Math.max(minWidth, g.width - dx); x = g.x + (g.width - width); }
        if (south) height = g.height + dy;
        if (north) { height = Math.max(minHeight, g.height - dy); y = g.y + (g.height - height); }
      }
      next = { x, y, width, height };
    }
    setGeom(clampGeometry(next, minWidth, minHeight, maxWidth, maxHeight));
  }

  function endInteraction(e: PointerEvent<HTMLElement>) {
    const wasInteracting = !!dragRef.current.mode;
    dragRef.current.mode = null;
    setIsInteracting(false);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    if (wasInteracting) {
      // Snapping is POSITION-DEPENDENT (committed on release so it
      // never fights the hand mid-drag) and DOCK-ONLY: snapping moves
      // the window flush against the edge it was dropped near — it
      // NEVER changes the window's size (the old half/quarter resize
      // behavior swallowed the workspace; a docked window is just a
      // rectangle sitting on that side).
      const GRID = 16;
      const ZONE = 28; // px from a screen edge that arms docking
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const top = workspaceTop();
      const nearL = geom.x <= ZONE;
      const nearR = geom.x + geom.width >= vw - ZONE;
      const nearT = geom.y <= top + ZONE;
      const nearB = geom.y + geom.height >= vh - ZONE;
      let next: Geometry = { ...geom };
      if (nearL) next.x = 0;
      if (nearR) next.x = vw - geom.width;
      if (nearT) next.y = top;
      if (nearB) next.y = vh - geom.height;
      if (!nearL && !nearR && !nearT && !nearB) {
        next = {
          x: Math.round(geom.x / GRID) * GRID,
          y: Math.round(geom.y / GRID) * GRID,
          width: Math.round(geom.width / GRID) * GRID,
          height: Math.round(geom.height / GRID) * GRID,
        };
      }
      const snapped = clampGeometry(next, minWidth, minHeight, maxWidth, maxHeight);
      setGeom(snapped);
      writePanelGeometry(panelId, snapped);
    }
  }

  function resetToDefaults() {
    resetPanelGeometry(panelId);
    let staggerHash = 0;
    for (let i = 0; i < panelId.length; i++) staggerHash = (staggerHash + panelId.charCodeAt(i)) % 8;
    const staggerPx = staggerHash * 24;
    const defWidth = defaultGeometry?.width ?? width;
    const defHeight = defaultGeometry?.height ?? height;
    const defaults: Geometry = {
      x: defaultGeometry?.x ?? defaultPosition?.x ?? (window.innerWidth - defWidth - 16 - staggerPx),
      y: defaultGeometry?.y ?? defaultPosition?.y ?? (56 + staggerPx),
      width: defWidth,
      height: defHeight,
    };
    setMaximized(false);
    setGeom(proportionalResize
      ? fitProportionalGeometry(defaults, width / height, minWidth, minHeight, maxWidth, maxHeight)
      : clampGeometry(defaults, minWidth, minHeight, maxWidth, maxHeight));
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Esc restores a maximized window first; a second Esc closes it
      // (unless this panel opted out of Esc-close).
      setMaximized((mx) => {
        if (mx) return false;
        if (closeOnEsc) onClose();
        return mx;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeOnEsc, open, onClose]);

  // When keepMounted is true, render hidden instead of unmounting so
  // child state survives open/close cycles.
  if (!present && !keepMounted) return null;
  const hiddenStyle = !open && exitComplete ? { display: 'none' as const } : undefined;
  const phaseClass = !open && !exitComplete ? " fp-closing" : "";
  const interactionClass = isInteracting ? " fp-interacting" : "";

  return (
    <div
      className={`fp fp-${panelId.replace(/[^a-z0-9_-]/gi, "-")}${maximized ? " fp-maximized" : ""}${phaseClass}${interactionClass}`}
      data-panel-id={panelId}
      data-panel-motif={getPanelTheme(panelId).motif}
      data-panel-state={open ? "open" : exitComplete ? "closed" : "closing"}
      style={{ ...panelThemeVariables(getPanelTheme(panelId)), ...(maximized ? undefined : { left: geom.x, top: geom.y, width: geom.width, height: geom.height }), zIndex, ...hiddenStyle }}
      onPointerDown={onActivate}
      role="dialog"
      aria-label={title}
      aria-hidden={!open && exitComplete ? true : undefined}
    >
      <div
        className="fp-head"
        onPointerDown={(e) => { if (!maximized) startInteraction(e, "drag"); }}
        onPointerMove={onPointerMove}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        onDoubleClick={() => setMaximized((v) => !v)}
      >
        <div className="fp-title">
          {titleIcon && <i className={`ph ${titleIcon}`} aria-hidden="true"></i>}
          {title}
        </div>
        <div className="fp-head-actions">
          {headerActions}
          <button
            className="fp-reset"
            onClick={resetToDefaults}
            aria-label="Reset window layout"
            title="Reset window layout"
          >
            <i className="ph ph-arrow-counter-clockwise" aria-hidden="true"></i>
          </button>
          <button
            className="fp-close"
            onClick={() => setMaximized((v) => !v)}
            aria-label={maximized ? "Restore window" : "Maximize window"}
            title={maximized ? "Restore (Esc)" : "Maximize (double-click header)"}
          >
            <i className={`ph ${maximized ? "ph-arrows-in" : "ph-arrows-out"}`} aria-hidden="true"></i>
          </button>
          <button className="fp-close" onClick={onClose} aria-label="Close">
            <i className="ph ph-x" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <div className="fp-body">{children}</div>

      {resizable && !maximized && (
        <>
          {(["w", "n", "ne", "nw", "sw"] as const).map((edge) => (
            <div
              key={edge}
              className={`fp-resize-${edge}`}
              onPointerDown={(e) => startInteraction(e, `resize-${edge}` as InteractionMode)}
              onPointerMove={onPointerMove}
              onPointerUp={endInteraction}
              onPointerCancel={endInteraction}
              aria-label={`Resize ${edge}`}
            />
          ))}
          <div
            className="fp-resize-e"
            onPointerDown={(e) => startInteraction(e, "resize-e")}
            onPointerMove={onPointerMove}
            onPointerUp={endInteraction}
            onPointerCancel={endInteraction}
            aria-label="Resize width"
          />
          <div
            className="fp-resize-s"
            onPointerDown={(e) => startInteraction(e, "resize-s")}
            onPointerMove={onPointerMove}
            onPointerUp={endInteraction}
            onPointerCancel={endInteraction}
            aria-label="Resize height"
          />
          <div
            className="fp-resize-se"
            onPointerDown={(e) => startInteraction(e, "resize-se")}
            onPointerMove={onPointerMove}
            onPointerUp={endInteraction}
            onPointerCancel={endInteraction}
            aria-label="Resize"
          >
            <i className="ph ph-arrows-out" aria-hidden="true"></i>
          </div>
        </>
      )}
    </div>
  );
}

function fitProportionalGeometry(g: Geometry, ratio: number, minW: number, minH: number, maxW: number, maxH: number): Geometry {
  const fitWidth = Math.min(g.width, maxW, maxH * ratio, window.innerWidth, (window.innerHeight - workspaceTop()) * ratio);
  return clampGeometry({ ...g, width: fitWidth, height: fitWidth / ratio }, minW, minH, maxW, maxH);
}
