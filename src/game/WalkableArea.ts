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

/** Point-in-polygon test using ray casting algorithm. */
function pointInPolygon(x: number, y: number, pts: Point[]): boolean {
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

/** Find the nearest point on a polygon boundary to (px, py). */
function nearestPointOnPolygon(px: number, py: number, pts: Point[]): Point {
  const n = pts.length;
  let bestDist = Infinity;
  let best: Point = { x: px, y: py };

  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const closest = nearestPointOnSegment(px, py, a.x, a.y, b.x, b.y);
    const dx = px - closest.x;
    const dy = py - closest.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = closest;
    }
  }

  return best;
}

export class WalkableArea {
  private points: Point[];
  private obstacles: Point[][];

  constructor(points: Point[], obstacles: Point[][] = []) {
    this.points = points;
    this.obstacles = obstacles;
  }

  getPolygon(): Point[] {
    return this.points;
  }

  getObstacles(): Point[][] {
    return this.obstacles;
  }

  /** Point must be inside outer polygon AND outside all obstacle polygons. */
  contains(x: number, y: number): boolean {
    if (!pointInPolygon(x, y, this.points)) return false;
    for (const obs of this.obstacles) {
      if (pointInPolygon(x, y, obs)) return false;
    }
    return true;
  }

  /** Find the nearest valid point on a boundary.
   *  - If outside outer polygon -> clamp to outer boundary.
   *  - If inside an obstacle -> clamp to that obstacle's boundary.
   */
  clampToEdge(x: number, y: number): Point {
    if (!pointInPolygon(x, y, this.points)) {
      return nearestPointOnPolygon(x, y, this.points);
    }
    for (const obs of this.obstacles) {
      if (pointInPolygon(x, y, obs)) {
        return nearestPointOnPolygon(x, y, obs);
      }
    }
    // Already valid — shouldn't normally be called, but return the point.
    return { x, y };
  }
}
