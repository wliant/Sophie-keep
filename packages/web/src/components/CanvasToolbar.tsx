import type { CanvasToolMode } from './FloorPlanCanvas';

interface CanvasToolbarProps {
  toolMode: CanvasToolMode;
  drawTarget: 'room' | 'loc';
  drawLocDisabled?: boolean;
  onSelectTool: (mode: CanvasToolMode, target?: 'room' | 'loc') => void;
}

export function CanvasToolbar({ toolMode, drawTarget, drawLocDisabled, onSelectTool }: CanvasToolbarProps) {
  const btn = (
    mode: CanvasToolMode,
    label: string,
    target?: 'room' | 'loc',
    disabled?: boolean,
  ) => {
    const active = toolMode === mode && (!target || drawTarget === target);
    return (
      <button
        className={active ? 'primary' : undefined}
        onClick={() => onSelectTool(mode, target)}
        disabled={disabled}
        title={label}
        style={{ fontSize: '0.85rem' }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
      {btn('select', '↖ Select')}
      {btn('draw-rect', '▭ Room', 'room')}
      {btn('draw-rect', '▣ Location', 'loc', drawLocDisabled)}
      {btn('draw-polygon', '⬡ Polygon')}
      {btn('draw-door', '⌻ Door')}
      {btn('pan', '✋ Pan')}
    </div>
  );
}
