import { Scene } from '../game/Scene';
import { Scruff } from '../characters/Scruff';
import { NPC } from '../characters/NPC';
import { SceneArrow } from '../game/SceneArrow';
import { DialogueBubble, DialogueRunner } from '../game/DialogueSystem';
import { Sprite, Assets } from 'pixi.js';
import type { SceneId, FlagId } from '../game/GameState';
import dialogueData from '../data/dialogue.json';

export class TortoiseBurrow extends Scene {
  private scruff!: Scruff;
  private shelly!: NPC;
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;
  private lastDialogueId: string | null = null;

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId) => void;

  async setup(): Promise<void> {
    // 1. Background
    const bgTexture = await Assets.load('assets/backgrounds/tortoise-burrow-bg.svg');
    const bg = new Sprite(bgTexture);
    bg.width = 1280;
    bg.height = 720;
    this.container.addChild(bg);

    // 2. Scruff
    this.scruff = new Scruff(this.tweens);
    await this.scruff.setup();
    this.scruff.setPosition(640, 580);
    this.container.addChild(this.scruff.container);

    // 3. Shelly NPC
    this.shelly = new NPC(
      {
        id: 'shelly',
        name: 'Shelly',
        texturePath: 'assets/characters/shelly.svg',
        width: 120,
        height: 100,
        x: 500,
        y: 500,
        dialogueDefault: 'shelly_intro',
        dialogueHasItem: 'shelly_has_item',
        dialogueAfter: 'shelly_after',
        wantsItem: 'saw_palmetto_fronds',
        helpedFlag: 'shelly_helped',
      },
      this.tweens,
    );
    await this.shelly.setup();
    this.container.addChild(this.shelly.container);

    // 4. Shelly tap handler
    this.shelly.container.on('pointertap', () => {
      if (this.scruff.isMoving() || this.dialogueRunner.isActive()) return;
      this.scruff
        .moveTo(this.shelly.container.x - 80, this.shelly.container.y)
        .then(() => {
          const hasItem = this.gameState.hasItem('saw_palmetto_fronds');
          const isHelped = this.gameState.getFlag('shelly_helped');
          const dialogueId = this.shelly.getDialogueId(hasItem, isHelped);
          this.lastDialogueId = dialogueId;
          const line = this.dialogueRunner.start(dialogueId);
          if (line) {
            this.dialogueBubble.show(
              line.speaker,
              line.text,
              this.shelly.container.x,
              this.shelly.container.y - 120,
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
    const downArrow = new SceneArrow(
      'down',
      'scrub_thicket',
      'Scrub Thicket',
      620,
      660,
      this.tweens,
    );
    downArrow.container.on('pointertap', () => {
      if (!this.scruff.isMoving() && !this.dialogueRunner.isActive()) {
        this.onSceneChange?.('scrub_thicket');
      }
    });
    this.arrows.push(downArrow);
    this.container.addChild(downArrow.container);

    const upArrow = new SceneArrow(
      'up',
      'central_trail',
      'Central Trail',
      620,
      30,
      this.tweens,
    );
    upArrow.container.on('pointertap', () => {
      if (!this.scruff.isMoving() && !this.dialogueRunner.isActive()) {
        this.onSceneChange?.('central_trail');
      }
    });
    this.arrows.push(upArrow);
    this.container.addChild(upArrow.container);

    // 7. Ground tap handler (background receives taps)
    bg.eventMode = 'static';
    bg.on('pointertap', (e) => {
      if (this.scruff.isMoving()) return;

      // While dialogue is active, advance it on tap
      if (this.dialogueRunner.isActive()) {
        const nextLine = this.dialogueRunner.next();
        if (nextLine) {
          this.dialogueBubble.show(
            nextLine.speaker,
            nextLine.text,
            this.shelly.container.x,
            this.shelly.container.y - 120,
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
    // If the last dialogue was shelly_has_item and shelly isn't helped yet, process the item exchange
    if (
      this.lastDialogueId === 'shelly_has_item' &&
      this.gameState.hasItem('saw_palmetto_fronds') &&
      !this.gameState.getFlag('shelly_helped')
    ) {
      this.gameState.removeItem('saw_palmetto_fronds');
      this.gameState.setFlag('shelly_helped');
      await this.shelly.playHappy();
    }
    this.lastDialogueId = null;
  }

  enter(): void {
    // Reset Scruff position when entering
    this.scruff.setPosition(640, 580);
  }

  update(_deltaMs: number): void {
    // NPC proximity excitement
    this.shelly.setExcited(
      this.shelly.isInRange(this.scruff.x, this.scruff.y),
    );
  }

  exit(): void {
    this.dialogueBubble.hide();
  }
}
