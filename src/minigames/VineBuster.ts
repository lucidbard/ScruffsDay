import { Scene } from '../game/Scene';
import { Assets, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import { Easing } from '../game/Tween';

interface VinePoint {
  x: number;
  y: number;
}

interface Vine {
  graphics: Graphics;
  isInvasive: boolean;
  path: VinePoint[]; // world-space points from spawn (root) toward tree (tip)
  growthProgress: number; // 0-1, how far along the path the vine has grown
  growthRate: number; // progress per second
  alive: boolean;
  lastDrawnSegments: number;
  stemColor: number;
  leafColor: number;
}

interface CutPiece {
  container: Container;
  vx: number;
  vy: number;
  gravity: number;
  rotationSpeed: number;
}

interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

const TRAIL_LIFETIME = 0.25;
const VINE_HIT_RADIUS = 20; // distance from a vine path point to count as a hit
const PATH_SEGMENTS = 28;
const LEAF_INTERVAL = 4; // place a leaf every N segments

export class VineBuster extends Scene {
  private vines: Vine[] = [];
  private cutPieces: CutPiece[] = [];
  private score = 0;
  private round = 1;
  private roundTimer = 30;
  private gameActive = false;
  private treeCenter = { x: 640, y: 360 };
  private scoreText!: Text;
  private timerText!: Text;
  private roundText!: Text;
  private spawnInterval = 1.5;
  private spawnTimer = 0;
  onComplete?: () => void;

  // Swipe state
  private isSwiping = false;
  private swipeTrail: TrailPoint[] = [];
  private trailGraphics!: Graphics;
  private lastSwipePoint: { x: number; y: number } | null = null;

  // Layers
  private vineLayer!: Container;
  private pieceLayer!: Container;

  async setup(): Promise<void> {
    // Sky background
    const bg = new Graphics();
    bg.rect(0, 0, 1280, 720);
    bg.fill({ color: 0x87ceeb });
    this.container.addChild(bg);

    // Ground
    const ground = new Graphics();
    ground.rect(0, 500, 1280, 220);
    ground.fill({ color: 0xd2b48c });
    this.container.addChild(ground);

    // Sand pine tree sprite
    try {
      const treeTex = await Assets.load('assets/minigames/sand-pine-tree.png');
      const tree = new Sprite(treeTex);
      tree.anchor.set(0.5, 1);
      tree.position.set(640, 520);
      const treeScale = 420 / treeTex.height;
      tree.scale.set(treeScale);
      this.container.addChild(tree);
    } catch {
      // Fallback: simple procedural tree
      const trunk = new Graphics();
      trunk.rect(610, 250, 60, 300);
      trunk.fill({ color: 0x8b6914 });
      this.container.addChild(trunk);
      const canopy = new Graphics();
      canopy.circle(640, 220, 120);
      canopy.fill({ color: 0x2e8b57 });
      this.container.addChild(canopy);
    }

    // Vine layer (between tree and UI)
    this.vineLayer = new Container();
    this.container.addChild(this.vineLayer);

    // Cut piece layer (above vines)
    this.pieceLayer = new Container();
    this.container.addChild(this.pieceLayer);

    // Trail graphics (above everything gameplay)
    this.trailGraphics = new Graphics();
    this.container.addChild(this.trailGraphics);

    // Instructions overlay
    const instrOverlay = new Container();
    const instrBg = new Graphics();
    instrBg.roundRect(200, 150, 880, 400, 20);
    instrBg.fill({ color: 0xfff8dc });
    instrBg.stroke({ width: 4, color: 0x3e2723 });
    instrOverlay.addChild(instrBg);

    const instrTitle = new Text({
      text: 'Vine Buster!',
      style: new TextStyle({
        fontSize: 40,
        fill: '#2E8B57',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    instrTitle.anchor.set(0.5, 0);
    instrTitle.position.set(640, 170);
    instrOverlay.addChild(instrTitle);

    const instrText = new Text({
      text:
        'Swipe through the invasive air potato vines (dark green, heart leaves) to cut them!\n\n' +
        'But be careful - do NOT swipe the native grape vines (light green, round leaves).\n\n' +
        'Invasive vine cut: +10 points\n' +
        'Native vine cut: -5 points\n' +
        'Vine reaches tree: -10 points\n\n' +
        '3 rounds of 30 seconds. Score above 0 to win!',
      style: new TextStyle({
        fontSize: 22,
        fill: '#3E2723',
        wordWrap: true,
        wordWrapWidth: 820,
        lineHeight: 30,
        fontFamily: 'Arial, sans-serif',
      }),
    });
    instrText.position.set(230, 230);
    instrOverlay.addChild(instrText);

    const tapStart = new Text({
      text: 'Tap to start!',
      style: new TextStyle({
        fontSize: 24,
        fill: '#4169E1',
        fontWeight: 'bold',
        fontStyle: 'italic',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    tapStart.anchor.set(0.5, 0);
    tapStart.position.set(640, 500);
    instrOverlay.addChild(tapStart);

    instrBg.eventMode = 'static';
    instrBg.on('pointertap', () => {
      this.container.removeChild(instrOverlay);
      this.gameActive = true;
    });

    // Score display
    this.scoreText = new Text({
      text: 'Score: 0',
      style: new TextStyle({
        fontSize: 28,
        fill: '#3E2723',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    this.scoreText.position.set(20, 20);

    this.timerText = new Text({
      text: 'Time: 30',
      style: new TextStyle({
        fontSize: 28,
        fill: '#3E2723',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    this.timerText.position.set(20, 55);

    this.roundText = new Text({
      text: 'Round 1 of 3',
      style: new TextStyle({
        fontSize: 24,
        fill: '#4169E1',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    this.roundText.position.set(1060, 20);

    this.container.addChild(this.scoreText, this.timerText, this.roundText);

    // Swipe input
    bg.eventMode = 'static';
    ground.eventMode = 'static';
    bg.on('pointerdown', (e) => this.onSwipeStart(e));
    bg.on('pointermove', (e) => this.onSwipeMove(e));
    bg.on('pointerup', () => this.onSwipeEnd());
    bg.on('pointerupoutside', () => this.onSwipeEnd());
    ground.on('pointerdown', (e) => this.onSwipeStart(e));
    ground.on('pointermove', (e) => this.onSwipeMove(e));
    ground.on('pointerup', () => this.onSwipeEnd());
    ground.on('pointerupoutside', () => this.onSwipeEnd());

    // Instructions on top
    this.container.addChild(instrOverlay);
  }

  enter(): void {
    this.score = 0;
    this.round = 1;
    this.gameActive = false;
    this.roundTimer = 30;
    this.spawnTimer = 0;
    this.spawnInterval = 1.5;
    this.vines = [];
    this.cutPieces = [];
    this.isSwiping = false;
    this.swipeTrail = [];
    this.lastSwipePoint = null;
    this.updateUI();
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;

    // Trail fade
    for (const pt of this.swipeTrail) pt.age += dt;
    this.swipeTrail = this.swipeTrail.filter((pt) => pt.age < TRAIL_LIFETIME);
    this.drawTrail();

    // Cut piece physics
    this.updateCutPieces(dt);

    if (!this.gameActive) return;

    // Timer
    this.roundTimer -= dt;
    if (this.roundTimer <= 0) {
      this.endRound();
      return;
    }

    // Spawn vines
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnVine();
      this.spawnTimer = this.spawnInterval;
    }

    // Grow vines and check tree collision
    for (const vine of this.vines) {
      if (!vine.alive) continue;

      vine.growthProgress = Math.min(1, vine.growthProgress + vine.growthRate * dt);

      // Redraw if new segments appeared
      const grownCount = this.getGrownCount(vine);
      if (grownCount !== vine.lastDrawnSegments) {
        this.drawVineGraphics(vine);
        vine.lastDrawnSegments = grownCount;
      }

      // Check if tip reached tree
      if (grownCount >= 2) {
        const tip = vine.path[grownCount - 1];
        const dx = tip.x - this.treeCenter.x;
        const dy = tip.y - this.treeCenter.y;
        if (Math.sqrt(dx * dx + dy * dy) < 80) {
          this.score -= 10;
          vine.alive = false;
          vine.graphics.visible = false;
          this.updateUI();
        }
      }
    }

    // Remove dead vines
    this.vines = this.vines.filter((v) => v.alive || v.graphics.visible);

    this.updateUI();
  }

  // ─── Path generation ───────────────────────────────

  private generateVinePath(startX: number, startY: number, endX: number, endY: number): VinePoint[] {
    const points: VinePoint[] = [];

    // Quadratic bezier with a random perpendicular control point for natural curve
    const mx = (startX + endX) / 2;
    const my = (startY + endY) / 2;
    const dx = endX - startX;
    const dy = endY - startY;
    const len = Math.sqrt(dx * dx + dy * dy);
    // Perpendicular direction
    const perpX = len > 0 ? -dy / len : 0;
    const perpY = len > 0 ? dx / len : 1;
    const curveOffset = (Math.random() - 0.5) * 250;
    const cx = mx + perpX * curveOffset;
    const cy = my + perpY * curveOffset;

    for (let i = 0; i <= PATH_SEGMENTS; i++) {
      const t = i / PATH_SEGMENTS;
      // Quadratic bezier
      const bx = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * cx + t * t * endX;
      const by = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * cy + t * t * endY;
      // Small organic wobble
      const wobble = 6;
      points.push({
        x: bx + (Math.random() - 0.5) * wobble,
        y: by + (Math.random() - 0.5) * wobble,
      });
    }

    return points;
  }

  // ─── Vine drawing ──────────────────────────────────

  private getGrownCount(vine: Vine): number {
    return Math.max(1, Math.floor(vine.growthProgress * vine.path.length));
  }

  private drawVineGraphics(vine: Vine): void {
    const g = vine.graphics;
    const count = this.getGrownCount(vine);
    g.clear();

    if (count < 2) return;

    // Draw stem - thick base stroke
    g.moveTo(vine.path[0].x, vine.path[0].y);
    for (let i = 1; i < count; i++) {
      g.lineTo(vine.path[i].x, vine.path[i].y);
    }
    g.stroke({ width: 5, color: vine.stemColor, alpha: 0.9 });

    // Thinner highlight on top
    g.moveTo(vine.path[0].x, vine.path[0].y);
    for (let i = 1; i < count; i++) {
      g.lineTo(vine.path[i].x, vine.path[i].y);
    }
    g.stroke({ width: 2, color: vine.stemColor, alpha: 0.4 });

    // Draw leaves at intervals
    for (let i = LEAF_INTERVAL; i < count; i += LEAF_INTERVAL) {
      this.drawLeaf(g, vine, i);
    }

    // Small tendril curl at the tip
    if (count >= 3) {
      const tip = vine.path[count - 1];
      const prev = vine.path[count - 2];
      const dx = tip.x - prev.x;
      const dy = tip.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 1) {
        const nx = dx / len;
        const ny = dy / len;
        // Spiral curl
        const curlX = tip.x + nx * 8;
        const curlY = tip.y + ny * 8;
        g.moveTo(tip.x, tip.y);
        g.quadraticCurveTo(
          curlX + ny * 10, curlY - nx * 10,
          curlX - ny * 4, curlY + nx * 4,
        );
        g.stroke({ width: 2, color: vine.stemColor, alpha: 0.7 });
      }
    }
  }

  private drawLeaf(g: Graphics, vine: Vine, index: number): void {
    const p = vine.path[index];
    const prev = vine.path[index - 1];
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) return;

    // Alternate leaf side
    const side = (index / LEAF_INTERVAL) % 2 === 0 ? 1 : -1;
    const perpX = (-dy / len) * side;
    const perpY = (dx / len) * side;
    const leafBase = { x: p.x + perpX * 4, y: p.y + perpY * 4 };

    if (vine.isInvasive) {
      // Heart-shaped leaf (air potato characteristic)
      const lx = leafBase.x + perpX * 8;
      const ly = leafBase.y + perpY * 8;
      g.moveTo(lx, ly - 4);
      g.bezierCurveTo(lx - 7, ly - 12, lx - 12, ly - 2, lx, ly + 6);
      g.moveTo(lx, ly - 4);
      g.bezierCurveTo(lx + 7, ly - 12, lx + 12, ly - 2, lx, ly + 6);
      g.fill({ color: vine.leafColor });
      g.stroke({ width: 1, color: 0x003300, alpha: 0.6 });
    } else {
      // Round grape leaf
      const lx = leafBase.x + perpX * 9;
      const ly = leafBase.y + perpY * 9;
      g.circle(lx, ly, 7);
      g.fill({ color: vine.leafColor });
      g.stroke({ width: 1, color: 0x006400, alpha: 0.5 });
      // Leaf vein
      g.moveTo(lx - 4, ly);
      g.lineTo(lx + 4, ly);
      g.moveTo(lx, ly - 4);
      g.lineTo(lx, ly + 4);
      g.stroke({ width: 0.8, color: 0x006400, alpha: 0.3 });
    }

    // Small stem connecting leaf to vine
    g.moveTo(p.x, p.y);
    g.lineTo(leafBase.x, leafBase.y);
    g.stroke({ width: 1.5, color: vine.stemColor, alpha: 0.6 });
  }

  /** Draw a partial vine (for cut pieces) into a Graphics, returning the bounding center. */
  private drawVineSlice(
    g: Graphics, path: VinePoint[], stemColor: number, leafColor: number, isInvasive: boolean,
  ): { cx: number; cy: number } {
    if (path.length < 2) {
      return { cx: path[0]?.x ?? 0, cy: path[0]?.y ?? 0 };
    }

    // Stem
    g.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      g.lineTo(path[i].x, path[i].y);
    }
    g.stroke({ width: 5, color: stemColor, alpha: 0.9 });

    // Leaves
    for (let i = LEAF_INTERVAL; i < path.length; i += LEAF_INTERVAL) {
      const p = path[i];
      const prev = path[i - 1];
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.5) continue;

      const side = (i / LEAF_INTERVAL) % 2 === 0 ? 1 : -1;
      const perpX = (-dy / len) * side;
      const perpY = (dx / len) * side;

      if (isInvasive) {
        const lx = p.x + perpX * 12;
        const ly = p.y + perpY * 12;
        g.moveTo(lx, ly - 4);
        g.bezierCurveTo(lx - 7, ly - 12, lx - 12, ly - 2, lx, ly + 6);
        g.moveTo(lx, ly - 4);
        g.bezierCurveTo(lx + 7, ly - 12, lx + 12, ly - 2, lx, ly + 6);
        g.fill({ color: leafColor });
      } else {
        const lx = p.x + perpX * 13;
        const ly = p.y + perpY * 13;
        g.circle(lx, ly, 7);
        g.fill({ color: leafColor });
      }
    }

    // Compute center for pivot
    let cx = 0, cy = 0;
    for (const p of path) { cx += p.x; cy += p.y; }
    cx /= path.length;
    cy /= path.length;
    return { cx, cy };
  }

  // ─── Vine spawning ────────────────────────────────

  private spawnVine(): void {
    const isInvasive = Math.random() > 0.3;
    const side = Math.floor(Math.random() * 4);

    let startX: number, startY: number;
    switch (side) {
      case 0:
        startX = 100 + Math.random() * 1080;
        startY = -20;
        break;
      case 1:
        startX = 1300;
        startY = 100 + Math.random() * 400;
        break;
      case 2:
        startX = 100 + Math.random() * 1080;
        startY = 540;
        break;
      default:
        startX = -20;
        startY = 100 + Math.random() * 400;
        break;
    }

    const targetX = this.treeCenter.x + (Math.random() - 0.5) * 80;
    const targetY = this.treeCenter.y + (Math.random() - 0.5) * 80;
    const path = this.generateVinePath(startX, startY, targetX, targetY);

    const stemColor = isInvasive ? 0x2d5a1e : 0x6b8e5a;
    const leafColor = isInvasive ? 0x004400 : 0x90ee90;

    const graphics = new Graphics();
    this.vineLayer.addChild(graphics);

    const baseSpeed = 0.08 + (this.round - 1) * 0.02;
    const vine: Vine = {
      graphics,
      isInvasive,
      path,
      growthProgress: 0,
      growthRate: baseSpeed + Math.random() * 0.03,
      alive: true,
      lastDrawnSegments: 0,
      stemColor,
      leafColor,
    };

    this.vines.push(vine);
  }

  // ─── Swipe handling ────────────────────────────────

  private onSwipeStart(e: { getLocalPosition: (target: Container) => { x: number; y: number } }): void {
    if (!this.gameActive) return;
    const pos = e.getLocalPosition(this.container);
    this.isSwiping = true;
    this.lastSwipePoint = { x: pos.x, y: pos.y };
    this.swipeTrail.push({ x: pos.x, y: pos.y, age: 0 });
  }

  private onSwipeMove(e: { getLocalPosition: (target: Container) => { x: number; y: number } }): void {
    if (!this.isSwiping || !this.gameActive) return;
    const pos = e.getLocalPosition(this.container);
    const prev = this.lastSwipePoint;

    this.swipeTrail.push({ x: pos.x, y: pos.y, age: 0 });
    this.lastSwipePoint = { x: pos.x, y: pos.y };

    if (prev) {
      this.checkSwipeCuts(prev.x, prev.y, pos.x, pos.y);
    }
  }

  private onSwipeEnd(): void {
    this.isSwiping = false;
    this.lastSwipePoint = null;
  }

  /** Check swipe line against each grown segment point of every vine. */
  private checkSwipeCuts(x1: number, y1: number, x2: number, y2: number): void {
    for (const vine of this.vines) {
      if (!vine.alive) continue;
      const count = this.getGrownCount(vine);

      for (let i = 0; i < count; i++) {
        const p = vine.path[i];
        if (this.pointToSegmentDist(p.x, p.y, x1, y1, x2, y2) < VINE_HIT_RADIUS) {
          this.cutVine(vine, i);
          break;
        }
      }
    }
  }

  /** Distance from point (px,py) to line segment (x1,y1)-(x2,y2). */
  private pointToSegmentDist(
    px: number, py: number, x1: number, y1: number, x2: number, y2: number,
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      const ex = px - x1;
      const ey = py - y1;
      return Math.sqrt(ex * ex + ey * ey);
    }
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    const ex = px - closestX;
    const ey = py - closestY;
    return Math.sqrt(ex * ex + ey * ey);
  }

  // ─── Cutting ───────────────────────────────────────

  private cutVine(vine: Vine, cutIndex: number): void {
    vine.alive = false;
    vine.graphics.visible = false;

    if (vine.isInvasive) {
      this.score += 10;
    } else {
      this.score -= 5;
    }

    const count = this.getGrownCount(vine);
    const cutPoint = vine.path[Math.min(cutIndex, count - 1)];

    // Create two halves from the grown portion
    const rootPath = vine.path.slice(0, cutIndex + 1);
    const tipPath = vine.path.slice(cutIndex, count);

    if (rootPath.length >= 2) {
      this.spawnCutPiece(rootPath, vine, cutPoint, -1);
    }
    if (tipPath.length >= 2) {
      this.spawnCutPiece(tipPath, vine, cutPoint, 1);
    }

    this.updateUI();
  }

  private spawnCutPiece(
    path: VinePoint[], vine: Vine, cutPoint: VinePoint, direction: number,
  ): void {
    const container = new Container();
    const g = new Graphics();

    // Draw vine slice at world coords, then offset the container
    const { cx, cy } = this.drawVineSlice(g, path, vine.stemColor, vine.leafColor, vine.isInvasive);

    // Set pivot to center of the slice so it rotates naturally
    container.pivot.set(cx, cy);
    container.position.set(cx, cy);
    container.addChild(g);
    this.pieceLayer.addChild(container);

    // Velocity: fling outward from cut point
    const angle = Math.atan2(cy - cutPoint.y, cx - cutPoint.x) + (Math.random() - 0.5) * 0.5;
    const speed = 120 + Math.random() * 80;

    this.cutPieces.push({
      container,
      vx: Math.cos(angle) * speed * direction,
      vy: -100 - Math.random() * 60, // initial upward fling
      gravity: 500,
      rotationSpeed: (Math.random() - 0.5) * 6,
    });
  }

  private updateCutPieces(dt: number): void {
    const toRemove: number[] = [];
    for (let i = 0; i < this.cutPieces.length; i++) {
      const piece = this.cutPieces[i];
      piece.vy += piece.gravity * dt;
      piece.container.position.x += piece.vx * dt;
      piece.container.position.y += piece.vy * dt;
      piece.container.rotation += piece.rotationSpeed * dt;

      // Fade out as it falls
      if (piece.container.position.y > 600) {
        piece.container.alpha -= dt * 3;
      }

      // Remove when off-screen or fully faded
      if (piece.container.position.y > 900 || piece.container.alpha <= 0) {
        this.pieceLayer.removeChild(piece.container);
        toRemove.push(i);
      }
    }
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.cutPieces.splice(toRemove[i], 1);
    }
  }

  // ─── Trail rendering ──────────────────────────────

  private drawTrail(): void {
    this.trailGraphics.clear();
    if (this.swipeTrail.length < 2) return;

    for (let i = 1; i < this.swipeTrail.length; i++) {
      const prev = this.swipeTrail[i - 1];
      const curr = this.swipeTrail[i];
      const alpha = 1 - curr.age / TRAIL_LIFETIME;
      const width = 6 * alpha;
      if (alpha <= 0 || width < 0.5) continue;

      this.trailGraphics.moveTo(prev.x, prev.y);
      this.trailGraphics.lineTo(curr.x, curr.y);
      this.trailGraphics.stroke({ width, color: 0xffffff, alpha });
    }
  }

  // ─── Round / game flow ─────────────────────────────

  private endRound(): void {
    this.gameActive = false;

    for (const vine of this.vines) {
      vine.alive = false;
      vine.graphics.visible = false;
    }
    this.vines = [];

    if (this.round < 3) {
      this.showFactPopup();
    } else {
      this.showResult();
    }
  }

  private showFactPopup(): void {
    const facts = [
      'Did you know? Air potato is an invasive vine from Asia that can grow 8 inches per day!',
      'Did you know? Native grape vines provide food for birds and small mammals!',
      'Did you know? Sand pines are specially adapted to Florida\'s dry, sandy soil!',
    ];
    const fact = facts[this.round - 1] || facts[0];

    const overlay = new Container();
    const bg = new Graphics();
    bg.roundRect(200, 200, 880, 300, 20);
    bg.fill({ color: 0xfff8dc });
    bg.stroke({ width: 4, color: 0x3e2723 });
    overlay.addChild(bg);

    const text = new Text({
      text: fact,
      style: new TextStyle({
        fontSize: 24,
        fill: '#3E2723',
        wordWrap: true,
        wordWrapWidth: 820,
        lineHeight: 32,
        fontFamily: 'Arial, sans-serif',
      }),
    });
    text.position.set(230, 230);
    overlay.addChild(text);

    const tapText = new Text({
      text: 'Tap to continue...',
      style: new TextStyle({
        fontSize: 18,
        fill: '#999999',
        fontStyle: 'italic',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    tapText.position.set(500, 440);
    overlay.addChild(tapText);

    bg.eventMode = 'static';
    bg.on('pointertap', () => {
      this.container.removeChild(overlay);
      this.round++;
      this.roundTimer = 30;
      this.spawnTimer = 0;
      this.spawnInterval = Math.max(0.5, this.spawnInterval - 0.3);
      this.gameActive = true;
      this.updateUI();
    });

    this.container.addChild(overlay);
  }

  private showResult(): void {
    const won = this.score > 0;
    const overlay = new Container();
    const bg = new Graphics();
    bg.roundRect(300, 200, 680, 300, 20);
    bg.fill({ color: 0xfff8dc });
    bg.stroke({ width: 4, color: 0x3e2723 });
    overlay.addChild(bg);

    const title = new Text({
      text: won ? 'Great job!' : 'Nice try!',
      style: new TextStyle({
        fontSize: 36,
        fill: won ? '#2E8B57' : '#CD853F',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    title.anchor.set(0.5, 0);
    title.position.set(640, 230);
    overlay.addChild(title);

    const scoreDisplay = new Text({
      text: `Final Score: ${this.score}`,
      style: new TextStyle({
        fontSize: 28,
        fill: '#3E2723',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    scoreDisplay.anchor.set(0.5, 0);
    scoreDisplay.position.set(640, 290);
    overlay.addChild(scoreDisplay);

    const message = new Text({
      text: won
        ? 'You saved the sand pine! Flicker is so grateful!'
        : 'The tree survived! Let\'s head back.',
      style: new TextStyle({
        fontSize: 22,
        fill: '#3E2723',
        wordWrap: true,
        wordWrapWidth: 600,
        fontFamily: 'Arial, sans-serif',
      }),
    });
    message.anchor.set(0.5, 0);
    message.position.set(640, 340);
    overlay.addChild(message);

    const tapText = new Text({
      text: 'Tap to continue...',
      style: new TextStyle({
        fontSize: 18,
        fill: '#999999',
        fontStyle: 'italic',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    tapText.anchor.set(0.5, 0);
    tapText.position.set(640, 420);
    overlay.addChild(tapText);

    bg.eventMode = 'static';
    bg.on('pointertap', () => {
      this.container.removeChild(overlay);
      this.gameState.setFlag('vine_buster_complete');
      this.onComplete?.();
    });

    this.container.addChild(overlay);
  }

  private updateUI(): void {
    this.scoreText.text = `Score: ${this.score}`;
    this.timerText.text = `Time: ${Math.ceil(Math.max(0, this.roundTimer))}`;
    this.roundText.text = `Round ${this.round} of 3`;
  }

  exit(): void {
    this.gameActive = false;
    this.isSwiping = false;
    this.swipeTrail = [];
    this.lastSwipePoint = null;
    for (const vine of this.vines) {
      vine.alive = false;
      vine.graphics.visible = false;
    }
    this.vines = [];
    for (const piece of this.cutPieces) {
      this.pieceLayer.removeChild(piece.container);
    }
    this.cutPieces = [];
  }
}
