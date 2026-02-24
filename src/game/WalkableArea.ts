export interface Point {
  x: number;
  y: number;
}

/** Look up entry position from entryPoints map. Falls back to "default". */
export function resolveEntryPoint(
  entryPoints: Record<string, number[]>,
  fromScene?: string,
): { x: number; y: number } {
  const pt = (fromScene && entryPoints[fromScene]) || entryPoints['default'];
  return { x: pt[0], y: pt[1] };
}

export class WalkableArea {
  private points: Point[];

  constructor(points: Point[]) {
    this.points = points;
  }

  getPolygon(): Point[] {
    return this.points;
  }

  /** Point-in-polygon test using ray casting algorithm. */
  contains(x: number, y: number): boolean {
    const pts = this.points;
    const n = pts.length;
    let inside = false;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[i].x, yi = pts[i].y;
      const xj = pts[j].x, yj = pts[j].y;

      if ((yi > y) !== (yj > y) &&
          x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }

    return inside;
  }

  /** Find the nearest point on the polygon boundary to (x, y). */
  clampToEdge(x: number, y: number): Point {
    const pts = this.points;
    const n = pts.length;
    let bestDist = Infinity;
    let best: Point = { x, y };

    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const closest = nearestPointOnSegment(x, y, a.x, a.y, b.x, b.y);
      const dx = x - closest.x;
      const dy = y - closest.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = closest;
      }
    }

    return best;
  }
}

/** Nearest point on line segment (ax,ay)-(bx,by) to point (px,py). */
function nearestPointOnSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): Point {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;

  if (len2 === 0) return { x: ax, y: ay };

  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));

  return {
    x: ax + t * abx,
    y: ay + t * aby,
  };
}
