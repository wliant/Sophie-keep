import type { RectShape } from '@sophie/shared';
import { NumberInput, TextInput } from './form/FormField';

export function ShapeEditor({
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
      <TextInput label="Name" value={name} maxLength={60} onValue={onName} />
      <div className="row">
        <div style={{ flex: 1 }}>
          <NumberInput
            label="X"
            value={shape.x}
            onValue={(v) => onShape({ ...shape, x: v ?? 0 })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <NumberInput
            label="Y"
            value={shape.y}
            onValue={(v) => onShape({ ...shape, y: v ?? 0 })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <NumberInput
            label="Width"
            value={shape.w}
            onValue={(v) => onShape({ ...shape, w: Math.max(1, v ?? 1) })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <NumberInput
            label="Height"
            value={shape.h}
            onValue={(v) => onShape({ ...shape, h: Math.max(1, v ?? 1) })}
          />
        </div>
      </div>
    </>
  );
}
