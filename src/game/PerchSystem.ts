/**
 * Perch-based movement system for bird character.
 * Loads perch points from JSON and provides nearest-perch lookups.
 */

export interface Perch {
  name: string;
  x: number;
  y: number;
  type: 'branch' | 'ground' | 'rock' | 'post';
}

export interface PerchData {
  scene: string;
  image_size: [number, number];
  perches: Perch[];
  ground_polygon: number[][];
}

export class PerchSystem {
  private perches: Perch[] = [];
  private imageW = 1280;
  private imageH = 720;

  /** Load perch data for a scene. Falls back to empty if not found. */
  async load(sceneName: string): Promise<void> {
    const slug = sceneName.replace(/_/g, '-');
    try {
      const resp = await fetch(`assets/perch-data/${slug}-perches.json`);
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data: PerchData = await resp.json();
      this.perches = data.perches;
      this.imageW = data.image_size[0];
      this.imageH = data.image_size[1];
    } catch {
      // No perch data — scenes will use ground-only movement
      this.perches = [];
    }
  }

  /** Get all perches. */
  getPerches(): Perch[] {
    return this.perches;
  }

  /** Find the nearest perch to a screen position. */
  nearest(x: number, y: number): Perch | null {
    if (this.perches.length === 0) return null;
    let best: Perch | null = null;
    let bestDist = Infinity;
    for (const p of this.perches) {
      const dx = p.x - x;
      const dy = p.y - y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
    return best;
  }

  /** Find the nearest perch within a max distance. */
  nearestWithin(x: number, y: number, maxDist: number): Perch | null {
    const p = this.nearest(x, y);
    if (!p) return null;
    const dx = p.x - x;
    const dy = p.y - y;
    if (Math.sqrt(dx * dx + dy * dy) <= maxDist) return p;
    return null;
  }

  /** Find the nearest perch to an NPC position. */
  nearestToNPC(npcX: number, npcY: number): Perch | null {
    // Prefer perches that are above and near the NPC (bird lands near to talk)
    if (this.perches.length === 0) return null;
    let best: Perch | null = null;
    let bestScore = Infinity;
    for (const p of this.perches) {
      const dx = p.x - npcX;
      const dy = p.y - npcY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Prefer perches within 200px, penalize being too far below NPC
      const yPenalty = p.y > npcY ? (p.y - npcY) * 0.5 : 0;
      const score = dist + yPenalty;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  /** Scale perch coordinates from source image size to game coordinates. */
  scaleToGame(perch: Perch, gameW = 1280, gameH = 720): { x: number; y: number } {
    return {
      x: (perch.x / this.imageW) * gameW,
      y: (perch.y / this.imageH) * gameH,
    };
  }
}
