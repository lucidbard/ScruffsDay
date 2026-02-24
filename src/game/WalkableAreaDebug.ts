import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { WalkableArea, Point } from './WalkableArea';
import type { NPC } from '../characters/NPC';
import { DebugSaveClient } from './DebugSaveClient';
import { DebugUndoStack } from './DebugUndoStack';
import npcConfigs from '../data/npc-configs.json';
import walkableAreasData from '../data/walkable-areas.json';

const VERTEX_RADIUS = 8;
const ENTRY_RADIUS = 10;
const NPC_RADIUS = 12;

export class WalkableAreaDebug {
  /** All live instances, used for global show/hide toggling. */
  private static instances: WalkableAreaDebug[] = [];

  static setAllVisible(visible: boolean): void {
    for (const inst of WalkableAreaDebug.instances) {
      inst.container.visible = visible;
    }
  }

  readonly container = new Container();
  private walkableArea: WalkableArea;
  private entryPoints: Record<string, Point>;
  private fill = new Graphics();
  private vertexGraphics = new Graphics();
  private entryGraphics = new Graphics();
  private labelContainer = new Container();
  private npcs: NPC[];
  private npcConfigKeys: string[];
  private npcGraphics = new Graphics();
  private npcLabelContainer = new Container();
  private dragging: { type: 'vertex'; index: number } | { type: 'entry'; key: string } | { type: 'npc'; index: number } | null = null;
  private saveBtn: Container;
  private sceneId: string;
  private walkableAreaPath: string;

  /** Only create if ?debug=walk is in URL. */
  static isEnabled(): boolean {
    return new URLSearchParams(window.location.search).get('debug') === 'walk';
  }

  constructor(
    walkableArea: WalkableArea,
    entryPoints?: Record<string, number[]>,
    npcs?: NPC[],
    sceneId?: string,
    walkableAreaPath?: string,
    npcConfigKeys?: string[],
  ) {
    this.walkableArea = walkableArea;
    this.npcs = npcs ?? [];
    this.sceneId = sceneId ?? '';
    this.walkableAreaPath = walkableAreaPath ?? sceneId ?? '';
    this.npcConfigKeys = npcConfigKeys ?? this.npcs.map(n => n.id);

    WalkableAreaDebug.instances.push(this);

    // Convert [x,y] arrays to Point objects (mutable copy)
    this.entryPoints = {};
    if (entryPoints) {
      for (const [key, val] of Object.entries(entryPoints)) {
        this.entryPoints[key] = { x: val[0], y: val[1] };
      }
    }

    // Semi-transparent fill layer
    this.container.addChild(this.fill);

    // Vertex dots layer
    this.container.addChild(this.vertexGraphics);

    // Entry point markers layer
    this.container.addChild(this.entryGraphics);
    this.container.addChild(this.labelContainer);

    // NPC markers layer
    this.container.addChild(this.npcGraphics);
    this.container.addChild(this.npcLabelContainer);

    // Save button
    this.saveBtn = this.createSaveButton();
    this.container.addChild(this.saveBtn);

    // Interaction on the fill area for adding/dragging vertices
    this.fill.eventMode = 'static';
    this.fill.cursor = 'crosshair';

    this.fill.on('pointerdown', (e) => {
      const pos = e.getLocalPosition(this.container);
      const pts = this.walkableArea.getPolygon();

      // Check NPC markers first (they draw on top)
      const hitNpc = this.hitTestNpc(pos.x, pos.y);
      if (hitNpc !== -1) {
        this.dragging = { type: 'npc', index: hitNpc };
        return;
      }

      // Check entry point markers next
      const hitEntry = this.hitTestEntry(pos.x, pos.y);
      if (hitEntry !== null) {
        this.dragging = { type: 'entry', key: hitEntry };
        return;
      }

      // Check if clicking near an existing vertex
      const hitIdx = this.hitTestVertex(pos.x, pos.y, pts);

      if (hitIdx !== -1) {
        // Right-click to remove vertex (need at least 3)
        if (e.button === 2 && pts.length > 3) {
          pts.splice(hitIdx, 1);
          this.redraw();
          return;
        }
        // Start dragging this vertex
        this.dragging = { type: 'vertex', index: hitIdx };
        return;
      }

      // Shift+click to add a new vertex on the nearest edge
      if (e.shiftKey) {
        const insertIdx = this.findNearestEdge(pos.x, pos.y, pts);
        pts.splice(insertIdx + 1, 0, { x: Math.round(pos.x), y: Math.round(pos.y) });
        this.redraw();
      }
    });

    this.fill.on('pointermove', (e) => {
      if (this.dragging === null) return;
      const pos = e.getLocalPosition(this.container);

      if (this.dragging.type === 'vertex') {
        const pts = this.walkableArea.getPolygon();
        pts[this.dragging.index] = { x: Math.round(pos.x), y: Math.round(pos.y) };
      } else if (this.dragging.type === 'entry') {
        this.entryPoints[this.dragging.key] = { x: Math.round(pos.x), y: Math.round(pos.y) };
      } else if (this.dragging.type === 'npc') {
        const npc = this.npcs[this.dragging.index];
        npc.setDebugPosition(Math.round(pos.x), Math.round(pos.y));
      }
      this.redraw();
    });

    this.fill.on('pointerup', () => {
      this.dragging = null;
    });

    this.fill.on('pointerupoutside', () => {
      this.dragging = null;
    });

    // Prevent context menu
    this.fill.on('rightclick', (e) => {
      e.preventDefault?.();
    });

    this.redraw();
  }

