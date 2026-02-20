import { Container, Sprite, Assets } from 'pixi.js';
import type { TweenManager } from '../game/Tween';
import { Easing } from '../game/Tween';

export class Scruff {
  readonly container = new Container();
  private sprite!: Sprite;
  private tweens: TweenManager;
  private moving = false;
  private idleTweenId: number | null = null;
  private speed = 200; // pixels per second

  get x(): number { return this.container.x; }
  get y(): number { return this.container.y; }

  constructor(tweens: TweenManager) {
    this.tweens = tweens;
  }

  async setup(): Promise<void> {
    const texture = await Assets.load('assets/characters/scruff.svg');
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5, 1); // anchor at bottom-center (feet)
    this.sprite.width = 80;
    this.sprite.height = 120;
    this.container.addChild(this.sprite);
    this.startIdle();
  }

  setPosition(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  moveTo(targetX: number, targetY: number): Promise<void> {
    return new Promise((resolve) => {
      this.stopIdle();
      this.moving = true;

      // Flip sprite based on direction
      this.sprite.scale.x = targetX < this.container.x
        ? -Math.abs(this.sprite.scale.x)
        : Math.abs(this.sprite.scale.x);

      const dx = targetX - this.container.x;
      const dy = targetY - this.container.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const duration = (distance / this.speed) * 1000;

      // Walking bounce animation
      const bounceId = this.tweens.add({
        target: this.sprite.scale as unknown as Record<string, number>,
        props: { y: this.sprite.scale.y * 0.9 },
        duration: 150,
        yoyo: true,
        loop: true,
        easing: Easing.easeInOut,
      });

      this.tweens.add({
        target: this.container.position as unknown as Record<string, number>,
        props: { x: targetX, y: targetY },
        duration: Math.max(duration, 100),
        easing: Easing.easeOut,
        onComplete: () => {
          this.tweens.cancel(bounceId);
          this.sprite.scale.y = Math.abs(this.sprite.scale.y);
          this.moving = false;
          this.startIdle();
          resolve();
        },
      });
    });
  }

  isMoving(): boolean { return this.moving; }

  private startIdle(): void {
    this.idleTweenId = this.tweens.add({
      target: this.container.position as unknown as Record<string, number>,
      props: { y: this.container.y - 4 },
      duration: 800,
      yoyo: true,
      loop: true,
      easing: Easing.easeInOut,
    });
  }

  private stopIdle(): void {
    if (this.idleTweenId !== null) {
      this.tweens.cancel(this.idleTweenId);
      this.idleTweenId = null;
    }
  }

  playPickup(): Promise<void> {
    return new Promise((resolve) => {
      this.stopIdle();
      this.tweens.add({
        target: this.container.position as unknown as Record<string, number>,
        props: { y: this.container.y - 30 },
        duration: 300,
        easing: Easing.easeOut,
        onComplete: () => {
          this.tweens.add({
            target: this.container.position as unknown as Record<string, number>,
            props: { y: this.container.y + 30 },
            duration: 300,
            easing: Easing.bounce,
            onComplete: () => {
              this.startIdle();
              resolve();
            },
          });
        },
      });
    });
  }
}
