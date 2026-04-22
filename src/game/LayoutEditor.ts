/**
 * Debug-mode drag handles for arbitrary scene objects (arrows, items, burrow, ...).
 * Attach to an object's Container; on pointerup, call back with the new x/y so the
 * caller can persist to walkable-areas.json via DebugSaveClient.
 *
 * Listeners are attached to app.stage so drags keep tracking when the cursor
 * leaves the handle.
 */
import { Container, Graphics, Text, TextStyle, Application } from 'pixi.js';
import { DebugSaveClient } from './DebugSaveClient';
import walkableAreasData from '../data/walkable-areas.json';

/** Persist the in-memory walkableAreasData to disk via the dev plugin. */
export async function saveWalkableAreas(): Promise<void> {
  await DebugSaveClient.instance.save(
    'src/data/walkable-areas.json',
    JSON.stringify(walkableAreasData, null, 2),
  );
}

export interface DraggableObject {
  /** Unique key used for the on-screen label. */
  id: string;
  /** Container whose position is updated live as the handle is dragged. */
  target: Container;
  /** Optional radius for the debug handle (default 14). */
  handleRadius?: number;
  /** Color of the handle outline (default magenta). */
  color?: number;
  /** Called on drop with the rounded new position. Persist here. */
  onDrop: (x: number, y: number) => void | Promise<void>;
}

export class LayoutEditor {
  private handles: Graphics[] = [];
  private labels: Text[] = [];

  constructor(
    private app: Application,
    private parent: Container,
    /** Coordinate space the handles sit in (usually the scene container). */
    private coordSpace: Container,
  ) {}

  attach(obj: DraggableObject): void {
    const radius = obj.handleRadius ?? 22;
    const color = obj.color ?? 0xFF00FF;

    // Solid hit-area disc drawn below the visible ring so the entire circle grabs pointers
    const handle = new Graphics();
    handle.circle(0, 0, radius);
    handle.fill({ color, alpha: 0.45 });
    handle.circle(0, 0, radius);
    handle.stroke({ width: 4, color: 0xFFFFFF, alpha: 0.9 });
    handle.circle(0, 0, 3);
    handle.fill({ color: 0xFFFFFF });
    handle.position.set(obj.target.x, obj.target.y);
    handle.eventMode = 'static';
    handle.cursor = 'grab';
    handle.hitArea = { contains: (x: number, y: number) => x * x + y * y <= radius * radius };
    handle.zIndex = 10000;
    // Ensure z-sort order is respected by Pixi
    this.parent.sortableChildren = true;
    this.parent.addChild(handle);
    this.handles.push(handle);

    const label = new Text({
      text: `${obj.id} (${Math.round(obj.target.x)}, ${Math.round(obj.target.y)})`,
      style: new TextStyle({ fontSize: 12, fill: color, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } }),
    });
    label.position.set(obj.target.x + radius + 6, obj.target.y - radius - 4);
    label.zIndex = 10001;
    this.parent.addChild(label);
    this.labels.push(label);

    console.info('[LayoutEditor] attached', obj.id, 'at', Math.round(obj.target.x), Math.round(obj.target.y), 'handle eventMode=', handle.eventMode);

    let dragging = false;
    let offX = 0, offY = 0;

    handle.on('pointerdown', (e) => {
      const local = e.getLocalPosition(this.coordSpace);
      offX = local.x - obj.target.x;
      offY = local.y - obj.target.y;
      dragging = true;
      handle.cursor = 'grabbing';
      e.stopPropagation();
      console.info('[LayoutEditor] pointerdown', obj.id, 'local=', Math.round(local.x), Math.round(local.y));
    });

    // globalpointermove fires on `handle` for every pointer move anywhere — no need
    // to mutate app.stage.hitArea / eventMode (which was breaking other overlays).
    handle.on('globalpointermove', (e) => {
      if (!dragging) return;
      const local = e.getLocalPosition(this.coordSpace);
      const nx = local.x - offX;
      const ny = local.y - offY;
      obj.target.position.set(nx, ny);
      handle.position.set(nx, ny);
      label.text = `${obj.id} (${Math.round(nx)}, ${Math.round(ny)})`;
      label.position.set(nx + radius + 6, ny - radius - 4);
    });

    const drop = async () => {
      if (!dragging) return;
      dragging = false;
      handle.cursor = 'grab';
      console.info('[LayoutEditor] drop', obj.id, 'at', Math.round(obj.target.x), Math.round(obj.target.y));
      try {
        await obj.onDrop(Math.round(obj.target.x), Math.round(obj.target.y));
        console.info('[LayoutEditor] saved', obj.id);
      } catch (err) {
        console.warn('[LayoutEditor] save failed for', obj.id, err);
      }
    };
    handle.on('pointerup', drop);
    handle.on('pointerupoutside', drop);
  }
}
