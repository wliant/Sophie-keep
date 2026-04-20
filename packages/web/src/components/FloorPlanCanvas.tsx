import { useMemo, useRef, useState } from 'react';
import type { RectShape, PolygonShape, Shape } from '@sophie/shared';
import { centerOfShape, isPointInShape } from '@sophie/shared';
import type { Door } from '@sophie/shared';

export type CanvasToolMode = 'select' | 'draw-rect' | 'draw-polygon' | 'draw-door' | 'pan';

export interface RenderRoom {
  id: string;
  name: string;
  shape: Shape;
}

export interface RenderLocation {
  id: string;
  name: string;
  room_id: string;
  shape: Shape;
}

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type HandleHit =
  | { kind: 'rect-handle'; itemKind: 'room' | 'loc'; id: string; handle: HandleId; shape: RectShape }
  | { kind: 'vtx'; itemKind: 'room' | 'loc'; id: string; vtxIdx: number; shape: PolygonShape };

type DragState =
  | { kind: 'pan'; startClient: [number, number]; startVp: [number, number] }
  | { kind: 'draw-rect'; startFp: [number, number]; currentFp: [number, number]; startClient: [number, number] }
  | { kind: 'move'; itemKind: 'room' | 'loc'; id: string; startFp: [number, number]; startShape: Shape; startClient: [number, number] }
  | { kind: 'resize'; itemKind: 'room' | 'loc'; id: string; handle: HandleId; startFp: [number, number]; startShape: RectShape; startClient: [number, number] }
  | { kind: 'resize-vtx'; itemKind: 'room' | 'loc'; id: string; vtxIdx: number; startFp: [number, number]; startShape: PolygonShape; startClient: [number, number] };

