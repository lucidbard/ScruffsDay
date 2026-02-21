import { Scene } from '../game/Scene';
import { Scruff } from '../characters/Scruff';
import { NPC } from '../characters/NPC';
import { SceneArrow } from '../game/SceneArrow';
import { DialogueBubble, DialogueRunner } from '../game/DialogueSystem';
import { Sprite, Assets } from 'pixi.js';
import type { SceneId, FlagId } from '../game/GameState';
import { VineBuster } from '../minigames/VineBuster';
import dialogueData from '../data/dialogue.json';

export class PineClearing extends Scene {
  private scruff!: Scruff;
  private flicker!: NPC;
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;
  private lastDialogueId: string | null = null;
  private activeMinigame: VineBuster | null = null;

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId) => void;

  async setup(): Promise<void> {
    // 1. Background
    const bgTexture = await Assets.load('assets/backgrounds/pine-clearing-bg.png');
    const bg = new Sprite(bgTexture);
    bg.width = 1280;
    bg.height = 720;
    this.container.addChild(bg);

    // 2. Scruff
    this.scruff = new Scruff(this.tweens);
    await this.scruff.setup();
    this.scruff.setPosition(640, 580);
    this.container.addChild(this.scruff.container);

    // 3. Flicker NPC (woodpecker)
    this.flicker = new NPC(
      {
        id: 'flicker',
        name: 'Flicker',
        texturePath: 'assets/characters/flicker.png',
        width: 80,
        height: 140,
        x: 400,
        y: 480,
        dialogueDefault: 'flicker_intro',
        dialogueHasItem: null,
        dialogueAfter: 'flicker_after',
        wantsItem: null,
        helpedFlag: 'flicker_helped',
      },
      this.tweens,
    );
    await this.flicker.setup();
    this.container.addChild(this.flicker.container);

    // 4. Flicker tap handler
    this.flicker.container.on('pointertap', () => {
      if (this.scruff.isMoving() || this.dialogueRunner.isActive() || this.activeMinigame) return;
      this.scruff
        .moveTo(this.flicker.container.x - 80, this.flicker.container.y)
        .then(() => {
          const isHelped = this.gameState.getFlag('flicker_helped');
          const dialogueId = this.flicker.getDialogueId(false, isHelped);
          this.lastDialogueId = dialogueId;
          const line = this.dialogueRunner.start(dialogueId);
          if (line) {
            this.dialogueBubble.show(
              line.speaker,
              line.text,
              this.flicker.container.x,
              this.flicker.container.y - 160,
            );
          }
        });
    });

    // 5. Dialogue system
    this.dialogueRunner = new DialogueRunner(
      dialogueData as Record<string, (typeof dialogueData)[keyof typeof dialogueData]>,
      (flag: string) => this.gameState.getFlag(flag as FlagId),
    );
    this.dialogueBubble = new DialogueBubble();
    this.container.addChild(this.dialogueBubble.container);

    // 6. Navigation arrows
    const rightArrow = new SceneArrow(
      'right',
      'central_trail',
      'Central Trail',
      1210,
      360,
      this.tweens,
    );
    rightArrow.container.on('pointertap', () => {
      if (!this.scruff.isMoving() && !this.dialogueRunner.isActive() && !this.activeMinigame) {
        this.onSceneChange?.('central_trail');
      }
    });
    this.arrows.push(rightArrow);
    this.container.addChild(rightArrow.container);

    // 7. Ground tap handler (background receives taps)
    bg.eventMode = 'static';
    bg.on('pointertap', (e) => {
      if (this.scruff.isMoving() || this.activeMinigame) return;

      // While dialogue is active, advance it on tap
      if (this.dialogueRunner.isActive()) {
        const nextLine = this.dialogueRunner.next();
        if (nextLine) {
          this.dialogueBubble.show(
            nextLine.speaker,
            nextLine.text,
            this.flicker.container.x,
            this.flicker.container.y - 160,
          );
        } else {
          this.dialogueBubble.hide();
          this.handleDialogueEnd();
        }
        return;
      }

      const pos = e.getLocalPosition(this.container);
      // Only allow movement in the ground area
      if (pos.y > 300) {
        this.scruff.moveTo(pos.x, pos.y);
      }
    });
  }

  private async handleDialogueEnd(): Promise<void> {
    if (
      this.lastDialogueId === 'flicker_intro' &&
      !this.gameState.getFlag('flicker_helped')
    ) {
      // Launch Vine Buster mini-game
      await this.startMinigame();
    }
    this.lastDialogueId = null;
  }

  private async startMinigame(): Promise<void> {
    // Create VineBuster as a child overlay within PineClearing
    const minigame = new VineBuster(this.app, this.gameState, this.tweens);
    await minigame.setup();
    minigame.onComplete = async () => {
      // Remove minigame overlay
      this.container.removeChild(minigame.container);
      this.activeMinigame = null;
      // Process rewards
      this.gameState.setFlag('flicker_helped');
      this.gameState.addItem('flicker_feather');
      await this.flicker.playHappy();
    };
    this.container.addChild(minigame.container);
    minigame.enter();
    this.activeMinigame = minigame;
  }

  enter(): void {
    // Reset Scruff position when entering
    this.scruff.setPosition(640, 580);
  }

  update(deltaMs: number): void {
    // If minigame is active, delegate updates to it
    if (this.activeMinigame) {
      this.activeMinigame.update(deltaMs);
      return;
    }

    // NPC proximity excitement
    this.flicker.setExcited(
      this.flicker.isInRange(this.scruff.x, this.scruff.y),
    );
  }

  exit(): void {
    this.dialogueBubble.hide();
    if (this.activeMinigame) {
      this.activeMinigame.exit();
      this.container.removeChild(this.activeMinigame.container);
      this.activeMinigame = null;
    }
  }
}
