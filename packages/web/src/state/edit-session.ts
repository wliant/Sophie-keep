import { useCallback, useEffect, useState } from 'react';
import type { FloorPlanEditOp, Room, StorageLocation, Shape } from '@sophie/shared';
import { boundsOf } from '@sophie/shared';

export interface EditRoom {
  id: string;
  name: string;
  shape: Shape;
  isNew?: boolean;
}

export interface EditLoc {
  id: string;
  room_id: string;
  name: string;
  shape: Shape;
  isNew?: boolean;
}

export type Selection = { kind: 'room' | 'loc'; id: string } | null;

function tempId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2)}`;
}

export interface UseEditSessionArgs {
  rooms?: Room[];
  locations?: StorageLocation[];
  active: boolean;
}

export interface UseEditSessionResult {
  rooms: EditRoom[];
  locations: EditLoc[];
  selection: Selection;
  setSelection: (s: Selection) => void;
  addRoom: () => string;
  addLocation: (roomId: string) => string;
  updateRoom: (id: string, patch: Partial<EditRoom>) => void;
  updateLocation: (id: string, patch: Partial<EditLoc>) => void;
  removeRoom: (id: string) => void;
  removeLocation: (id: string) => void;
  toSessionOps: () => FloorPlanEditOp[];
  reset: () => void;
}

// Hook: owns uncommitted floor-plan edits. Converts back to a batch of
// operations for the `/floor-plan/edit-session` endpoint on save.
export function useEditSession({
  rooms: initialRooms,
  locations: initialLocs,
  active,
}: UseEditSessionArgs): UseEditSessionResult {
  const [rooms, setRooms] = useState<EditRoom[]>([]);
  const [locations, setLocations] = useState<EditLoc[]>([]);
  const [removedRooms, setRemovedRooms] = useState<string[]>([]);
  const [removedLocs, setRemovedLocs] = useState<string[]>([]);
  const [selection, setSelection] = useState<Selection>(null);

  useEffect(() => {
    if (!active) return;
    setRooms(
      (initialRooms ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        shape: r.shape_on_plan,
      })),
    );
    setLocations(
      (initialLocs ?? []).map((l) => ({
        id: l.id,
        room_id: l.room_id,
        name: l.name,
        shape: l.shape_on_plan,
      })),
    );
    setRemovedRooms([]);
    setRemovedLocs([]);
  }, [active, initialRooms, initialLocs]);

  const addRoom = useCallback((): string => {
    const id = tempId('room');
    setRooms((prev) => [
      ...prev,
      {
        id,
        name: `Room ${prev.length + 1}`,
        shape: { type: 'rect', x: 20, y: 20, w: 200, h: 150 },
        isNew: true,
      },
    ]);
    setSelection({ kind: 'room', id });
    return id;
  }, []);

  const addLocation = useCallback(
    (roomId: string): string => {
      const id = tempId('loc');
      const room = rooms.find((r) => r.id === roomId);
      const b = room?.shape ? boundsOf(room.shape) : { x: 30, y: 30, w: 80, h: 40 };
      setLocations((prev) => [
        ...prev,
        {
          id,
          room_id: roomId,
          name: `Location ${prev.length + 1}`,
          shape: {
            type: 'rect',
            x: b.x + 10,
            y: b.y + 10,
            w: Math.min(80, Math.max(20, b.w - 20)),
            h: Math.min(40, Math.max(20, b.h - 20)),
          },
          isNew: true,
        },
      ]);
      setSelection({ kind: 'loc', id });
      return id;
    },
    [rooms],
  );

  const updateRoom = useCallback(
    (id: string, patch: Partial<EditRoom>) =>
      setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    [],
  );
  const updateLocation = useCallback(
    (id: string, patch: Partial<EditLoc>) =>
      setLocations((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l))),
    [],
  );

  const removeRoom = useCallback((id: string) => {
    setRooms((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target && !target.isNew) setRemovedRooms((rr) => [...rr, id]);
      return prev.filter((r) => r.id !== id);
    });
    setSelection(null);
  }, []);

  const removeLocation = useCallback((id: string) => {
    setLocations((prev) => {
      const target = prev.find((l) => l.id === id);
      if (target && !target.isNew) setRemovedLocs((rl) => [...rl, id]);
      return prev.filter((l) => l.id !== id);
    });
    setSelection(null);
  }, []);

  const toSessionOps = useCallback((): FloorPlanEditOp[] => {
    const ops: FloorPlanEditOp[] = [];
    // delete ops first so locations referencing a deleted room unblock in a
    // single batch; the server applies them atomically in order.
    for (const id of removedLocs) ops.push({ op: 'delete_location', id });
    for (const id of removedRooms) ops.push({ op: 'delete_room', id });
    for (const r of rooms) {
      if (r.isNew) {
        ops.push({ op: 'create_room', temp_id: r.id, name: r.name, shape_on_plan: r.shape });
      } else {
        ops.push({ op: 'update_room', id: r.id, name: r.name, shape_on_plan: r.shape });
      }
    }
    for (const l of locations) {
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
    return ops;
  }, [rooms, locations, removedRooms, removedLocs]);

  const reset = useCallback(() => {
    setRooms([]);
    setLocations([]);
    setRemovedRooms([]);
    setRemovedLocs([]);
    setSelection(null);
  }, []);

  return {
    rooms,
    locations,
    selection,
    setSelection,
    addRoom,
    addLocation,
    updateRoom,
    updateLocation,
    removeRoom,
    removeLocation,
    toSessionOps,
    reset,
  };
}