export interface FloorPlanCanvasProps {
  width: number;
  height: number;
  rooms: RenderRoom[];
  locations: RenderLocation[];
  selection: { kind: 'room' | 'loc'; id: string } | null;
  onSelect?: (kind: 'room' | 'loc', id: string) => void;
  onDeselect?: () => void;
  panZoomEnabled?: boolean;
  maxHeightPx?: number;
  // Interactive editing props
  toolMode?: CanvasToolMode;
  doors?: Door[];
  polygonDraft?: { vertices: [number, number][] } | null;
  onShapeMove?: (kind: 'room' | 'loc', id: string, newShape: Shape) => void;
  onShapeResize?: (kind: 'room' | 'loc', id: string, newShape: Shape) => void;
  onRectDraw?: (shape: RectShape) => void;
  onPolygonClick?: (fp: [number, number]) => void;
  onPolygonClose?: () => void;
  onDoorPlace?: (door: Omit<Door, 'id'>) => void;
  backgroundImageUrl?: string | null;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

function clientToFP(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  vx: number,
  vy: number,
  vw: number,
  vh: number,
): [number, number] {
  const rect = svg.getBoundingClientRect();
  const scale = Math.min(rect.width / vw, rect.height / vh);
  const offsetX = (rect.width  - vw * scale) / 2;
  const offsetY = (rect.height - vh * scale) / 2;
  return [
    vx + (clientX - rect.left - offsetX) / scale,
    vy + (clientY - rect.top  - offsetY) / scale,
  ];
}

function rectHandlePos(shape: RectShape, handle: HandleId): [number, number] {
  const { x, y, w, h } = shape;
  switch (handle) {
    case 'nw': return [x, y];
    case 'n':  return [x + w / 2, y];
    case 'ne': return [x + w, y];
    case 'e':  return [x + w, y + h / 2];
    case 'se': return [x + w, y + h];
    case 's':  return [x + w / 2, y + h];
    case 'sw': return [x, y + h];
    case 'w':  return [x, y + h / 2];
  }
}

function applyRectResize(startShape: RectShape, handle: HandleId, dx: number, dy: number): RectShape {
  let { x, y, w, h } = startShape;
  switch (handle) {
    case 'nw': x += dx; y += dy; w -= dx; h -= dy; break;
    case 'n':             y += dy;          h -= dy; break;
    case 'ne':            y += dy; w += dx; h -= dy; break;
    case 'e':                      w += dx;          break;
    case 'se':                     w += dx; h += dy; break;
    case 's':                               h += dy; break;
    case 'sw': x += dx;            w -= dx; h += dy; break;
    case 'w':  x += dx;            w -= dx;          break;
  }
  return { type: 'rect', x, y, w: Math.max(10, w), h: Math.max(10, h) };
}

function doorArcPath(room: RenderRoom, door: Door): { arc: string; leaf: string } | null {
  if (room.shape.type !== 'rect') return null;
  const { x: rx, y: ry, w: rw, h: rh } = room.shape;
  const { wall, t, width } = door;
  switch (wall) {
    case 'north': {
      const hx = rx + t * rw, hy = ry;
      return {
        arc:  `M ${hx + width} ${hy} A ${width} ${width} 0 0 0 ${hx} ${hy + width}`,
        leaf: `M ${hx} ${hy} L ${hx} ${hy + width}`,
      };
    }
    case 'south': {
      const hx = rx + t * rw, hy = ry + rh;
      return {
        arc:  `M ${hx + width} ${hy} A ${width} ${width} 0 0 1 ${hx} ${hy - width}`,
        leaf: `M ${hx} ${hy} L ${hx} ${hy - width}`,
      };
    }
    case 'east': {
      const hx = rx + rw, hy = ry + t * rh;
      return {
        arc:  `M ${hx} ${hy + width} A ${width} ${width} 0 0 1 ${hx - width} ${hy}`,
        leaf: `M ${hx} ${hy} L ${hx - width} ${hy}`,
      };
    }
    case 'west': {
      const hx = rx, hy = ry + t * rh;
      return {
        arc:  `M ${hx} ${hy + width} A ${width} ${width} 0 0 0 ${hx + width} ${hy}`,
        leaf: `M ${hx} ${hy} L ${hx + width} ${hy}`,
      };
    }
  }
}

function handleCursor(handle: HandleId): string {
  switch (handle) {
    case 'nw': case 'se': return 'nwse-resize';
    case 'ne': case 'sw': return 'nesw-resize';
    case 'n':  case 's':  return 'ns-resize';
    case 'e':  case 'w':  return 'ew-resize';
  }
}

const RECT_HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const SNAP_PX = 20;
const DEFAULT_DOOR_WIDTH = 40;
const MIN_DRAW_SIZE = 10;

// ─── Component ───────────────────────────────────────────────────────────────

export function FloorPlanCanvas({
  width,
  height,
  rooms,
  locations,
  selection,
  onSelect,
  onDeselect,
  panZoomEnabled = true,
  maxHeightPx = 600,
  toolMode = 'select',
  doors = [],
  polygonDraft,
  onShapeMove,
  onShapeResize,
  onRectDraw,
  onPolygonClick,
  onPolygonClose,
  onDoorPlace,
  backgroundImageUrl,
}: FloorPlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { vx, vy, vw, vh, setVx, setVy, setVw, setVh, onWheel } = useViewport(width, height);

  const dragRef = useRef<DragState | null>(null);
  const clickTrackRef = useRef<[number, number] | null>(null);
  const activePointersRef = useRef<Map<number, [number, number]>>(new Map());
  const pinchRef = useRef<{ dist: number } | null>(null);

  const [drawPreview, setDrawPreview] = useState<RectShape | null>(null);
  const [cursorFp, setCursorFp] = useState<[number, number] | null>(null);
  const [activeDragCursor, setActiveDragCursor] = useState<string | null>(null);

  // Compute handle radius in floor-plan units (constant pixel size at any zoom)
  const handleR = (() => {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return Math.max(3, 5 * vw / 800);
    const scale = Math.min(rect.width / vw, rect.height / vh);
    return Math.max(3, 5 / scale);
  })();

  const selectedItem = selection
    ? selection.kind === 'room'
      ? rooms.find((r) => r.id === selection.id)
      : locations.find((l) => l.id === selection.id)
    : undefined;

  function fpFromEvent(e: React.PointerEvent): [number, number] {
    return clientToFP(e.clientX, e.clientY, svgRef.current!, vx, vy, vw, vh);
  }

  function hitHandle(fp: [number, number]): HandleHit | null {
    if (!selection || !selectedItem) return null;
    const shape = selectedItem.shape;
    const hitR = handleR * 2;
    const hitR2 = hitR * hitR;

    if (shape.type === 'rect') {
      for (const handle of RECT_HANDLES) {
        const [hx, hy] = rectHandlePos(shape, handle);
        if ((fp[0] - hx) ** 2 + (fp[1] - hy) ** 2 <= hitR2) {
          return { kind: 'rect-handle', itemKind: selection.kind, id: selection.id, handle, shape };
        }
      }
    } else {
      for (let i = 0; i < shape.points.length; i++) {
        const [px, py] = shape.points[i]!;
        if ((fp[0] - px) ** 2 + (fp[1] - py) ** 2 <= hitR2) {
          return { kind: 'vtx', itemKind: selection.kind, id: selection.id, vtxIdx: i, shape };
        }
      }
    }
    return null;
  }

  function hitShape(fp: [number, number]): { kind: 'room' | 'loc'; id: string; shape: Shape } | null {
    // Locations are rendered on top, check them first (reversed for top-most)
    for (let i = locations.length - 1; i >= 0; i--) {
      const loc = locations[i]!;
      if (isPointInShape(fp[0], fp[1], loc.shape)) {
        return { kind: 'loc', id: loc.id, shape: loc.shape };
      }
    }
    for (let i = rooms.length - 1; i >= 0; i--) {
      const room = rooms[i]!;
      if (isPointInShape(fp[0], fp[1], room.shape)) {
        return { kind: 'room', id: room.id, shape: room.shape };
      }
    }
    return null;
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;

    activePointersRef.current.set(e.pointerId, [e.clientX, e.clientY]);

    // Two-finger pinch zoom
    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dx = pts[0]![0] - pts[1]![0];
      const dy = pts[0]![1] - pts[1]![1];
      pinchRef.current = { dist: Math.sqrt(dx * dx + dy * dy) };
      return;
    }

    if (!e.isPrimary) return;

    svg.setPointerCapture(e.pointerId);
    clickTrackRef.current = [e.clientX, e.clientY];

    const fp = fpFromEvent(e);
    const startClient: [number, number] = [e.clientX, e.clientY];

    if (toolMode === 'select') {
      // 1. Handle hit → resize
      const handleHit = hitHandle(fp);
      if (handleHit) {
        if (handleHit.kind === 'rect-handle') {
          dragRef.current = {
            kind: 'resize',
            itemKind: handleHit.itemKind,
            id: handleHit.id,
            handle: handleHit.handle,
            startFp: fp,
            startShape: handleHit.shape,
            startClient,
          };
          setActiveDragCursor(handleCursor(handleHit.handle));
        } else {
          dragRef.current = {
            kind: 'resize-vtx',
            itemKind: handleHit.itemKind,
            id: handleHit.id,
            vtxIdx: handleHit.vtxIdx,
            startFp: fp,
            startShape: handleHit.shape,
            startClient,
          };
          setActiveDragCursor('move');
        }
        return;
      }

      // 2. Shape hit → select + move (if editing)
      const shapeHit = hitShape(fp);
      if (shapeHit) {
        onSelect?.(shapeHit.kind, shapeHit.id);
        if (onShapeMove) {
          dragRef.current = {
            kind: 'move',
            itemKind: shapeHit.kind,
            id: shapeHit.id,
            startFp: fp,
            startShape: shapeHit.shape,
            startClient,
          };
          setActiveDragCursor('grabbing');
        } else if (panZoomEnabled) {
          dragRef.current = { kind: 'pan', startClient, startVp: [vx, vy] };
          setActiveDragCursor('grabbing');
        }
        return;
      }

      // 3. Empty area → pan
      if (panZoomEnabled) {
        dragRef.current = { kind: 'pan', startClient, startVp: [vx, vy] };
        setActiveDragCursor('grabbing');
      }
    } else if (toolMode === 'draw-rect') {
      dragRef.current = { kind: 'draw-rect', startFp: fp, currentFp: fp, startClient };
      setActiveDragCursor('crosshair');
    } else if (toolMode === 'pan' && panZoomEnabled) {
      dragRef.current = { kind: 'pan', startClient, startVp: [vx, vy] };
      setActiveDragCursor('grabbing');
    }
    // draw-polygon and draw-door: no drag, clicks handled in onPointerUp
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;

    // Update pinch state for non-primary pointers
    if (!e.isPrimary) {
      activePointersRef.current.set(e.pointerId, [e.clientX, e.clientY]);
      if (activePointersRef.current.size === 2 && pinchRef.current && panZoomEnabled) {
        const pts = Array.from(activePointersRef.current.values());
        const dx = pts[0]![0] - pts[1]![0];
        const dy = pts[0]![1] - pts[1]![1];
        const newDist = Math.sqrt(dx * dx + dy * dy);
        const ratio = pinchRef.current.dist / newDist;
        setVw((prev) => Math.max(50, Math.min(width * 2, prev * ratio)));
        setVh((prev) => Math.max(50, Math.min(height * 2, prev * ratio)));
        pinchRef.current = { dist: newDist };
      }
      return;
    }

    const fp = fpFromEvent(e);

    // Update rubber-band cursor for polygon mode
    if (toolMode === 'draw-polygon' || toolMode === 'draw-door') {
      setCursorFp(fp);
    }

    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === 'pan') {
      const svgRect = svg.getBoundingClientRect();
      const scale = Math.min(svgRect.width / vw, svgRect.height / vh);
      setVx(drag.startVp[0] - (e.clientX - drag.startClient[0]) / scale);
      setVy(drag.startVp[1] - (e.clientY - drag.startClient[1]) / scale);
    } else if (drag.kind === 'draw-rect') {
      drag.currentFp = fp;
      const x = Math.min(drag.startFp[0], fp[0]);
      const y = Math.min(drag.startFp[1], fp[1]);
      const w = Math.abs(fp[0] - drag.startFp[0]);
      const h = Math.abs(fp[1] - drag.startFp[1]);
      setDrawPreview({ type: 'rect', x, y, w: Math.max(1, w), h: Math.max(1, h) });
    } else if (drag.kind === 'move') {
      const dx = fp[0] - drag.startFp[0];
      const dy = fp[1] - drag.startFp[1];
      let newShape: Shape;
      if (drag.startShape.type === 'rect') {
        newShape = { ...drag.startShape, x: drag.startShape.x + dx, y: drag.startShape.y + dy };
      } else {
        newShape = {
          type: 'polygon',
          points: drag.startShape.points.map(([px, py]) => [px + dx, py + dy] as [number, number]),
        };
      }
      onShapeMove?.(drag.itemKind, drag.id, newShape);
    } else if (drag.kind === 'resize') {
      const dx = fp[0] - drag.startFp[0];
      const dy = fp[1] - drag.startFp[1];
      onShapeResize?.(drag.itemKind, drag.id, applyRectResize(drag.startShape, drag.handle, dx, dy));
    } else if (drag.kind === 'resize-vtx') {
      const newPoints = drag.startShape.points.map((pt, i) =>
        i === drag.vtxIdx ? [fp[0], fp[1]] as [number, number] : pt,
      );
      onShapeResize?.(drag.itemKind, drag.id, { type: 'polygon', points: newPoints });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) pinchRef.current = null;

