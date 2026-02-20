import { Scene } from '../game/Scene';
import { Scruff } from '../characters/Scruff';
import { NPC } from '../characters/NPC';
import { InteractiveItem } from '../game/InteractiveItem';
import { SceneArrow } from '../game/SceneArrow';
import { DialogueBubble, DialogueRunner } from '../game/DialogueSystem';
import { Sprite, Assets } from 'pixi.js';
import type { SceneId, FlagId } from '../game/GameState';
import { SeedScatter } from '../minigames/SeedScatter';
import dialogueData from '../data/dialogue.json';

export class SandyBarrens extends Scene {
  private scruff!: Scruff;
  private sunny!: NPC;
  private items: InteractiveItem[] = [];
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;
  private lastDialogueId: string | null = null;
  private activeMinigame: SeedScatter | null = null;

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId) => void;

  async setup(): Promise<void> {
    // 1. Background
    const bgTexture = await Assets.load('assets/backgrounds/sandy-barrens-bg.svg');
    const bg = new Sprite(bgTexture);
    bg.width = 1280;
    bg.height = 720;
    this.container.addChild(bg);

    // 2. Scruff
    this.scruff = new Scruff(this.tweens);
    await this.scruff.setup();
    this.scruff.setPosition(640, 580);
    this.container.addChild(this.scruff.container);

    // 3. Sunny NPC (indigo snake)
    this.sunny = new NPC(
      {
        id: 'sunny',
        name: 'Sunny',
        texturePath: 'assets/characters/sunny.svg',
        width: 160,
        height: 80,
        x: 700,
        y: 480,
        dialogueDefault: 'sunny_intro',
        dialogueHasItem: null,
        dialogueAfter: 'sunny_after',
        wantsItem: null,
        helpedFlag: 'sunny_helped',
      },
      this.tweens,
    );
    await this.sunny.setup();
    this.container.addChild(this.sunny.container);

    // 4. Collectible: Florida rosemary cuttings (only if not already collected)
    if (!this.gameState.hasItem('florida_rosemary_cuttings')) {
      const rosemary = new InteractiveItem(
        {
          itemId: 'florida_rosemary_cuttings',
          texturePath: 'assets/items/florida-rosemary-cuttings.svg',
          x: 300,
          y: 430,
        },
        this.tweens,
      );
      await rosemary.setup();
      this.items.push(rosemary);
      this.container.addChild(rosemary.container);
    }

    // 5. Sunny tap handler
    this.sunny.container.on('pointertap', () => {
      if (this.scruff.isMoving() || this.dialogueRunner.isActive() || this.activeMinigame) return;
      this.scruff
        .moveTo(this.sunny.container.x - 100, this.sunny.container.y)
        .then(() => {
          const isHelped = this.gameState.getFlag('sunny_helped');
          const hasRosemary = this.gameState.hasItem('florida_rosemary_cuttings');
          const hasFeather = this.gameState.getFlag('flicker_helped');

          // Determine which dialogue to show
          let dialogueId: string;
          if (isHelped) {
            dialogueId = 'sunny_after';
          } else if (hasRosemary && hasFeather) {
            dialogueId = 'sunny_ready';
          } else {
            dialogueId = 'sunny_intro';
          }

          this.lastDialogueId = dialogueId;
          const line = this.dialogueRunner.start(dialogueId);
          if (line) {
            this.dialogueBubble.show(
              line.speaker,
              line.text,
              this.sunny.container.x,
              this.sunny.container.y - 100,
            );
          }
        });
    });

    // 6. Dialogue system
    this.dialogueRunner = new DialogueRunner(
      dialogueData as Record<string, (typeof dialogueData)[keyof typeof dialogueData]>,
      (flag: string) => this.gameState.getFlag(flag as FlagId),
    );
    this.dialogueBubble = new DialogueBubble();
    this.container.addChild(this.dialogueBubble.container);

    // 7. Navigation arrows
    const leftArrow = new SceneArrow(
      'left',
      'central_trail',
      'Central Trail',
      30,
      360,
      this.tweens,
    );
    leftArrow.container.on('pointertap', () => {
      if (!this.scruff.isMoving() && !this.dialogueRunner.isActive() && !this.activeMinigame) {
        this.onSceneChange?.('central_trail');
      }
    });
    this.arrows.push(leftArrow);
    this.container.addChild(leftArrow.container);

    // 8. Item tap handlers
    for (const item of this.items) {
      item.container.on('pointertap', () => {
        if (this.scruff.isMoving() || this.dialogueRunner.isActive() || this.activeMinigame) return;
        this.scruff.moveTo(item.container.x, item.container.y + 30).then(async () => {
          await item.playCollect();
          this.gameState.addItem(item.itemId);
          await this.scruff.playPickup();
          this.items = this.items.filter((i) => i !== item);
        });
      });
    }

    // 9. Ground tap handler (background receives taps)
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
            this.sunny.container.x,
            this.sunny.container.y - 100,
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
      this.lastDialogueId === 'sunny_ready' &&
      !this.gameState.getFlag('sunny_helped')
    ) {
      // Launch Seed Scatter mini-game
      await this.startMinigame();
    }
    this.lastDialogueId = null;
  }

  private async startMinigame(): Promise<void> {
    // Create SeedScatter as a child overlay within SandyBarrens
    const minigame = new SeedScatter(this.app, this.gameState, this.tweens);
    await minigame.setup();
    minigame.onComplete = async () => {
      // Remove minigame overlay
      this.container.removeChild(minigame.container);
      this.activeMinigame = null;
      // Process rewards
      this.gameState.setFlag('sunny_helped');
      this.gameState.setFlag('seed_scatter_complete');
      await this.sunny.playHappy();
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
    this.sunny.setExcited(
      this.sunny.isInRange(this.scruff.x, this.scruff.y),
    );

    // Update item proximity glow based on Scruff's position
    for (const item of this.items) {
      const dx = this.scruff.x - item.container.x;
      const dy = this.scruff.y - item.container.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      item.setProximity(dist < 100);
    }
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
