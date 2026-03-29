import { Container, Rectangle, Sprite, Assets, Texture } from 'pixi.js';
import type { TweenManager } from '../game/Tween';
import { Easing } from '../game/Tween';
import type { WalkableArea } from '../game/WalkableArea';

const IDLE_SHEET_FRAMES = 25;
const IDLE_FRAME_W = 232;
const IDLE_FRAME_H = 256;

const FLY_SHEET_FRAMES = 25;
const FLY_FRAME_W = 256;
const FLY_FRAME_H = 228;

export class Scruff {
  readonly container = new Container();
  private sprite!: Sprite;
  private tweens: TweenManager;
  private moving = false;
  private speed = 200; // pixels per second

  // Sprite animation
  private idleTextures: Texture[] = [];
  private flyTextures: Texture[] = [];
  private pickupTexture: Texture | null = null;
  private talkingTexture: Texture | null = null;
  private happyTexture: Texture | null = null;
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
    const [idleSheet, idleFront, flySheet, flying, pickup, talking, happy] = await Promise.all([
      Assets.load('assets/characters/scruff-idle-sheet.png'),
      Assets.load('assets/characters/scruff-idle-front.png'),
      Assets.load('assets/characters/scruff-fly-sheet.png').catch(() => null),
      Assets.load('assets/characters/scruff-flying.png'),
      Assets.load('assets/characters/scruff-pickup.png'),
      Assets.load('assets/characters/scruff-talking.png'),
      Assets.load('assets/characters/scruff-happy.png'),
    ]);

    // Slice idle spritesheet into individual frame textures
    if (idleSheet) {
      for (let i = 0; i < IDLE_SHEET_FRAMES; i++) {
        const frame = new Texture({
          source: idleSheet.source,
          frame: new Rectangle(i * IDLE_FRAME_W, 0, IDLE_FRAME_W, IDLE_FRAME_H),
        });
        this.idleTextures.push(frame);
      }
    } else {
      this.idleTextures = [idleFront];
    }

    // Slice fly spritesheet, fall back to static flying image
    if (flySheet) {
      for (let i = 0; i < FLY_SHEET_FRAMES; i++) {
        const frame = new Texture({
          source: flySheet.source,
          frame: new Rectangle(i * FLY_FRAME_W, 0, FLY_FRAME_W, FLY_FRAME_H),
        });
        this.flyTextures.push(frame);
      }
    } else {
      this.flyTextures = [flying];
    }
    this.pickupTexture = pickup;
    this.talkingTexture = talking;
    this.happyTexture = happy;

    this.sprite = new Sprite(this.idleTextures[0]);
    this.sprite.anchor.set(0.5, 1); // anchor at bottom-center (feet)
    // Scale proportionally to target height
    const targetHeight = 140;
    const scale = targetHeight / IDLE_FRAME_H;
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
    this.idleFrameIndex = 0;
    this.sprite.texture = this.idleTextures[0];
    // 25 frames at ~16fps = 62ms per frame
    this.idleAnimInterval = window.setInterval(() => {
      this.idleFrameIndex = (this.idleFrameIndex + 1) % this.idleTextures.length;
      this.sprite.texture = this.idleTextures[this.idleFrameIndex];
    }, 62);
  }

  private stopIdle(): void {
    if (this.idleAnimInterval !== null) {
      clearInterval(this.idleAnimInterval);
      this.idleAnimInterval = null;
    }
  }

  private startFlyAnim(): void {
    this.flyFrameIndex = 0;
    this.sprite.texture = this.flyTextures[0];
    // 25 frames at ~16fps = 62ms per frame
    this.flyAnimInterval = window.setInterval(() => {
      this.flyFrameIndex = (this.flyFrameIndex + 1) % this.flyTextures.length;
      this.sprite.texture = this.flyTextures[this.flyFrameIndex];
    }, 62);
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
      if (this.pickupTexture) this.sprite.texture = this.pickupTexture;
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
