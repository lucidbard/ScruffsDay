import { Scene } from '../game/Scene';
import { Scruff } from '../characters/Scruff';
import { NPC } from '../characters/NPC';
import { InteractiveItem } from '../game/InteractiveItem';
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
import { SeedScatter } from '../minigames/SeedScatter';
import dialogueData from '../data/dialogue.json';
import walkableAreasData from '../data/walkable-areas.json';
import npcConfigs from '../data/npc-configs.json';

type WalkableAreasJson = Record<string, Record<string, unknown>>;

export class SandyBarrens extends Scene {
  private scruff!: Scruff;
  private sunny!: NPC;
  private items: InteractiveItem[] = [];
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;
  private lastDialogueId: string | null = null;
  private walkableArea!: WalkableArea;
  private activeMinigame: SeedScatter | null = null;
  private depthScaleConfig: DepthScaleConfig | null = null;
  private foregrounds: ForegroundObject[] = [];
  private animBg: AnimatedBackground | null = null;
  private perchSystem = new PerchSystem();
  private ambientAudio = new AmbientAudio();

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId, dir?: SceneDirection) => void;

  async setup(): Promise<void> {
    const sceneData = (walkableAreasData as WalkableAreasJson).sandy_barrens as Record<string, unknown>;

    // 1. Background
    this.animBg = new AnimatedBackground(1280, 720);
    await this.animBg.load('sandy-barrens', 'assets/backgrounds/sandy-barrens-bg.png');
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
    await this.perchSystem.load('sandy_barrens');
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

    // 6. Sunny NPC (indigo snake)
    this.sunny = new NPC(npcConfigs.sunny as NPCConfig, this.tweens);
    await this.sunny.setup();
    this.depthContainer.addChild(this.sunny.container);

    // 7. Collectible: Saw palmetto (only after learning Shelly needs it)
    if (!this.gameState.hasItem('saw_palmetto_fronds') && this.gameState.getFlag('knows_saw_palmetto')) {
      const palmetto = new InteractiveItem(
        {
          itemId: 'saw_palmetto_fronds',
          texturePath: 'assets/items/saw-palmetto-fronds.png',
          x: 180,
          y: 500,
          height: 100,
        },
        this.tweens,
      );
      await palmetto.setup();
      this.items.push(palmetto);
      this.depthContainer.addChild(palmetto.container);
    }

    // 8. Collectible: Florida rosemary cuttings (only if not already collected)
    if (!this.gameState.hasItem('florida_rosemary_cuttings')) {
      const rosemary = new InteractiveItem(
        {
          itemId: 'florida_rosemary_cuttings',
          texturePath: 'assets/items/florida-rosemary-cuttings.png',
          x: 300,
          y: 430,
        },
        this.tweens,
      );
      await rosemary.setup();
      this.items.push(rosemary);
      this.depthContainer.addChild(rosemary.container);
    }

    // 8. Foreground objects
    const fgData = (sceneData.foregrounds as { id: string; texturePath: string; x: number; y: number; depthY: number }[] | undefined) ?? [];
    for (const fgCfg of fgData) {
      const fg = new ForegroundObject(fgCfg);
      await fg.setup();
      this.foregrounds.push(fg);
      this.depthContainer.addChild(fg.container);
    }

    // 9. Sunny tap handler
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

    // 10. Dialogue system (above depthContainer)
    this.dialogueRunner = new DialogueRunner(
      dialogueData as Record<string, (typeof dialogueData)[keyof typeof dialogueData]>,
      (flag: string) => this.gameState.getFlag(flag as FlagId),
      (flag: string) => this.gameState.setFlag(flag as FlagId),
    );
    this.dialogueBubble = new DialogueBubble();
    this.container.addChild(this.dialogueBubble.container);

    // 11. Navigation arrows (above depthContainer)
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

    // 12. Item tap handlers
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

    // 13. Ground tap handler (background receives taps)
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
      // Find nearest perch to tap point, or fall back to walkable area
      const perch = this.perchSystem.nearestWithin(pos.x, pos.y, 120);
      if (perch) {
        const scaled = this.perchSystem.scaleToGame(perch);
        this.scruff.flyTo(scaled.x, scaled.y);
      } else {
        this.scruff.moveToConstrained(pos.x, pos.y, this.walkableArea);
      }
    });

    // 14. Debug overlay (above depthContainer)
    if (WalkableAreaDebug.isEnabled()) {
      const debug = new WalkableAreaDebug(
        this.walkableArea,
        sceneData.entryPoints as Record<string, number[]>,
        [this.sunny],
        'sandy_barrens',
        'sandy_barrens',
        ['sunny'],
        this.walkableArea.getObstacles(),
        this.foregrounds,
      );
      this.container.addChild(debug.container);
    }

    // 15. Perch debug overlay (editable in debug mode)
    if (WalkableAreaDebug.isEnabled()) {
      const perchOverlay = new PerchDebugOverlay(this.perchSystem, 'sandy_barrens', [1376, 768]);
      this.container.addChild(perchOverlay.container);
    }
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

  enter(fromScene?: SceneId, exitDirection?: SceneDirection): void {
    const sceneData = (walkableAreasData as WalkableAreasJson).sandy_barrens as Record<string, unknown>;
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

    // Apply depth scaling
    if (this.depthScaleConfig) {
      this.applyDepthScaling(this.depthScaleConfig, [this.scruff, this.sunny]);
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
