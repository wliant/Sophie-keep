export interface RectShape {
  type: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PolygonShape {
  type: 'polygon';
  points: Array<[number, number]>;
}

export type Shape = RectShape | PolygonShape;

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boundsOf(shape: Shape): Bounds {
  if (shape.type === 'rect') {
    return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  }
  if (shape.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of shape.points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function validateShape(shape: unknown): { ok: true; shape: Shape } | { ok: false; error: string } {
  if (!shape || typeof shape !== 'object') return { ok: false, error: 'shape must be an object' };
  const s = shape as { type?: string };
  if (s.type === 'rect') {
    const r = shape as Partial<RectShape>;
    if (!isFiniteNumber(r.x) || !isFiniteNumber(r.y) || !isFiniteNumber(r.w) || !isFiniteNumber(r.h)) {
      return { ok: false, error: 'rect requires finite x, y, w, h' };
    }
    if (r.w <= 0 || r.h <= 0) return { ok: false, error: 'rect w and h must be > 0' };
    return { ok: true, shape: { type: 'rect', x: r.x!, y: r.y!, w: r.w!, h: r.h! } };
  }
  if (s.type === 'polygon') {
    const p = shape as Partial<PolygonShape>;
    if (!Array.isArray(p.points) || p.points.length < 3) {
      return { ok: false, error: 'polygon requires at least 3 points' };
    }
    for (const pt of p.points) {
      if (!Array.isArray(pt) || pt.length !== 2 || !isFiniteNumber(pt[0]) || !isFiniteNumber(pt[1])) {
        return { ok: false, error: 'polygon points must be [number, number]' };
      }
    }
    return { ok: true, shape: { type: 'polygon', points: p.points.map((pt) => [pt[0], pt[1]]) } };
  }
  return { ok: false, error: "shape.type must be 'rect' or 'polygon'" };
}

export function isPointInRect(x: number, y: number, r: RectShape, eps = 1e-6): boolean {
  return x >= r.x - eps && x <= r.x + r.w + eps && y >= r.y - eps && y <= r.y + r.h + eps;
}

export function isPointInPolygon(x: number, y: number, poly: PolygonShape): boolean {
  const pts = poly.points;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isPointInShape(x: number, y: number, s: Shape): boolean {
  return s.type === 'rect' ? isPointInRect(x, y, s) : isPointInPolygon(x, y, s);
}

function rectCorners(r: RectShape): Array<[number, number]> {
  return [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ];
}

function polygonPoints(s: Shape): Array<[number, number]> {
  return s.type === 'rect' ? rectCorners(s) : s.points;
}

export function isShapeInRectBounds(shape: Shape, bounds: RectShape, eps = 1e-6): boolean {
  for (const [x, y] of polygonPoints(shape)) {
    if (!isPointInRect(x, y, bounds, eps)) return false;
  }
  return true;
}

export function isShapeInShape(inner: Shape, outer: Shape, eps = 1e-6): boolean {
  if (outer.type === 'rect') return isShapeInRectBounds(inner, outer, eps);
  for (const [x, y] of polygonPoints(inner)) {
    if (!isPointInPolygon(x, y, outer)) return false;
  }
  return true;
}

export function isShapeInBounds(shape: Shape, width: number, height: number, eps = 1e-6): boolean {
  return isShapeInRectBounds(shape, { type: 'rect', x: 0, y: 0, w: width, h: height }, eps);
}

export function centerOfShape(shape: Shape): [number, number] {
  const b = boundsOf(shape);
  return [b.x + b.w / 2, b.y + b.h / 2];
}
