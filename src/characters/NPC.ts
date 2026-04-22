import { Container, Rectangle, Sprite, Assets, Texture } from 'pixi.js';
import type { TweenManager } from '../game/Tween';
import { Easing } from '../game/Tween';
import type { ItemId, FlagId } from '../game/GameState';
import { AnimatedNPCTexture } from '../game/AnimatedNPCTexture';

const IDLE_FRAMES = 25;
const FRAME_SIZE = 256;

export interface NPCConfig {
  id: string;
  name: string;
  texturePath: string;
  width: number;
  height: number;
  x: number;
  y: number;
  dialogueDefault: string;
  dialogueHasItem: string | null;
  dialogueAfter: string | null;
  wantsItem: ItemId | null;
  helpedFlag: FlagId | null;
}

export class NPC {
  readonly container = new Container();
  private sprite!: Sprite;
  private config: NPCConfig;
  private tweens: TweenManager;
  private idleTweenId: number | null = null;
  private interactRadius = 120;
  private animTexture: AnimatedNPCTexture | null = null;
  private idleFrames: Texture[] = [];
  private idleFrameIndex = 0;
  private idleSheetInterval: number | null = null;

  get id(): string { return this.config.id; }
  get name(): string { return this.config.name; }

  constructor(config: NPCConfig, tweens: TweenManager) {
    this.config = config;
    this.tweens = tweens;
  }

  async setup(): Promise<void> {
    // Try spritesheet idle animation first
    const sheetPath = `assets/characters/${this.config.id}-idle-sheet.png`;
    let baseTexture: Texture;

    try {
      const sheet = await Assets.load(sheetPath);
      if (sheet && sheet.source && sheet.source.width) {
        // Infer per-frame width from sheet dimensions — some sheets were
        // exported at non-256 frame widths.
        const inferredW = Math.floor(sheet.source.width / IDLE_FRAMES);
        const frameW = inferredW > 0 ? inferredW : FRAME_SIZE;
        for (let i = 0; i < IDLE_FRAMES; i++) {
          this.idleFrames.push(new Texture({
            source: sheet.source,
            frame: new Rectangle(i * frameW, 0, frameW, FRAME_SIZE),
          }));
        }
        baseTexture = this.idleFrames[0];
        console.info(`[NPC ${this.config.id}] idle sheet loaded: ${this.idleFrames.length} frames @ ${frameW}x${FRAME_SIZE}`);
      } else {
        throw new Error('no sheet');
      }
    } catch (err) {
      console.info(`[NPC ${this.config.id}] no idle sheet (${err}), using static texture`);
      baseTexture = await Assets.load(this.config.texturePath);
    }

    this.sprite = new Sprite(baseTexture);
    this.sprite.anchor.set(0.5, 1);
    const scale = this.config.height / baseTexture.height;
    this.sprite.scale.set(scale);
    this.container.addChild(this.sprite);
    this.container.position.set(this.config.x, this.config.y);
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.startIdle();
  }

  getDialogueId(hasWantedItem: boolean, isHelped: boolean): string {
    if (isHelped && this.config.dialogueAfter) return this.config.dialogueAfter;
    if (hasWantedItem && this.config.dialogueHasItem) return this.config.dialogueHasItem;
    return this.config.dialogueDefault;
  }

  isInRange(playerX: number, playerY: number): boolean {
    const dx = playerX - this.config.x;
    const dy = playerY - this.config.y;
    return Math.sqrt(dx * dx + dy * dy) < this.interactRadius;
  }

  setExcited(excited: boolean): void {
    this.stopIdle();
    this.startIdle(excited ? 8 : 4);
  }

  private startIdle(amplitude = 4): void {
    // If we have spritesheet frames, cycle them instead of bobbing
    if (this.idleFrames.length > 1) {
      this.idleFrameIndex = 0;
      this.idleSheetInterval = window.setInterval(() => {
        this.idleFrameIndex = (this.idleFrameIndex + 1) % this.idleFrames.length;
        this.sprite.texture = this.idleFrames[this.idleFrameIndex];
      }, 62); // ~16fps
      return;
    }
    // Fallback: gentle bob tween
    this.idleTweenId = this.tweens.add({
      target: this.container.position as unknown as Record<string, number>,
      props: { y: this.config.y - amplitude },
      duration: 600 + Math.random() * 200,
      yoyo: true,
      loop: true,
      easing: Easing.easeInOut,
    });
  }

  private stopIdle(): void {
    if (this.idleSheetInterval !== null) {
      clearInterval(this.idleSheetInterval);
      this.idleSheetInterval = null;
    }
    if (this.idleTweenId !== null) {
      this.tweens.cancel(this.idleTweenId);
      this.idleTweenId = null;
      this.container.y = this.config.y;
    }
  }

  setDebugPosition(x: number, y: number): void {
    this.config.x = x;
    this.config.y = y;
    this.stopIdle();
    this.container.position.set(x, y);
    this.startIdle();
  }

  applyDepthScale(factor: number): void {
    this.container.scale.set(factor);
  }

  /** No-op placeholder. Real mouth animation will replace this later. */
  setTalking(_talking: boolean): void {}

  playHappy(): Promise<void> {
    return new Promise((resolve) => {
      this.stopIdle();
      // Use sprite.scale so depth scale on container is not affected
      const baseX = Math.abs(this.sprite.scale.x);
      const baseY = Math.abs(this.sprite.scale.y);
      this.tweens.add({
        target: this.sprite.scale as unknown as Record<string, number>,
        props: { x: baseX * 1.2, y: baseY * 1.2 },
        duration: 200,
        easing: Easing.easeOut,
        onComplete: () => {
          this.tweens.add({
            target: this.sprite.scale as unknown as Record<string, number>,
            props: { x: baseX, y: baseY },
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
