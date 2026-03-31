import { Scene } from '../game/Scene';
import { Scruff } from '../characters/Scruff';
import { NPC } from '../characters/NPC';
import { SceneArrow } from '../game/SceneArrow';
import { DialogueBubble, DialogueRunner } from '../game/DialogueSystem';
import { WalkableArea, resolveEntryPoint } from '../game/WalkableArea';
import { WalkableAreaDebug } from '../game/WalkableAreaDebug';
import { ForegroundObject } from '../game/ForegroundObject';
import { PerchSystem } from '../game/PerchSystem';
import { PerchDebugOverlay } from '../game/PerchDebugOverlay';
import { AmbientAudio } from '../game/AmbientAudio';
import type { DepthScaleConfig } from '../game/DepthSort';
import { AnimatedBackground } from '../game/AnimatedBackground';
import { Sprite, Assets, Container } from 'pixi.js';
import type { SceneId, FlagId, SceneDirection } from '../game/GameState';
import type { NPCConfig } from '../characters/NPC';
import { VineBuster } from '../minigames/VineBuster';
import dialogueData from '../data/dialogue.json';
import walkableAreasData from '../data/walkable-areas.json';
import npcConfigs from '../data/npc-configs.json';

type WalkableAreasJson = Record<string, Record<string, unknown>>;

export class PineClearing extends Scene {
  private scruff!: Scruff;
  private flicker!: NPC;
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;
  private lastDialogueId: string | null = null;
  private walkableArea!: WalkableArea;
  private activeMinigame: VineBuster | null = null;
  private depthScaleConfig: DepthScaleConfig | null = null;
  private foregrounds: ForegroundObject[] = [];
  private animBg: AnimatedBackground | null = null;
  private perchSystem = new PerchSystem();
  private ambientAudio = new AmbientAudio();

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId, dir?: SceneDirection) => void;

  async setup(): Promise<void> {
    const sceneData = (walkableAreasData as WalkableAreasJson).pine_clearing as Record<string, unknown>;

    // 1. Background
    this.animBg = new AnimatedBackground(1280, 720);
    await this.animBg.load('pine-clearing', 'assets/backgrounds/pine-clearing-bg.png');
    const bg = this.animBg.sprite;
    this.container.addChild(bg);

    // 2. Depth container (Y-sorted every frame)
    this.depthContainer = new Container();
    this.container.addChild(this.depthContainer);

    // 3. Walkable area with obstacles
    const areaData = (sceneData.polygons as { points: number[][] }[])[0];
    const obstacleData = (sceneData.obstacles as { points: number[][] }[] | undefined) ?? [];
    this.walkableArea = new WalkableArea(
      areaData.points.map(([x, y]: number[]) => ({ x, y })),
      obstacleData.map((obs) => obs.points.map(([x, y]: number[]) => ({ x, y }))),
    );

    // 4. Depth scale config
    this.depthScaleConfig = (sceneData.depthScale as DepthScaleConfig | undefined) ?? null;

    // 5. Perch system + Scruff
    await this.perchSystem.load('pine_clearing');
    this.scruff = new Scruff(this.tweens);
    await this.scruff.setup();
    const start = resolveEntryPoint(sceneData.entryPoints as Record<string, number[]>);
    this.scruff.setPosition(start.x, start.y);
    this.depthContainer.addChild(this.scruff.container);

    // 5b. Ambient audio with call sync
    await this.ambientAudio.load(
      'assets/sounds/scrub-jay-ambient.mp3',
      'assets/sounds/scrub-jay-calls.json',
      () => this.scruff.setTalking(true),
      () => this.scruff.setTalking(false),
    );

    // 6. Flicker NPC (woodpecker)
    this.flicker = new NPC(npcConfigs.flicker as NPCConfig, this.tweens);
    await this.flicker.setup();
    this.depthContainer.addChild(this.flicker.container);

    // 7. Flicker tap handler
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

    // 8. Foreground objects
    const fgData = (sceneData.foregrounds as { id: string; texturePath: string; x: number; y: number; depthY: number }[] | undefined) ?? [];
    for (const fgCfg of fgData) {
      const fg = new ForegroundObject(fgCfg);
      await fg.setup();
      this.foregrounds.push(fg);
      this.depthContainer.addChild(fg.container);
    }

    // 9. Dialogue system (above depthContainer)
    this.dialogueRunner = new DialogueRunner(
      dialogueData as Record<string, (typeof dialogueData)[keyof typeof dialogueData]>,
      (flag: string) => this.gameState.getFlag(flag as FlagId),
      (flag: string) => this.gameState.setFlag(flag as FlagId),
    );
    this.dialogueBubble = new DialogueBubble();
    this.container.addChild(this.dialogueBubble.container);

    // 10. Navigation arrows (above depthContainer)
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

    // 11. Ground tap handler (background receives taps)
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
      // Find nearest perch to tap point, or fall back to walkable area
      const perch = this.perchSystem.nearestWithin(pos.x, pos.y, 120);
      if (perch) {
        const scaled = this.perchSystem.scaleToGame(perch);
        this.scruff.flyTo(scaled.x, scaled.y);
      } else {
        this.scruff.moveToConstrained(pos.x, pos.y, this.walkableArea);
      }
    });

    // 12. Debug overlay (above depthContainer)
    if (WalkableAreaDebug.isEnabled()) {
      const debug = new WalkableAreaDebug(
        this.walkableArea,
        sceneData.entryPoints as Record<string, number[]>,
        [this.flicker],
        'pine_clearing',
        'pine_clearing',
        ['flicker'],
        this.walkableArea.getObstacles(),
        this.foregrounds,
      );
      this.container.addChild(debug.container);
    }

    // 13. Perch debug overlay (editable in debug mode)
    if (WalkableAreaDebug.isEnabled()) {
      const perchOverlay = new PerchDebugOverlay(this.perchSystem, 'pine_clearing', [1376, 768]);
      this.container.addChild(perchOverlay.container);
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

  enter(fromScene?: SceneId, exitDirection?: SceneDirection): void {
    const sceneData = (walkableAreasData as WalkableAreasJson).pine_clearing as Record<string, unknown>;
    // Position Scruff based on which scene she came from
    const entry = resolveEntryPoint(sceneData.entryPoints as Record<string, number[]>, fromScene);
    
    // Arrival animation: Fly in from the same side for vertical (sky), opposite for horizontal
    if (exitDirection) {
      const flyInDist = 100;
      let startX = entry.x;
      let startY = entry.y;

      if (exitDirection === 'up') startY = -flyInDist;
      else if (exitDirection === 'down') startY = 720 + flyInDist;
      else if (exitDirection === 'left') startX = 1280 + flyInDist;
      else if (exitDirection === 'right') startX = -flyInDist;

      this.scruff.setPosition(startX, startY, false);
      this.scruff.flyTo(entry.x, entry.y);
    } else {
      this.scruff.setPosition(entry.x, entry.y);
    }

    this.animBg?.resume();
    this.ambientAudio.play();
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

    // Apply depth scaling
    if (this.depthScaleConfig) {
      this.applyDepthScaling(this.depthScaleConfig, [this.scruff, this.flicker]);
    }
    // Re-sort by Y
    this.sortDepth();
  }

  exit(): void {
    this.scruff.stop();
    this.animBg?.pause();
    this.ambientAudio.pause();
    this.dialogueBubble.hide();
    if (this.activeMinigame) {
      this.activeMinigame.exit();
      this.container.removeChild(this.activeMinigame.container);
      this.activeMinigame = null;
    }
  }
}
