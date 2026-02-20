import { Container, FederatedPointerEvent } from 'pixi.js';

export interface TapEvent {
  x: number;
  y: number;
  originalEvent: FederatedPointerEvent;
}

type TapHandler = (event: TapEvent) => void;

export class InputManager {
  private handlers: TapHandler[] = [];
  private tapStartPos: { x: number; y: number } | null = null;
  private static readonly TAP_THRESHOLD = 10;

  constructor(hitArea: Container) {
    hitArea.eventMode = 'static';
    hitArea.cursor = 'pointer';

    hitArea.on('pointerdown', (e: FederatedPointerEvent) => {
      const pos = e.getLocalPosition(hitArea);
      this.tapStartPos = { x: pos.x, y: pos.y };
    });

    hitArea.on('pointerup', (e: FederatedPointerEvent) => {
      if (!this.tapStartPos) return;
      const pos = e.getLocalPosition(hitArea);
      const dx = pos.x - this.tapStartPos.x;
      const dy = pos.y - this.tapStartPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < InputManager.TAP_THRESHOLD) {
        const event: TapEvent = { x: pos.x, y: pos.y, originalEvent: e };
        for (const handler of this.handlers) {
          handler(event);
        }
      }
      this.tapStartPos = null;
    });

    hitArea.on('pointerupoutside', () => {
      this.tapStartPos = null;
    });
  }

  onTap(handler: TapHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }
}