    if (!e.isPrimary) return;

    const startClient = clickTrackRef.current;
    clickTrackRef.current = null;

    const fp = fpFromEvent(e);
    const isClick = startClient !== null
      ? Math.sqrt((e.clientX - startClient[0]) ** 2 + (e.clientY - startClient[1]) ** 2) < 5
      : false;

    const drag = dragRef.current;
    setActiveDragCursor(null);

    // Commit draw-rect
    if (drag?.kind === 'draw-rect' && drawPreview) {
      if (drawPreview.w >= MIN_DRAW_SIZE && drawPreview.h >= MIN_DRAW_SIZE) {
        onRectDraw?.(drawPreview);
      }
      setDrawPreview(null);
      dragRef.current = null;
      return;
    }

    dragRef.current = null;

    if (!isClick) return;

    // ── Click-mode actions ──
    if (toolMode === 'draw-polygon') {
      const vertices = polygonDraft?.vertices ?? [];
      if (vertices.length >= 3) {
        const [fx, fy] = vertices[0]!;
        const rect = svgRef.current!.getBoundingClientRect();
        const scale = Math.min(rect.width / vw, rect.height / vh);
        const snapFP = SNAP_PX / scale;
        if (Math.sqrt((fp[0] - fx) ** 2 + (fp[1] - fy) ** 2) <= snapFP) {
          onPolygonClose?.();
          return;
        }
      }
      onPolygonClick?.(fp);
    } else if (toolMode === 'draw-door') {
      const rect = svgRef.current!.getBoundingClientRect();
      const scale = Math.min(rect.width / vw, rect.height / vh);
      const snapFP = SNAP_PX / scale;
      let bestRoom: RenderRoom | null = null;
      let bestWall: Door['wall'] = 'north';
      let bestT = 0;
      let bestDist = Infinity;

      for (const room of rooms) {
        if (room.shape.type !== 'rect') continue;
        const { x: rx, y: ry, w: rw, h: rh } = room.shape;
        const checks: Array<[Door['wall'], number, number, number]> = [
          ['north', Math.abs(fp[1] - ry),        (fp[0] - rx) / rw, rw],
          ['south', Math.abs(fp[1] - (ry + rh)), (fp[0] - rx) / rw, rw],
          ['east',  Math.abs(fp[0] - (rx + rw)), (fp[1] - ry) / rh, rh],
          ['west',  Math.abs(fp[0] - rx),         (fp[1] - ry) / rh, rh],
        ];
        for (const [wall, dist, rawT, wallLen] of checks) {
          if (dist < bestDist) {
            bestDist = dist;
            bestRoom = room;
            bestWall = wall;
            const maxT = 1 - DEFAULT_DOOR_WIDTH / wallLen;
            bestT = Math.max(0, Math.min(maxT, rawT));
          }
        }
      }

      if (bestRoom && bestDist <= snapFP) {
        onDoorPlace?.({ room_id: bestRoom.id, wall: bestWall, t: bestT, width: DEFAULT_DOOR_WIDTH });
      }
    } else if (toolMode === 'select' && drag?.kind === 'pan') {
      onDeselect?.();
    }
  };

  const cursor =
    activeDragCursor ??
    (toolMode === 'draw-rect' || toolMode === 'draw-polygon' || toolMode === 'draw-door'
      ? 'crosshair'
      : toolMode === 'pan'
      ? 'grab'
      : 'default');

  return (
    <svg
      ref={svgRef}
      className="floor-plan-svg"
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ aspectRatio: `${width} / ${height}`, maxHeight: maxHeightPx, cursor, touchAction: 'none' }}

      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Layer 1: Plan background */}
      {backgroundImageUrl ? (
        <>
          <image
            href={backgroundImageUrl}
            x={0} y={0} width={width} height={height}
            preserveAspectRatio="none"
          />
          <rect x={0} y={0} width={width} height={height} fill="none" stroke="var(--border)" strokeWidth={1} />
        </>
      ) : (
        <rect x={0} y={0} width={width} height={height} fill="var(--bg)" stroke="var(--border)" />
      )}

      {/* Layer 3: Room shapes */}
      {rooms.map((r) => {
        const selected = selection?.kind === 'room' && selection.id === r.id;
        const [cx, cy] = centerOfShape(r.shape);
        const shapeCursor = toolMode === 'select' && onShapeMove ? 'grab' : onSelect ? 'pointer' : 'default';
        return (
          <g key={r.id}>
            {r.shape.type === 'rect' ? (
              <rect
                x={r.shape.x} y={r.shape.y} width={r.shape.w} height={r.shape.h}
                fill="var(--bg-muted)"
                stroke={selected ? 'var(--accent)' : 'var(--border-strong)'}
                strokeWidth={selected ? 3 : 1.5}
                style={{ cursor: shapeCursor }}
              />
            ) : (
              <polygon
                points={r.shape.points.map(([x, y]) => `${x},${y}`).join(' ')}
                fill="var(--bg-muted)"
                stroke={selected ? 'var(--accent)' : 'var(--border-strong)'}
                strokeWidth={selected ? 3 : 1.5}
                style={{ cursor: shapeCursor }}
              />
            )}
            <text
              x={r.shape.type === 'rect' ? r.shape.x + 6 : cx}
              y={r.shape.type === 'rect' ? r.shape.y + 18 : cy}
              fill="var(--fg)" fontSize={16} pointerEvents="none"
            >
              {r.name}
            </text>
          </g>
        );
      })}

      {/* Layer 4: Location shapes */}
      {locations.map((l) => {
        const selected = selection?.kind === 'loc' && selection.id === l.id;
        const [cx, cy] = centerOfShape(l.shape);
        const shapeCursor = toolMode === 'select' && onShapeMove ? 'grab' : onSelect ? 'pointer' : 'default';
        return (
          <g key={l.id}>
            {l.shape.type === 'rect' ? (
              <rect
                x={l.shape.x} y={l.shape.y} width={l.shape.w} height={l.shape.h}
                fill="rgba(37, 99, 235, 0.15)"
                stroke="var(--accent)"
                strokeWidth={selected ? 3 : 1}
                style={{ cursor: shapeCursor }}
              />
            ) : (
              <polygon
                points={l.shape.points.map(([x, y]) => `${x},${y}`).join(' ')}
                fill="rgba(37, 99, 235, 0.15)"
                stroke="var(--accent)"
                strokeWidth={selected ? 3 : 1}
                style={{ cursor: shapeCursor }}
              />
            )}
            <text
              x={l.shape.type === 'rect' ? l.shape.x + 4 : cx}
              y={l.shape.type === 'rect' ? l.shape.y + 14 : cy}
              fill="var(--fg)" fontSize={12} pointerEvents="none"
            >
              {l.name}
            </text>
          </g>
        );
      })}

      {/* Layer 5: Door arc markers */}
      {doors.map((door) => {
        const room = rooms.find((r) => r.id === door.room_id);
        if (!room) return null;
        const paths = doorArcPath(room, door);
        if (!paths) return null;
        return (
          <g key={door.id}>
            <path d={paths.arc}  fill="none" stroke="var(--fg)" strokeWidth={1} />
            <path d={paths.leaf} fill="none" stroke="var(--fg)" strokeWidth={1.5} />
          </g>
        );
      })}

      {/* Layer 6: Resize / vertex handles for selected item */}
      {selectedItem && (
        <g>
          {selectedItem.shape.type === 'rect'
            ? RECT_HANDLES.map((handle) => {
                const [hx, hy] = rectHandlePos(selectedItem.shape as RectShape, handle);
                return (
                  <g key={handle} style={{ cursor: handleCursor(handle) }}>
                    <circle cx={hx} cy={hy} r={handleR * 2} opacity={0} />
                    <circle cx={hx} cy={hy} r={handleR} fill="white" stroke="var(--accent)" strokeWidth={1.5} />
                  </g>
                );
              })
            : (selectedItem.shape as PolygonShape).points.map(([px, py], i) => (
                <g key={i} style={{ cursor: 'move' }}>
                  <circle cx={px} cy={py} r={handleR * 2} opacity={0} />
                  <circle cx={px} cy={py} r={handleR} fill="white" stroke="var(--accent)" strokeWidth={1.5} />
                </g>
              ))}
        </g>
      )}

      {/* Layer 7: Draw-rect ghost preview */}
      {drawPreview && (
        <rect
          x={drawPreview.x} y={drawPreview.y} width={drawPreview.w} height={drawPreview.h}
          fill="rgba(37, 99, 235, 0.08)"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeDasharray="6 3"
        />
      )}

      {/* Layer 8: Polygon draft */}
      {polygonDraft && polygonDraft.vertices.length > 0 && (
        <g>
          {polygonDraft.vertices.length > 1 && (
            <polyline
              points={polygonDraft.vertices.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeDasharray="4 2"
            />
          )}
          {cursorFp && polygonDraft.vertices.length > 0 && (
            <line
              x1={polygonDraft.vertices[polygonDraft.vertices.length - 1]![0]}
              y1={polygonDraft.vertices[polygonDraft.vertices.length - 1]![1]}
              x2={cursorFp[0]}
              y2={cursorFp[1]}
              stroke="var(--accent)"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              strokeOpacity={0.7}
            />
          )}
          {polygonDraft.vertices.map(([vx2, vy2], i) => (
            <circle
              key={i}
              cx={vx2} cy={vy2}
              r={i === 0 ? handleR * 1.8 : handleR}
              fill={i === 0 ? 'var(--accent)' : 'white'}
              stroke="var(--accent)"
              strokeWidth={1.5}
            />
          ))}
        </g>
      )}
    </svg>
  );
}

// ─── Viewport hook ────────────────────────────────────────────────────────────

function useViewport(w: number, h: number) {
  const [vx, setVx] = useState(0);
  const [vy, setVy] = useState(0);
  const [vw, setVw] = useState(w);
  const [vh, setVh] = useState(h);

  useMemo(() => {
    setVw(w);
    setVh(h);
  }, [w, h]);

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    setVw((prev) => Math.max(50, Math.min(w * 2, prev * factor)));
    setVh((prev) => Math.max(50, Math.min(h * 2, prev * factor)));
  };

  return { vx, vy, vw, vh, setVx, setVy, setVw, setVh, onWheel };
}
