import { Container, Sprite, Assets } from 'pixi.js';
import type { TweenManager } from '../game/Tween';
import { Easing } from '../game/Tween';
import type { WalkableArea } from '../game/WalkableArea';

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
    const texture = await Assets.load('assets/characters/scruff.png');
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5, 1); // anchor at bottom-center (feet)
    // Scale proportionally to target height
    const targetHeight = 140;
    const scale = targetHeight / texture.height;
    this.sprite.scale.set(scale);
    this.container.addChild(this.sprite);
    this.startIdle();
  }

  setPosition(x: number, y: number): void {
    this.stopIdle();
    this.container.position.set(x, y);
    this.startIdle();
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

  /** Move to target, clamping to walkable area boundary if outside. */
  moveToConstrained(targetX: number, targetY: number, walkableArea: WalkableArea): Promise<void> {
    if (walkableArea.contains(targetX, targetY)) {
      return this.moveTo(targetX, targetY);
    }
    const clamped = walkableArea.clampToEdge(targetX, targetY);
    return this.moveTo(clamped.x, clamped.y);
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