  /** Build geometry + NPC position JSON and save to disk. */
  async saveGeometry(): Promise<void> {
    if (!this.walkableAreaPath) return;

    const client = DebugSaveClient.instance;
    const undo = DebugUndoStack.instance;

    // Save walkable areas
    const beforeWA = JSON.stringify(walkableAreasData, null, 2);
    const waData = JSON.parse(beforeWA); // deep clone

    // Build export data for this area
    const pts = this.walkableArea.getPolygon();
    const entryExport: Record<string, number[]> = {};
    for (const [key, pt] of Object.entries(this.entryPoints)) {
      entryExport[key] = [pt.x, pt.y];
    }
    const areaPayload = {
      entryPoints: entryExport,
      polygons: [{ points: pts.map((p) => [p.x, p.y]) }],
    };

    // Navigate into the walkable-areas.json using the dot-path
    const pathParts = this.walkableAreaPath.split('.');
    let target = waData;
    for (let i = 0; i < pathParts.length - 1; i++) {
      target = target[pathParts[i]];
    }
    target[pathParts[pathParts.length - 1]] = areaPayload;

    const afterWA = JSON.stringify(waData, null, 2);
    await client.save('src/data/walkable-areas.json', afterWA);
    undo.push('src/data/walkable-areas.json', beforeWA, afterWA);

    // Save NPC positions to npc-configs.json
    if (this.npcs.length > 0) {
      const beforeNPC = JSON.stringify(npcConfigs, null, 2);
      const npcData = JSON.parse(beforeNPC); // deep clone
      for (let i = 0; i < this.npcs.length; i++) {
        const configKey = this.npcConfigKeys[i];
        if (npcData[configKey]) {
          npcData[configKey].x = Math.round(this.npcs[i].container.x);
          npcData[configKey].y = Math.round(this.npcs[i].container.y);
        }
      }
      const afterNPC = JSON.stringify(npcData, null, 2);
      if (afterNPC !== beforeNPC) {
        await client.save('src/data/npc-configs.json', afterNPC);
        undo.push('src/data/npc-configs.json', beforeNPC, afterNPC);
      }
    }
  }

