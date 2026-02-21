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
  private bounceTweenId: number | null = null;
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
    this.sprite.anchor.set(0.5, 0.5);
    // Scale proportionally to target height
    const targetHeight = this.config.height ?? 48;
    const scale = targetHeight / texture.height;
    this.sprite.scale.set(scale);

    this.glow.circle(0, 0, 30);
    this.glow.fill({ color: 0xFFD700, alpha: 0.3 });
    this.container.addChild(this.glow, this.sprite);
    this.container.position.set(this.config.x, this.config.y);
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.startBounce();
  }

  private startBounce(): void {
    this.bounceTweenId = this.tweens.add({
      target: this.container.position as unknown as Record<string, number>,
      props: { y: this.baseY - 6 },
      duration: 800,
      yoyo: true,
      loop: true,
      easing: Easing.easeInOut,
    });
  }

  setProximity(near: boolean): void {
    this.glow.clear();
    this.glow.circle(0, 0, near ? 36 : 30);
    this.glow.fill({ color: 0xFFD700, alpha: near ? 0.5 : 0.3 });
  }

  playCollect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.bounceTweenId !== null) {
        this.tweens.cancel(this.bounceTweenId);
      }
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
