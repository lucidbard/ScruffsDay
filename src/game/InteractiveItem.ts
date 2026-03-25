import { Container, Sprite, Assets, Graphics } from 'pixi.js';
import type { TweenManager } from './Tween';
import { Easing } from './Tween';
import type { ItemId } from './GameState';

export interface ItemConfig {
  itemId: ItemId;
  texturePath: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export class InteractiveItem {
  readonly container = new Container();
  readonly itemId: ItemId;
  private sprite!: Sprite;
  private glow = new Graphics();
  private tweens: TweenManager;
  private config: ItemConfig;
  private baseY: number;

  constructor(config: ItemConfig, tweens: TweenManager) {
    this.config = config;
    this.itemId = config.itemId;
    this.tweens = tweens;
    this.baseY = config.y;
  }

  async setup(): Promise<void> {
    const texture = await Assets.load(this.config.texturePath);
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5, 1);
    // Scale proportionally to target height
    const targetHeight = this.config.height ?? 48;
    const scale = targetHeight / texture.height;
    this.sprite.scale.set(scale);

    this.glow.circle(0, -targetHeight / 2, Math.max(30, targetHeight * 0.4));
    this.glow.fill({ color: 0xFFD700, alpha: 0.15 });
    this.container.addChild(this.glow, this.sprite);
    this.container.position.set(this.config.x, this.config.y);
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
  }

  setProximity(near: boolean): void {
    const targetHeight = this.config.height ?? 48;
    const r = Math.max(30, targetHeight * 0.4);
    this.glow.clear();
    this.glow.circle(0, -targetHeight / 2, near ? r * 1.2 : r);
    this.glow.fill({ color: 0xFFD700, alpha: near ? 0.35 : 0.15 });
  }

  playCollect(): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({
        target: this.container.scale as unknown as Record<string, number>,
        props: { x: 0, y: 0 },
        duration: 300,
        easing: Easing.easeIn,
        onComplete: () => {
          this.container.visible = false;
          resolve();
        },
      });
    });
  }
}
