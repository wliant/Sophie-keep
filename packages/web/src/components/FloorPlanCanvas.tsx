import { useMemo, useRef, useState } from 'react';
import type { RectShape } from '@sophie/shared';

export interface RenderRoom {
  id: string;
  name: string;
  shape: RectShape;
}

export interface RenderLocation {
  id: string;
  name: string;
  room_id: string;
  shape: RectShape;
}

export interface FloorPlanCanvasProps {
  width: number;
  height: number;
  rooms: RenderRoom[];
  locations: RenderLocation[];
  selection: { kind: 'room' | 'loc'; id: string } | null;
  onSelect?: (kind: 'room' | 'loc', id: string) => void;
  panZoomEnabled?: boolean;
  maxHeightPx?: number;
}

// SVG floor plan viewer. Owns only viewport (viewBox) state. Rendering,
// selection, and interactions are driven by props so the same component is
// reused for view and edit modes.
export function FloorPlanCanvas({
  width,
  height,
  rooms,
  locations,
  selection,
  onSelect,
  panZoomEnabled = true,
  maxHeightPx = 600,
}: FloorPlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewport = useViewport(svgRef, width, height, panZoomEnabled);

  return (
    <svg
      ref={svgRef}
      className="floor-plan-svg"
      viewBox={`${viewport.vx} ${viewport.vy} ${viewport.vw} ${viewport.vh}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ aspectRatio: `${width} / ${height}`, maxHeight: maxHeightPx }}
      onWheel={viewport.onWheel}
      onPointerDown={viewport.onPointerDown}
      onPointerMove={viewport.onPointerMove}
      onPointerUp={viewport.onPointerUp}
    >
      <rect x={0} y={0} width={width} height={height} fill="var(--bg)" stroke="var(--border)" />
      {rooms.map((r) => {
        const selected = selection?.kind === 'room' && selection.id === r.id;
        return (
          <g key={r.id}>
            <rect
              x={r.shape.x}
              y={r.shape.y}
              width={r.shape.w}
              height={r.shape.h}
              fill="var(--bg-muted)"
              stroke={selected ? 'var(--accent)' : 'var(--border-strong)'}
              strokeWidth={selected ? 3 : 1.5}
              onClick={() => onSelect?.('room', r.id)}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
            />
            <text
              x={r.shape.x + 6}
              y={r.shape.y + 18}
              fill="var(--fg)"
              fontSize={16}
              pointerEvents="none"
            >
              {r.name}
            </text>
          </g>
        );
      })}
      {locations.map((l) => {
        const selected = selection?.kind === 'loc' && selection.id === l.id;
        return (
          <g key={l.id}>
            <rect
              x={l.shape.x}
              y={l.shape.y}
              width={l.shape.w}
              height={l.shape.h}
              fill="rgba(37, 99, 235, 0.15)"
              stroke="var(--accent)"
              strokeWidth={selected ? 3 : 1}
              onClick={() => onSelect?.('loc', l.id)}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
            />
            <text
              x={l.shape.x + 4}
              y={l.shape.y + 14}
              fill="var(--fg)"
              fontSize={12}
              pointerEvents="none"
            >
              {l.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function useViewport(
  ref: React.RefObject<SVGSVGElement | null>,
  w: number,
  h: number,
  active: boolean,
) {
  const [vx, setVx] = useState(0);
  const [vy, setVy] = useState(0);
  const [vw, setVw] = useState(w);
  const [vh, setVh] = useState(h);
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  useMemo(() => {
    setVw(w);
    setVh(h);
  }, [w, h]);

  const onWheel = (e: React.WheelEvent) => {
    if (!active) return;
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    setVw((prev) => Math.max(50, Math.min(w * 2, prev * factor)));
    setVh((prev) => Math.max(50, Math.min(h * 2, prev * factor)));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!active) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, vx, vy };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dxRatio = (e.clientX - dragRef.current.x) / rect.width;
    const dyRatio = (e.clientY - dragRef.current.y) / rect.height;
    setVx(dragRef.current.vx - dxRatio * vw);
    setVy(dragRef.current.vy - dyRatio * vh);
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };
  return { vx, vy, vw, vh, onWheel, onPointerDown, onPointerMove, onPointerUp };
}
