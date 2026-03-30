import { Container, Sprite, Assets, Texture } from 'pixi.js';
import type { TweenManager } from '../game/Tween';
import { Easing } from '../game/Tween';
import type { WalkableArea } from '../game/WalkableArea';
import { ScruffAnimator, type Direction } from './ScruffAnimator';

const TARGET_HEIGHT = 80;
const HOP_THRESHOLD = 150; // pixels — below this, hop instead of fly

export class Scruff {
  readonly container = new Container();
  private sprite!: Sprite;
  private animator!: ScruffAnimator;
  private tweens: TweenManager;
  private moving = false;
  private speed = 200; // pixels per second
  private baseScale = 1;

  get x(): number { return this.container.x; }
  get y(): number { return this.container.y; }

  constructor(tweens: TweenManager) {
    this.tweens = tweens;
  }

  async setup(): Promise<void> {
    // Load a placeholder texture for initial sprite creation
    const idleFront = await Assets.load('assets/characters/scruff-idle-front.png');

    this.sprite = new Sprite(idleFront);
    this.sprite.anchor.set(0.5, 1);
    this.baseScale = TARGET_HEIGHT / idleFront.height;
    this.sprite.scale.set(this.baseScale);
    this.container.addChild(this.sprite);

    // Initialize animator and load all spritesheets
    this.animator = new ScruffAnimator(this.sprite);
    await this.animator.loadAll();
    this.animator.playIdleFront();
  }

  setPosition(x: number, y: number, playIdle = true): void {
    this.animator?.stop();
    this.container.position.set(x, y);
    if (playIdle) this.animator?.playIdleFront();
  }

  moveTo(targetX: number, targetY: number): Promise<void> {
    return this.flyTo(targetX, targetY);
  }

  /** Fly or hop to target depending on distance. */
  flyTo(targetX: number, targetY: number): Promise<void> {
    const dx = targetX - this.container.x;
    const dy = targetY - this.container.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 5) return Promise.resolve(); // too close, skip

    const dir: Direction = dx < 0 ? 'left' : 'right';

    if (distance < HOP_THRESHOLD) {
      return this.doHop(targetX, targetY, distance, dir);
    }
    return this.doFly(targetX, targetY, distance, dir);
  }

  /** Sequenced hop: turn → hop animation + arc → land → idle */
  private async doHop(targetX: number, targetY: number, distance: number, dir: Direction): Promise<void> {
    this.moving = true;

    // 1. Turn to face direction
    await this.animator.turnToward(dir);

    // 2. Play hop animation while moving
    this.animator.playHopping(dir);
    await this.animateArc(targetX, targetY, distance, Math.min(25, Math.max(10, distance * 0.12)));

    // 3. Land (turn back to front)
    await this.animator.land();
    this.moving = false;
  }

  /** Sequenced fly: turn → fly animation + arc → land → idle */
  private async doFly(targetX: number, targetY: number, distance: number, dir: Direction): Promise<void> {
    this.moving = true;

    // 1. Turn to face direction
    await this.animator.turnToward(dir);

    // 2. Play fly animation while moving
    this.animator.playFlying(dir);
    await this.animateArc(targetX, targetY, distance, Math.min(150, Math.max(40, distance * 0.3)));

    // 3. Land (turn back to front)
    await this.animator.land();
    this.moving = false;
  }

  /** Set a depth scale function that's called each frame during movement. */
  onDepthUpdate?: (y: number) => void;

  /** Animate position along an arc trajectory. */
  private animateArc(targetX: number, targetY: number, distance: number, arcHeight: number): Promise<void> {
    return new Promise((resolve) => {
      const startX = this.container.x;
      const startY = this.container.y;
      const dx = targetX - startX;
      const dy = targetY - startY;
      const duration = Math.max((distance / this.speed) * 1000, 200);

      const startTime = performance.now();
      const animate = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / duration);
        const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

        const linearX = startX + dx * ease;
        const linearY = startY + dy * ease;
        const arc = -4 * arcHeight * t * (t - 1);

        this.container.position.set(linearX, linearY - arc);
        this.onDepthUpdate?.(linearY);

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          this.container.position.set(targetX, targetY);
          this.onDepthUpdate?.(targetY);
          resolve();
        }
      };
      requestAnimationFrame(animate);
    });
  }

  /** Move to target, clamping to walkable area boundary if outside. */
  moveToConstrained(targetX: number, targetY: number, walkableArea: WalkableArea): Promise<void> {
    if (walkableArea.contains(targetX, targetY)) {
      return this.flyTo(targetX, targetY);
    }
    const clamped = walkableArea.clampToEdge(targetX, targetY);
    return this.flyTo(clamped.x, clamped.y);
  }

  isMoving(): boolean { return this.moving; }

  /** Apply depth-based scale. Lower Y (further back) = smaller. */
  applyDepthScale(factor: number): void {
    this.container.scale.set(factor);
  }

  /** Shrink into distance for scene exit transitions. */
  async flyToAndShrink(targetX: number, targetY: number, targetScale = 0.2): Promise<void> {
    this.moving = true;
    const dir: import('./ScruffAnimator').Direction = targetX < this.container.x ? 'left' : 'right';
    await this.animator.turnToward(dir);
    this.animator.playFlying(dir);

    const startX = this.container.x;
    const startY = this.container.y;
    const startScale = this.container.scale.x;
    const dx = targetX - startX;
    const dy = targetY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const duration = Math.max((distance / this.speed) * 1000, 400);
    const arcHeight = Math.min(100, distance * 0.2);

    await new Promise<void>((resolve) => {
      const startTime = performance.now();
      const animate = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / duration);
        const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

        this.container.position.set(startX + dx * ease, startY + dy * ease - (-4 * arcHeight * t * (t - 1)));
        const s = startScale + (targetScale - startScale) * ease;
        this.container.scale.set(s);

        if (t < 1) requestAnimationFrame(animate);
        else { this.container.position.set(targetX, targetY); resolve(); }
      };
      requestAnimationFrame(animate);
    });

    this.animator.stop();
    this.moving = false;
  }

  /** Start or stop talking animation (mouth movement). */
  setTalking(talking: boolean): void {
    if (this.moving) return;
    if (talking) {
      this.animator.playTalking();
    } else {
      this.animator.stopTalking();
    }
  }

  playPickup(): Promise<void> {
    return new Promise((resolve) => {
      this.animator.stop();
      // Quick bounce animation
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
              this.animator.playIdleFront();
              resolve();
            },
          });
        },
      });
    });
  }
}
