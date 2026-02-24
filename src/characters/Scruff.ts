import { Container, Sprite, Assets, Texture } from 'pixi.js';
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

  // Sprite animation
  private idleTextures: Texture[] = [];  // 3 idle frames
  private flyTextures: Texture[] = [];   // 3 fly frames
  private idleFrameIndex = 0;
  private flyFrameIndex = 0;
  private flyFrameDir = 1;               // +1 or -1 for ping-pong
  private idleAnimInterval: number | null = null;
  private flyAnimInterval: number | null = null;

  get x(): number { return this.container.x; }
  get y(): number { return this.container.y; }

  constructor(tweens: TweenManager) {
    this.tweens = tweens;
  }

  async setup(): Promise<void> {
    const [idle1, idle2, idle3, fly1, fly2, fly3] = await Promise.all([
      Assets.load('assets/characters/scruff-idle-1.png'),
      Assets.load('assets/characters/scruff-idle-2.png'),
      Assets.load('assets/characters/scruff-idle-3.png'),
      Assets.load('assets/characters/scruff-fly-1.png'),
      Assets.load('assets/characters/scruff-fly-2.png'),
      Assets.load('assets/characters/scruff-fly-3.png'),
    ]);
    this.idleTextures = [idle1, idle2, idle3];
    this.flyTextures = [fly1, fly2, fly3];

    this.sprite = new Sprite(this.idleTextures[0]);
    this.sprite.anchor.set(0.5, 1); // anchor at bottom-center (feet)
    // Scale proportionally to target height
    const targetHeight = 140;
    const scale = targetHeight / idle1.height;
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
      this.stopFlyAnim();
      this.moving = true;

      // Flip sprite based on direction
      this.sprite.scale.x = targetX < this.container.x
        ? -Math.abs(this.sprite.scale.x)
        : Math.abs(this.sprite.scale.x);

      const dx = targetX - this.container.x;
      const dy = targetY - this.container.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const duration = (distance / this.speed) * 1000;

      // Start fly-frame cycling
      this.startFlyAnim();

      this.tweens.add({
        target: this.container.position as unknown as Record<string, number>,
        props: { x: targetX, y: targetY },
        duration: Math.max(duration, 100),
        easing: Easing.easeOut,
        onComplete: () => {
          this.stopFlyAnim();
          this.sprite.texture = this.idleTextures[0];
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

  applyDepthScale(factor: number): void {
    this.container.scale.set(factor);
  }

  private startIdle(): void {
    // Bob tween
    this.idleTweenId = this.tweens.add({
      target: this.container.position as unknown as Record<string, number>,
      props: { y: this.container.y - 4 },
      duration: 800,
      yoyo: true,
      loop: true,
      easing: Easing.easeInOut,
    });
    // Idle frame cycling
    this.idleFrameIndex = 0;
    this.sprite.texture = this.idleTextures[0];
    this.idleAnimInterval = window.setInterval(() => {
      this.idleFrameIndex = (this.idleFrameIndex + 1) % this.idleTextures.length;
      this.sprite.texture = this.idleTextures[this.idleFrameIndex];
    }, 300);
  }

  private stopIdle(): void {
    if (this.idleTweenId !== null) {
      this.tweens.cancel(this.idleTweenId);
      this.idleTweenId = null;
    }
    if (this.idleAnimInterval !== null) {
      clearInterval(this.idleAnimInterval);
      this.idleAnimInterval = null;
    }
  }

  private startFlyAnim(): void {
    this.flyFrameIndex = 0;
    this.flyFrameDir = 1;
    this.sprite.texture = this.flyTextures[0];
    this.flyAnimInterval = window.setInterval(() => {
      this.flyFrameIndex += this.flyFrameDir;
      if (this.flyFrameIndex >= this.flyTextures.length - 1) {
        this.flyFrameDir = -1;
      } else if (this.flyFrameIndex <= 0) {
        this.flyFrameDir = 1;
      }
      this.sprite.texture = this.flyTextures[this.flyFrameIndex];
    }, 120);
  }

  private stopFlyAnim(): void {
    if (this.flyAnimInterval !== null) {
      clearInterval(this.flyAnimInterval);
      this.flyAnimInterval = null;
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
