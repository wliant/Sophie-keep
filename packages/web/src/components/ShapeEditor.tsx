import type { Shape, RectShape, PolygonShape } from '@sophie/shared';
import { NumberInput, TextInput } from './form/FormField';

export function ShapeEditor({
  name,
  shape,
  onName,
  onShape,
}: {
  name: string;
  shape: Shape;
  onName: (s: string) => void;
  onShape: (s: Shape) => void;
}) {
  return (
    <>
      <TextInput label="Name" value={name} maxLength={60} onValue={onName} />
      {shape.type === 'rect' ? (
        <RectShapeEditor shape={shape} onShape={onShape} />
      ) : (
        <PolygonShapeEditor shape={shape} onShape={onShape} />
      )}
    </>
  );
}

function RectShapeEditor({ shape, onShape }: { shape: RectShape; onShape: (s: Shape) => void }) {
  return (
    <div className="row">
      <div style={{ flex: 1 }}>
        <NumberInput label="X" value={shape.x} onValue={(v) => onShape({ ...shape, x: v ?? 0 })} />
      </div>
      <div style={{ flex: 1 }}>
        <NumberInput label="Y" value={shape.y} onValue={(v) => onShape({ ...shape, y: v ?? 0 })} />
      </div>
      <div style={{ flex: 1 }}>
        <NumberInput label="Width" value={shape.w} onValue={(v) => onShape({ ...shape, w: Math.max(1, v ?? 1) })} />
      </div>
      <div style={{ flex: 1 }}>
        <NumberInput label="Height" value={shape.h} onValue={(v) => onShape({ ...shape, h: Math.max(1, v ?? 1) })} />
      </div>
    </div>
  );
}

function PolygonShapeEditor({ shape, onShape }: { shape: PolygonShape; onShape: (s: Shape) => void }) {
  const updateVertex = (i: number, x: number, y: number) => {
    const pts = shape.points.map((pt, idx) =>
      idx === i ? [x, y] as [number, number] : pt,
    );
    onShape({ type: 'polygon', points: pts });
  };

  const deleteVertex = (i: number) => {
    if (shape.points.length <= 3) return;
    onShape({ type: 'polygon', points: shape.points.filter((_, idx) => idx !== i) });
  };

  const addVertex = () => {
    const last = shape.points[shape.points.length - 1] ?? [0, 0];
    onShape({ type: 'polygon', points: [...shape.points, [last[0] + 10, last[1] + 10]] });
  };

  return (
    <div className="stack">
      {shape.points.map(([px, py], i) => (
        <div key={i} className="row" style={{ alignItems: 'flex-end', gap: 4 }}>
          <div style={{ flex: 1 }}>
            <NumberInput
              label={`V${i + 1} X`}
              value={px}
              onValue={(v) => updateVertex(i, v ?? px, py)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <NumberInput
              label={`V${i + 1} Y`}
              value={py}
              onValue={(v) => updateVertex(i, px, v ?? py)}
            />
          </div>
          <button
            onClick={() => deleteVertex(i)}
            disabled={shape.points.length <= 3}
            title="Delete vertex"
            style={{ marginBottom: '2px' }}
          >
            ×
          </button>
        </div>
      ))}
      <div>
        <button onClick={addVertex}>+ Add vertex</button>
      </div>
    </div>
  );
}
