import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { TweenManager } from './Tween';
import { Easing } from './Tween';
import type { SceneId } from './GameState';

export class SceneArrow {
  readonly container = new Container();
  readonly targetScene: SceneId;
  private arrow = new Graphics();
  private label: Text;

  constructor(
    direction: 'left' | 'right' | 'up' | 'down',
    targetScene: SceneId,
    labelText: string,
    x: number,
    y: number,
    tweens: TweenManager
  ) {
    this.targetScene = targetScene;

    const size = 40;
    // Draw arrow shape based on direction
    switch (direction) {
      case 'right':
        this.arrow.moveTo(0, -size / 2);
        this.arrow.lineTo(size, 0);
        this.arrow.lineTo(0, size / 2);
        this.arrow.closePath();
        break;
      case 'left':
        this.arrow.moveTo(size, -size / 2);
        this.arrow.lineTo(0, 0);
        this.arrow.lineTo(size, size / 2);
        this.arrow.closePath();
        break;
      case 'up':
        this.arrow.moveTo(-size / 2, size);
        this.arrow.lineTo(0, 0);
        this.arrow.lineTo(size / 2, size);
        this.arrow.closePath();
        break;
      case 'down':
        this.arrow.moveTo(-size / 2, 0);
        this.arrow.lineTo(0, size);
        this.arrow.lineTo(size / 2, 0);
        this.arrow.closePath();
        break;
    }
    this.arrow.fill({ color: 0xFFF8DC });
    this.arrow.stroke({ width: 3, color: 0x3E2723 });

    this.label = new Text({
      text: labelText,
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        fill: '#3E2723',
        align: 'center',
      }),
    });
    this.label.anchor.set(0.5, 0);
    this.label.position.set(size / 2, size / 2 + 4);

    this.container.addChild(this.arrow, this.label);
    this.container.position.set(x, y);
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';

    // Pulsing animation
    tweens.add({
      target: this.container.scale as unknown as Record<string, number>,
      props: { x: 1.15, y: 1.15 },
      duration: 600,
      yoyo: true,
      loop: true,
      easing: Easing.easeInOut,
    });
  }
}