  private redraw(): void {
    const pts = this.walkableArea.getPolygon();

    // Fill polygon
    this.fill.clear();
    if (pts.length >= 3) {
      this.fill.poly(pts.flatMap((p) => [p.x, p.y]));
      this.fill.fill({ color: 0x00ff00, alpha: 0.2 });
      this.fill.stroke({ width: 2, color: 0x00ff00, alpha: 0.6 });
    }
    // Hit area covers entire stage so we can add points anywhere
    this.fill.hitArea = { contains: () => true };

    // Vertex dots
    this.vertexGraphics.clear();
    for (const p of pts) {
      this.vertexGraphics.circle(p.x, p.y, VERTEX_RADIUS);
      this.vertexGraphics.fill({ color: 0xffffff, alpha: 0.9 });
      this.vertexGraphics.stroke({ width: 2, color: 0x00ff00 });
    }

    // Entry point markers
    this.entryGraphics.clear();
    this.labelContainer.removeChildren();

    for (const [key, pt] of Object.entries(this.entryPoints)) {
      // Diamond shape for entry points
      this.entryGraphics.moveTo(pt.x, pt.y - ENTRY_RADIUS);
      this.entryGraphics.lineTo(pt.x + ENTRY_RADIUS, pt.y);
      this.entryGraphics.lineTo(pt.x, pt.y + ENTRY_RADIUS);
      this.entryGraphics.lineTo(pt.x - ENTRY_RADIUS, pt.y);
      this.entryGraphics.closePath();
      this.entryGraphics.fill({ color: 0xffaa00, alpha: 0.9 });
      this.entryGraphics.stroke({ width: 2, color: 0xff6600 });

      // Label
      const label = new Text({
        text: key,
        style: new TextStyle({
          fontSize: 11,
          fill: '#ffaa00',
          fontFamily: 'monospace',
          stroke: { color: '#000000', width: 3 },
        }),
      });
      label.anchor.set(0.5, 1);
      label.position.set(pt.x, pt.y - ENTRY_RADIUS - 4);
      this.labelContainer.addChild(label);
    }

    // NPC markers
    this.npcGraphics.clear();
    this.npcLabelContainer.removeChildren();

    for (const npc of this.npcs) {
      const nx = npc.container.x;
      const ny = npc.container.y;

      // Blue filled circle
      this.npcGraphics.circle(nx, ny, NPC_RADIUS);
      this.npcGraphics.fill({ color: 0x4488ff, alpha: 0.9 });
      this.npcGraphics.stroke({ width: 2, color: 0x2266dd });

      // White name label above
      const npcLabel = new Text({
        text: npc.name,
        style: new TextStyle({
          fontSize: 12,
          fill: '#ffffff',
          fontFamily: 'monospace',
          fontWeight: 'bold',
          stroke: { color: '#000000', width: 3 },
        }),
      });
      npcLabel.anchor.set(0.5, 1);
      npcLabel.position.set(nx, ny - NPC_RADIUS - 4);
      this.npcLabelContainer.addChild(npcLabel);
    }
  }

  private hitTestVertex(x: number, y: number, pts: Point[]): number {
    for (let i = 0; i < pts.length; i++) {
      const dx = x - pts[i].x;
      const dy = y - pts[i].y;
      if (dx * dx + dy * dy <= (VERTEX_RADIUS + 4) ** 2) return i;
    }
    return -1;
  }

  private hitTestNpc(x: number, y: number): number {
    const hitRadius = NPC_RADIUS + 4;
    for (let i = 0; i < this.npcs.length; i++) {
      const dx = x - this.npcs[i].container.x;
      const dy = y - this.npcs[i].container.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) return i;
    }
    return -1;
  }

  private hitTestEntry(x: number, y: number): string | null {
    const hitRadius = ENTRY_RADIUS + 4;
    for (const [key, pt] of Object.entries(this.entryPoints)) {
      const dx = x - pt.x;
      const dy = y - pt.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) return key;
    }
    return null;
  }

  /** Find the edge index where inserting a new point makes the most sense. */
  private findNearestEdge(x: number, y: number, pts: Point[]): number {
    let bestDist = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dist = distToSegment(x, y, a.x, a.y, b.x, b.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  private createSaveButton(): Container {
    const btn = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, 100, 32, 6);
    bg.fill({ color: 0x333333, alpha: 0.85 });
    bg.stroke({ width: 1, color: 0x00ff00 });
    btn.addChild(bg);

    const label = new Text({
      text: 'Save',
      style: new TextStyle({
        fontSize: 16,
        fill: '#00ff00',
        fontFamily: 'monospace',
      }),
    });
    label.position.set(50, 16);
    label.anchor.set(0.5, 0.5);
    btn.addChild(label);

    btn.position.set(10, 10);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', async () => {
      label.text = 'Saving...';
      try {
        await this.saveGeometry();
        label.text = 'Saved!';
        setTimeout(() => { label.text = 'Save'; }, 1500);
      } catch (err) {
        console.error('[WalkableAreaDebug] Save failed:', err);
        label.text = 'Error!';
        setTimeout(() => { label.text = 'Save'; }, 2000);
      }
    });

    return btn;
  }
}

function distToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) {
    const dx = px - ax;
    const dy = py - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}
