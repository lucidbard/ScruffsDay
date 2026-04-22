import { Container, Sprite, Assets, Graphics } from "pixi.js";
import type { TweenManager } from "./Tween";
import { Easing } from "./Tween";
import type { ItemId } from "./GameState";

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
  private glowTweenId: number | null = null;
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
    // Default collectible size bumped for kid-visibility; can still be overridden.
    const targetHeight = this.config.height ?? 80;
    const scale = targetHeight / texture.height;
    this.sprite.scale.set(scale);

    // Halo scaled tight to the item — previously had a hard 80px floor that
    // made small items (acorns, nuts) look huge.
    const outerR = targetHeight * 0.75;
    const innerR = targetHeight * 0.5;
    this.glow.circle(0, -targetHeight / 2, outerR);
    this.glow.fill({ color: 0xFFE066, alpha: 0.35 });
    this.glow.circle(0, -targetHeight / 2, innerR);
    this.glow.stroke({ width: 4, color: 0xFFB300, alpha: 0.8 });
    this.container.addChild(this.glow, this.sprite);
    this.container.position.set(this.config.x, this.config.y);
    this.container.eventMode = "static";
    this.container.cursor = "pointer";
    this.startGlowPulse();
  }

  private startGlowPulse(): void {
    this.glowTweenId = this.tweens.add({
      target: this.glow.scale as unknown as Record<string, number>,
      props: { x: 1.3, y: 1.3 },
      duration: 900,
      yoyo: true,
      loop: true,
      easing: Easing.easeInOut,
    });
  }

  setProximity(near: boolean): void {
    const targetHeight = this.config.height ?? 80;
    const outerR = targetHeight * 0.75;
    const innerR = targetHeight * 0.5;
    this.glow.clear();
    this.glow.circle(0, -targetHeight / 2, outerR);
    this.glow.fill({ color: 0xFFE066, alpha: near ? 0.55 : 0.35 });
    this.glow.circle(0, -targetHeight / 2, innerR);
    this.glow.stroke({ width: near ? 5 : 4, color: 0xFFB300, alpha: near ? 0.95 : 0.8 });
  }

  playCollect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.glowTweenId !== null) {
        this.tweens.cancel(this.glowTweenId);
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
