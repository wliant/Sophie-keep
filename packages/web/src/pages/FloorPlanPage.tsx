import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { FloorPlan, Room, StorageLocation, Door, Shape, RectShape } from '@sophie/shared';
import { endpoints, qk } from '../api/endpoints';
import { ApiError } from '../api/client';
import { toast } from '../state/toast';
import { FloorPlanCanvas } from '../components/FloorPlanCanvas';
import type { CanvasToolMode } from '../components/FloorPlanCanvas';
import { CanvasToolbar } from '../components/CanvasToolbar';
import { ShapeEditor } from '../components/ShapeEditor';
import { SelectInput } from '../components/form/FormField';
import { useEditSession } from '../state/edit-session';

type Mode = 'view' | 'edit';

type PolygonDraft = { vertices: [number, number][] };

function generateDoorId(): string {
  return `door_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function FloorPlanPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('view');
  const [errors, setErrors] = useState<Array<{ op_index: number; message: string }>>([]);

  // Toolbar state
  const [toolMode, setToolMode] = useState<CanvasToolMode>('select');
  const [drawTarget, setDrawTarget] = useState<'room' | 'loc'>('room');
  const toolModeRef = useRef(toolMode);
  toolModeRef.current = toolMode;
  const prevToolModeRef = useRef<CanvasToolMode>('select');

  // Polygon draft state
  const [polygonDraft, setPolygonDraft] = useState<PolygonDraft | null>(null);

  // Door state (uncommitted edits)
  const [editDoors, setEditDoors] = useState<Door[]>([]);

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

  const bgPhotoId = plan.data?.background_image_photo_id ?? null;
  const backgroundImageUrl = bgPhotoId ? `/api/v1/photos/${bgPhotoId}` : null;

  const imageInputRef = useRef<HTMLInputElement>(null);

  const uploadBg = useMutation({
    mutationFn: async (files: FileList) => {
      const { items } = await endpoints.uploadPhotos('floor_plan', 'singleton', files);
      const photo = items[0];
      if (!photo) throw new Error('Upload failed');

      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const url = URL.createObjectURL(files[0]);
        const img = new Image();
        img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
        img.onerror = reject;
        img.src = url;
      });

      const hasShapes =
        (rooms.data?.items.length ?? 0) > 0 || (locs.data?.items.length ?? 0) > 0;
    return endpoints.patchFloorPlan({
        background_image_photo_id: photo.id,
        ...(!hasShapes ? { width: dims.w, height: dims.h } : {}),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.floorPlan });
      toast.success('Floor plan image updated');
    },
    onError: () => toast.error('Image upload failed'),
  });

  const removeBg = useMutation({
    mutationFn: () => endpoints.patchFloorPlan({ background_image_photo_id: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.floorPlan });
      toast.success('Background image removed');
    },
    onError: () => toast.error('Remove failed'),
  });

  // Space-bar temporary pan
  useEffect(() => {
    if (mode !== 'edit') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        prevToolModeRef.current = toolModeRef.current;
        setToolMode('pan');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setToolMode(prevToolModeRef.current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [mode]);

  const save = useMutation({
    mutationFn: () =>
      endpoints.applyFloorPlanSession({
        ops: session.toSessionOps(),
        plan: { doors: editDoors },
      }),
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
            shape: r.shape_on_plan,
          })),
    locations:
      mode === 'edit'
        ? session.locations
        : (locs.data?.items ?? []).map((l) => ({
            id: l.id,
            name: l.name,
            room_id: l.room_id,
            shape: l.shape_on_plan,
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

  const handleEnterEditMode = () => {
    setEditDoors(plan.data?.doors ?? []);
    setToolMode('select');
    setPolygonDraft(null);
    setMode('edit');
  };

  const handleDiscard = () => {
    setMode('view');
    session.reset();
    setErrors([]);
    setEditDoors([]);
    setPolygonDraft(null);
    setToolMode('select');
  };

  const handleSelectTool = (newMode: CanvasToolMode, target?: 'room' | 'loc') => {
    if (newMode === 'draw-polygon') {
      setPolygonDraft({ vertices: [] });
    } else {
      setPolygonDraft(null);
    }
    setToolMode(newMode);
    if (target) setDrawTarget(target);
  };

  const handleRectDraw = (shape: RectShape) => {
    if (drawTarget === 'room') {
      const id = session.addRoom();
      session.updateRoom(id, { shape });
      setToolMode('select');
    } else if (drawTarget === 'loc') {
      const roomId = session.selection?.kind === 'room' ? session.selection.id : null;
      if (roomId) {
        const id = session.addLocation(roomId);
        session.updateLocation(id, { shape });
        setToolMode('select');
      }
    }
  };

  const handleShapeMove = (kind: 'room' | 'loc', id: string, newShape: Shape) => {
    if (kind === 'room') session.updateRoom(id, { shape: newShape });
    else session.updateLocation(id, { shape: newShape });
  };

  const handleShapeResize = (kind: 'room' | 'loc', id: string, newShape: Shape) => {
    if (kind === 'room') session.updateRoom(id, { shape: newShape });
    else session.updateLocation(id, { shape: newShape });
  };

  const handlePolygonClick = (fp: [number, number]) => {
    setPolygonDraft((prev) => ({
      vertices: [...(prev?.vertices ?? []), fp],
    }));
  };

  const handlePolygonClose = () => {
    const vertices = polygonDraft?.vertices ?? [];
    if (vertices.length < 3) return;
    const id = session.addRoom();
    session.updateRoom(id, { shape: { type: 'polygon', points: vertices } });
    setPolygonDraft(null);
    setToolMode('select');
  };

  const handleDoorPlace = (door: Omit<Door, 'id'>) => {
    setEditDoors((prev) => [...prev, { ...door, id: generateDoorId() }]);
  };

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Floor plan</h2>
        <div className="row">
          {mode === 'view' ? (
            <button onClick={handleEnterEditMode}>Edit</button>
          ) : (
            <>
              <button onClick={handleDiscard}>Discard</button>
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

      {mode === 'edit' && (
        <CanvasToolbar
          toolMode={toolMode}
          drawTarget={drawTarget}
          drawLocDisabled={!selectedRoom}
          onSelectTool={handleSelectTool}
        />
      )}

      {/* Hidden file input */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files?.length) uploadBg.mutate(e.target.files); e.target.value = ''; }}
      />

      {mode === 'edit' && (
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Background:</span>
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={uploadBg.isPending}
          >
            {backgroundImageUrl ? 'Change image' : 'Upload image'}
          </button>
          {backgroundImageUrl && (
            <button onClick={() => removeBg.mutate()} disabled={removeBg.isPending}>
              Remove
            </button>
          )}
        </div>
      )}

      {mode === 'view' && !backgroundImageUrl && (
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
          No floor plan image. Click <strong>Edit</strong> to upload one.
        </p>
      )}

      <FloorPlanCanvas
        width={width}
        height={height}
        rooms={rendered.rooms}
        locations={rendered.locations}
        selection={session.selection}
        onSelect={handleSelect}
        onDeselect={mode === 'edit' ? () => session.setSelection(null) : undefined}
        doors={mode === 'edit' ? editDoors : (plan.data?.doors ?? [])}
        toolMode={mode === 'edit' ? toolMode : 'select'}
        polygonDraft={mode === 'edit' ? polygonDraft : null}
        onShapeMove={mode === 'edit' ? handleShapeMove : undefined}
        onShapeResize={mode === 'edit' ? handleShapeResize : undefined}
        onRectDraw={mode === 'edit' ? handleRectDraw : undefined}
        onPolygonClick={mode === 'edit' ? handlePolygonClick : undefined}
        onPolygonClose={mode === 'edit' ? handlePolygonClose : undefined}
        onDoorPlace={mode === 'edit' ? handleDoorPlace : undefined}
        backgroundImageUrl={backgroundImageUrl}
      />

      {mode === 'edit' && (
        <div className="row" style={{ gap: 8 }}>
          <button onClick={session.addRoom}>+ Room</button>
          <button
            onClick={() => selectedRoom && session.addLocation(selectedRoom.id)}
            disabled={!selectedRoom}
          >
            + Location
          </button>
        </div>
      )}

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
