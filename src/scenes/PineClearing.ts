import { Scene } from '../game/Scene';
import { Scruff } from '../characters/Scruff';
import { NPC } from '../characters/NPC';
import { SceneArrow } from '../game/SceneArrow';
import { DialogueBubble, DialogueRunner } from '../game/DialogueSystem';
import { WalkableArea, resolveEntryPoint } from '../game/WalkableArea';
import { WalkableAreaDebug } from '../game/WalkableAreaDebug';
import { Sprite, Assets } from 'pixi.js';
import type { SceneId, FlagId } from '../game/GameState';
import type { NPCConfig } from '../characters/NPC';
import { VineBuster } from '../minigames/VineBuster';
import dialogueData from '../data/dialogue.json';
import walkableAreasData from '../data/walkable-areas.json';
import npcConfigs from '../data/npc-configs.json';

export class PineClearing extends Scene {
  private scruff!: Scruff;
  private flicker!: NPC;
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;
  private lastDialogueId: string | null = null;
  private walkableArea!: WalkableArea;
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

    // 2. Walkable area
    const areaData = walkableAreasData.pine_clearing.polygons[0];
    this.walkableArea = new WalkableArea(
      areaData.points.map(([x, y]: number[]) => ({ x, y })),
    );

    // 3. Scruff
    this.scruff = new Scruff(this.tweens);
    await this.scruff.setup();
    const start = resolveEntryPoint(walkableAreasData.pine_clearing.entryPoints);
    this.scruff.setPosition(start.x, start.y);
    this.container.addChild(this.scruff.container);

    // 3. Flicker NPC (woodpecker)
    this.flicker = new NPC(npcConfigs.flicker as NPCConfig, this.tweens);
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
      // Constrain movement to walkable area
      this.scruff.moveToConstrained(pos.x, pos.y, this.walkableArea);
    });

    // Debug overlay
    if (WalkableAreaDebug.isEnabled()) {
      const debug = new WalkableAreaDebug(this.walkableArea, walkableAreasData.pine_clearing.entryPoints, [this.flicker], 'pine_clearing', 'pine_clearing', ['flicker']);
      this.container.addChild(debug.container);
    }
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

  enter(fromScene?: SceneId): void {
    // Position Scruff based on which scene she came from
    const entry = resolveEntryPoint(walkableAreasData.pine_clearing.entryPoints, fromScene);
    this.scruff.setPosition(entry.x, entry.y);
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
