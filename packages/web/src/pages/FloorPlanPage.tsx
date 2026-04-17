import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { FloorPlan, Room, RectShape, Shape, StorageLocation } from '@sophie/shared';
import { boundsOf } from '@sophie/shared';
import { api, ApiError } from '../api/client';
import { toast } from '../state/toast';

type Mode = 'view' | 'edit';

interface EditRoom {
  id: string; // may be temp
  name: string;
  shape: RectShape;
  isNew?: boolean;
}

interface EditLoc {
  id: string;
  room_id: string;
  name: string;
  shape: RectShape;
  isNew?: boolean;
}

function toRect(s: Shape): RectShape {
  if (s.type === 'rect') return s;
  const b = boundsOf(s);
  return { type: 'rect', x: b.x, y: b.y, w: Math.max(10, b.w), h: Math.max(10, b.h) };
}

function tempId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2)}`;
}

export function FloorPlanPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const svgRef = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [editRooms, setEditRooms] = useState<EditRoom[]>([]);
  const [editLocs, setEditLocs] = useState<EditLoc[]>([]);
  const [removedRooms, setRemovedRooms] = useState<string[]>([]);
  const [removedLocs, setRemovedLocs] = useState<string[]>([]);
  const [selection, setSelection] = useState<{ kind: 'room' | 'loc'; id: string } | null>(null);
  const [errors, setErrors] = useState<Array<{ op_index: number; message: string }>>([]);

  const plan = useQuery<FloorPlan>({ queryKey: ['floor-plan'], queryFn: () => api.get('/api/v1/floor-plan') });
  const rooms = useQuery<{ items: Room[] }>({ queryKey: ['rooms'], queryFn: () => api.get('/api/v1/rooms') });
  const locs = useQuery<{ items: StorageLocation[] }>({
    queryKey: ['storage-locations'],
    queryFn: () => api.get('/api/v1/storage-locations'),
  });

  useEffect(() => {
    if (mode === 'edit' && rooms.data && locs.data) {
      setEditRooms(rooms.data.items.map((r) => ({ id: r.id, name: r.name, shape: toRect(r.shape_on_plan) })));
      setEditLocs(
        locs.data.items.map((l) => ({
          id: l.id,
          room_id: l.room_id,
          name: l.name,
          shape: toRect(l.shape_on_plan),
        })),
      );
      setRemovedRooms([]);
      setRemovedLocs([]);
      setErrors([]);
    }
  }, [mode, rooms.data, locs.data]);

  const save = useMutation({
    mutationFn: async () => {
      const ops: Array<Record<string, unknown>> = [];
      // delete ops first
      for (const id of removedLocs) ops.push({ op: 'delete_location', id });
      for (const id of removedRooms) ops.push({ op: 'delete_room', id });
      // create + update rooms
      for (const r of editRooms) {
        if (r.isNew) {
          ops.push({ op: 'create_room', temp_id: r.id, name: r.name, shape_on_plan: r.shape });
        } else {
          ops.push({ op: 'update_room', id: r.id, name: r.name, shape_on_plan: r.shape });
        }
      }
      for (const l of editLocs) {
        if (l.isNew) {
          ops.push({
            op: 'create_location',
            temp_id: l.id,
            name: l.name,
            room_id: l.room_id,
            shape_on_plan: l.shape,
          });
        } else {
          ops.push({
            op: 'update_location',
            id: l.id,
            name: l.name,
            room_id: l.room_id,
            shape_on_plan: l.shape,
          });
        }
      }
      return api.post('/api/v1/floor-plan/edit-session', { ops });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floor-plan'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['storage-locations'] });
      setMode('view');
      toast.success('Floor plan saved');
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError) {
        const ops = (e.extra as { op_errors?: Array<{ op_index: number; message: string }> })?.op_errors;
        if (ops) setErrors(ops);
        toast.error(e.message);
      } else toast.error('Save failed');
    },
  });

  const viewRooms = rooms.data?.items ?? [];
  const viewLocs = locs.data?.items ?? [];
  const renderRooms = mode === 'edit' ? editRooms : viewRooms.map((r) => ({ ...r, shape: toRect(r.shape_on_plan) }));
  const renderLocs = mode === 'edit' ? editLocs : viewLocs.map((l) => ({ ...l, shape: toRect(l.shape_on_plan) }));

  const width = plan.data?.width ?? 1000;
  const height = plan.data?.height ?? 700;

  const clickEntity = (kind: 'room' | 'loc', id: string) => {
    if (mode === 'view') {
      if (kind === 'loc') navigate(`/inventory?storage_location_id=${id}`);
      else navigate(`/inventory?room_id=${id}`);
    } else {
      setSelection({ kind, id });
    }
  };

  const addRoom = () => {
    const id = tempId('room');
    setEditRooms((prev) => [
      ...prev,
      {
        id,
        name: `Room ${prev.length + 1}`,
        shape: { type: 'rect', x: 20, y: 20, w: 200, h: 150 },
        isNew: true,
      },
    ]);
    setSelection({ kind: 'room', id });
  };

  const addLoc = (roomId: string) => {
    const id = tempId('loc');
    const room = editRooms.find((r) => r.id === roomId);
    const base = room?.shape ?? { type: 'rect', x: 30, y: 30, w: 80, h: 40 };
    setEditLocs((prev) => [
      ...prev,
      {
        id,
        room_id: roomId,
        name: `Location ${prev.length + 1}`,
        shape: {
          type: 'rect',
          x: base.x + 10,
          y: base.y + 10,
          w: Math.min(80, Math.max(20, base.w - 20)),
          h: Math.min(40, Math.max(20, base.h - 20)),
        },
        isNew: true,
      },
    ]);
    setSelection({ kind: 'loc', id });
  };

  const selectedRoom = selection?.kind === 'room' ? editRooms.find((r) => r.id === selection.id) : null;
  const selectedLoc = selection?.kind === 'loc' ? editLocs.find((l) => l.id === selection.id) : null;

  const updateRoom = (id: string, patch: Partial<EditRoom>) =>
    setEditRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const updateLoc = (id: string, patch: Partial<EditLoc>) =>
    setEditLocs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const pannable = useFloorPlanViewport(svgRef, width, height, mode === 'view');

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Floor plan</h2>
        <div className="row">
          {mode === 'view' ? (
            <button onClick={() => setMode('edit')}>Edit</button>
          ) : (
            <>
              <button onClick={addRoom}>+ Room</button>
              <button
                onClick={() => selectedRoom && addLoc(selectedRoom.id)}
                disabled={!selectedRoom}
              >
                + Location
              </button>
              <button
                onClick={() => {
                  setMode('view');
                  setSelection(null);
                }}
              >
                Discard
              </button>
              <button className="primary" onClick={() => save.mutate()} disabled={save.isPending}>
                Save
              </button>
            </>
          )}
        </div>
      </div>

      {errors.length ? (
        <div className="banner" role="alert">
          <strong>Save failed:</strong>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <svg
        ref={svgRef}
        className="floor-plan-svg"
        viewBox={`${pannable.vx} ${pannable.vy} ${pannable.vw} ${pannable.vh}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ aspectRatio: `${width} / ${height}`, maxHeight: 600 }}
        onWheel={pannable.onWheel}
        onPointerDown={pannable.onPointerDown}
        onPointerMove={pannable.onPointerMove}
        onPointerUp={pannable.onPointerUp}
      >
        <rect x={0} y={0} width={width} height={height} fill="var(--bg)" stroke="var(--border)" />
        {renderRooms.map((r) => (
          <g key={r.id}>
            <rect
              x={r.shape.x}
              y={r.shape.y}
              width={r.shape.w}
              height={r.shape.h}
              fill="var(--bg-muted)"
              stroke={selection?.kind === 'room' && selection.id === r.id ? 'var(--accent)' : 'var(--border-strong)'}
              strokeWidth={selection?.kind === 'room' && selection.id === r.id ? 3 : 1.5}
              onClick={() => clickEntity('room', r.id)}
              style={{ cursor: 'pointer' }}
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
        ))}
        {renderLocs.map((l) => (
          <g key={l.id}>
            <rect
              x={l.shape.x}
              y={l.shape.y}
              width={l.shape.w}
              height={l.shape.h}
              fill="rgba(37, 99, 235, 0.15)"
              stroke={selection?.kind === 'loc' && selection.id === l.id ? 'var(--accent)' : 'var(--accent)'}
              strokeWidth={selection?.kind === 'loc' && selection.id === l.id ? 3 : 1}
              onClick={() => clickEntity('loc', l.id)}
              style={{ cursor: 'pointer' }}
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
        ))}
      </svg>

      {mode === 'edit' && selectedRoom ? (
        <section className="card stack">
          <h3 style={{ margin: 0 }}>Room</h3>
          <ShapeEditor
            name={selectedRoom.name}
            shape={selectedRoom.shape}
            onName={(n) => updateRoom(selectedRoom.id, { name: n })}
            onShape={(s) => updateRoom(selectedRoom.id, { shape: s })}
          />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              className="danger"
              onClick={() => {
                if (!confirm('Delete this room?')) return;
                if (!selectedRoom.isNew) setRemovedRooms((prev) => [...prev, selectedRoom.id]);
                setEditRooms((prev) => prev.filter((r) => r.id !== selectedRoom.id));
                setSelection(null);
              }}
            >
              Delete room
            </button>
          </div>
        </section>
      ) : null}

      {mode === 'edit' && selectedLoc ? (
        <section className="card stack">
          <h3 style={{ margin: 0 }}>Storage location</h3>
          <div className="form-field">
            <label>Room</label>
            <select
              value={selectedLoc.room_id}
              onChange={(e) => updateLoc(selectedLoc.id, { room_id: e.target.value })}
            >
              {editRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <ShapeEditor
            name={selectedLoc.name}
            shape={selectedLoc.shape}
            onName={(n) => updateLoc(selectedLoc.id, { name: n })}
            onShape={(s) => updateLoc(selectedLoc.id, { shape: s })}
          />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              className="danger"
              onClick={() => {
                if (!confirm('Delete this location?')) return;
                if (!selectedLoc.isNew) setRemovedLocs((prev) => [...prev, selectedLoc.id]);
                setEditLocs((prev) => prev.filter((l) => l.id !== selectedLoc.id));
                setSelection(null);
              }}
            >
              Delete location
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ShapeEditor({
  name,
  shape,
  onName,
  onShape,
}: {
  name: string;
  shape: RectShape;
  onName: (s: string) => void;
  onShape: (s: RectShape) => void;
}) {
  return (
    <>
      <div className="form-field">
        <label>Name</label>
        <input value={name} maxLength={60} onChange={(e) => onName(e.target.value)} />
      </div>
      <div className="row">
        <div className="form-field" style={{ flex: 1 }}>
          <label>X</label>
          <input
            type="number"
            value={shape.x}
            onChange={(e) => onShape({ ...shape, x: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="form-field" style={{ flex: 1 }}>
          <label>Y</label>
          <input
            type="number"
            value={shape.y}
            onChange={(e) => onShape({ ...shape, y: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="form-field" style={{ flex: 1 }}>
          <label>Width</label>
          <input
            type="number"
            min={1}
            value={shape.w}
            onChange={(e) => onShape({ ...shape, w: Math.max(1, Number(e.target.value) || 1) })}
          />
        </div>
        <div className="form-field" style={{ flex: 1 }}>
          <label>Height</label>
          <input
            type="number"
            min={1}
            value={shape.h}
            onChange={(e) => onShape({ ...shape, h: Math.max(1, Number(e.target.value) || 1) })}
          />
        </div>
      </div>
    </>
  );
}

function useFloorPlanViewport(ref: React.RefObject<SVGSVGElement | null>, w: number, h: number, active: boolean) {
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
    const nextVw = Math.max(50, Math.min(w * 2, vw * factor));
    const nextVh = Math.max(50, Math.min(h * 2, vh * factor));
    setVw(nextVw);
    setVh(nextVh);
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
