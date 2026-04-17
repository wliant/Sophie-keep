import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { FloorPlan, Room, StorageLocation } from '@sophie/shared';
import { endpoints, qk } from '../api/endpoints';
import { ApiError } from '../api/client';
import { toast } from '../state/toast';
import { FloorPlanCanvas } from '../components/FloorPlanCanvas';
import { ShapeEditor } from '../components/ShapeEditor';
import { SelectInput } from '../components/form/FormField';
import { useEditSession } from '../state/edit-session';

type Mode = 'view' | 'edit';

export function FloorPlanPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('view');
  const [errors, setErrors] = useState<Array<{ op_index: number; message: string }>>([]);

  const plan = useQuery<FloorPlan>({ queryKey: qk.floorPlan, queryFn: endpoints.getFloorPlan });
  const rooms = useQuery<{ items: Room[] }>({ queryKey: qk.rooms, queryFn: endpoints.listRooms });
  const locs = useQuery<{ items: StorageLocation[] }>({
    queryKey: qk.locations,
    queryFn: () => endpoints.listLocations(),
  });

  const session = useEditSession({
    rooms: rooms.data?.items,
    locations: locs.data?.items,
    active: mode === 'edit',
  });

  const save = useMutation({
    mutationFn: () => endpoints.applyFloorPlanSession({ ops: session.toSessionOps() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.floorPlan });
      qc.invalidateQueries({ queryKey: qk.rooms });
      qc.invalidateQueries({ queryKey: qk.locations });
      setMode('view');
      setErrors([]);
      toast.success('Floor plan saved');
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError) {
        const ops = (e.extra as { op_errors?: Array<{ op_index: number; message: string }> })?.op_errors;
        if (ops) setErrors(ops);
        toast.error(e.message);
      } else {
        toast.error('Save failed');
      }
    },
  });

  const width = plan.data?.width ?? 1000;
  const height = plan.data?.height ?? 700;

  const rendered = {
    rooms:
      mode === 'edit'
        ? session.rooms
        : (rooms.data?.items ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            shape: toRect(r.shape_on_plan as Room['shape_on_plan']),
          })),
    locations:
      mode === 'edit'
        ? session.locations
        : (locs.data?.items ?? []).map((l) => ({
            id: l.id,
            name: l.name,
            room_id: l.room_id,
            shape: toRect(l.shape_on_plan as Room['shape_on_plan']),
          })),
  };

  const selectedRoom =
    session.selection?.kind === 'room'
      ? session.rooms.find((r) => r.id === session.selection!.id)
      : null;
  const selectedLoc =
    session.selection?.kind === 'loc'
      ? session.locations.find((l) => l.id === session.selection!.id)
      : null;

  const handleSelect = (kind: 'room' | 'loc', id: string) => {
    if (mode === 'view') {
      if (kind === 'loc') navigate(`/inventory?storage_location_id=${id}`);
      else navigate(`/inventory?room_id=${id}`);
    } else {
      session.setSelection({ kind, id });
    }
  };

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Floor plan</h2>
        <div className="row">
          {mode === 'view' ? (
            <button onClick={() => setMode('edit')}>Edit</button>
          ) : (
            <>
              <button onClick={session.addRoom}>+ Room</button>
              <button
                onClick={() => selectedRoom && session.addLocation(selectedRoom.id)}
                disabled={!selectedRoom}
              >
                + Location
              </button>
              <button
                onClick={() => {
                  setMode('view');
                  session.reset();
                  setErrors([]);
                }}
              >
                Discard
              </button>
              <button
                className="primary"
                onClick={() => save.mutate()}
                disabled={save.isPending}
              >
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

      <FloorPlanCanvas
        width={width}
        height={height}
        rooms={rendered.rooms}
        locations={rendered.locations}
        selection={session.selection}
        onSelect={handleSelect}
      />

      {mode === 'edit' && selectedRoom ? (
        <section className="card stack">
          <h3 style={{ margin: 0 }}>Room</h3>
          <ShapeEditor
            name={selectedRoom.name}
            shape={selectedRoom.shape}
            onName={(n) => session.updateRoom(selectedRoom.id, { name: n })}
            onShape={(s) => session.updateRoom(selectedRoom.id, { shape: s })}
          />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              className="danger"
              onClick={() => {
                if (!confirm('Delete this room?')) return;
                session.removeRoom(selectedRoom.id);
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
          <SelectInput
            label="Room"
            value={selectedLoc.room_id}
            onValue={(v) => session.updateLocation(selectedLoc.id, { room_id: v as string })}
            options={session.rooms.map((r) => ({ value: r.id, label: r.name }))}
          />
          <ShapeEditor
            name={selectedLoc.name}
            shape={selectedLoc.shape}
            onName={(n) => session.updateLocation(selectedLoc.id, { name: n })}
            onShape={(s) => session.updateLocation(selectedLoc.id, { shape: s })}
          />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              className="danger"
              onClick={() => {
                if (!confirm('Delete this location?')) return;
                session.removeLocation(selectedLoc.id);
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

function toRect(s: Room['shape_on_plan']): {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
} {
  if (s.type === 'rect') return s;
  const xs = s.points.map(([x]) => x);
  const ys = s.points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    type: 'rect',
    x: minX,
    y: minY,
    w: Math.max(10, maxX - minX),
    h: Math.max(10, maxY - minY),
  };
}
