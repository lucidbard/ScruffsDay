import { Container, Sprite, Assets } from 'pixi.js';
import type { TweenManager } from '../game/Tween';
import { Easing } from '../game/Tween';
import type { ItemId, FlagId } from '../game/GameState';

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

  get id(): string { return this.config.id; }
  get name(): string { return this.config.name; }

  constructor(config: NPCConfig, tweens: TweenManager) {
    this.config = config;
    this.tweens = tweens;
  }

  async setup(): Promise<void> {
    const texture = await Assets.load(this.config.texturePath);
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.width = this.config.width;
    this.sprite.height = this.config.height;
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
    if (this.idleTweenId !== null) {
      this.tweens.cancel(this.idleTweenId);
      this.idleTweenId = null;
      this.container.y = this.config.y;
    }
  }

  playHappy(): Promise<void> {
    return new Promise((resolve) => {
      this.stopIdle();
      this.tweens.add({
        target: this.container.scale as unknown as Record<string, number>,
        props: { x: 1.2, y: 1.2 },
        duration: 200,
        easing: Easing.easeOut,
        onComplete: () => {
          this.tweens.add({
            target: this.container.scale as unknown as Record<string, number>,
            props: { x: 1, y: 1 },
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
