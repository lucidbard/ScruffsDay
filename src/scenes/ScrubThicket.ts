import { Scene } from '../game/Scene';
import { Scruff } from '../characters/Scruff';
import { InteractiveItem } from '../game/InteractiveItem';
import { SceneArrow } from '../game/SceneArrow';
import { DialogueBubble, DialogueRunner } from '../game/DialogueSystem';
import { WalkableArea, resolveEntryPoint } from '../game/WalkableArea';
import { WalkableAreaDebug } from '../game/WalkableAreaDebug';
import { ForegroundObject } from '../game/ForegroundObject';
import { PerchSystem } from '../game/PerchSystem';
import { PerchDebugOverlay } from '../game/PerchDebugOverlay';
import type { DepthScaleConfig } from '../game/DepthSort';
import { AnimatedBackground } from '../game/AnimatedBackground';
import { Sprite, Assets, Container, Texture } from 'pixi.js';
import type { SceneId, FlagId } from '../game/GameState';
import dialogueData from '../data/dialogue.json';
import walkableAreasData from '../data/walkable-areas.json';

type WalkableAreasJson = Record<string, Record<string, unknown>>;

export class ScrubThicket extends Scene {
  private scruff!: Scruff;
  private items: InteractiveItem[] = [];
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;
  private walkableArea!: WalkableArea;
  private depthScaleConfig: DepthScaleConfig | null = null;
  private foregrounds: ForegroundObject[] = [];
  private animBg: AnimatedBackground | null = null;
  private perchSystem = new PerchSystem();

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId) => void;

  async setup(): Promise<void> {
    const sceneData = (walkableAreasData as WalkableAreasJson).scrub_thicket as Record<string, unknown>;

    // 1. Background
    this.animBg = new AnimatedBackground(1280, 720);
    await this.animBg.load('scrub-thicket', 'assets/backgrounds/scrub-thicket-bg.png');
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
    await this.perchSystem.load('scrub_thicket');
    this.scruff = new Scruff(this.tweens);
    await this.scruff.setup();
    const start = resolveEntryPoint(sceneData.entryPoints as Record<string, number[]>);
    this.scruff.setPosition(start.x, start.y);
    this.depthContainer.addChild(this.scruff.container);

    // 6. Collectible items (only if not already in inventory)
    // Saw palmetto only appears after Scruff learns Shelly needs it
    if (!this.gameState.hasItem('saw_palmetto_fronds') && this.gameState.getFlag('knows_saw_palmetto')) {
      const palmetto = new InteractiveItem(
        {
          itemId: 'saw_palmetto_fronds',
          texturePath: 'assets/items/saw-palmetto-fronds.png',
          x: 300,
          y: 450,
          height: 140,
        },
        this.tweens,
      );
      await palmetto.setup();
      this.items.push(palmetto);
      this.depthContainer.addChild(palmetto.container);
    }

    if (!this.gameState.hasItem('rusty_lyonia_flowers')) {
      const lyonia = new InteractiveItem(
        {
          itemId: 'rusty_lyonia_flowers',
          texturePath: 'assets/items/rusty-lyonia-flowers.png',
          x: 900,
          y: 400,
        },
        this.tweens,
      );
      await lyonia.setup();
      this.items.push(lyonia);
      this.depthContainer.addChild(lyonia.container);
    }

    // 7. Foreground objects
    const fgData = (sceneData.foregrounds as { id: string; texturePath: string; x: number; y: number; depthY: number }[] | undefined) ?? [];
    for (const fgCfg of fgData) {
      const fg = new ForegroundObject(fgCfg);
      await fg.setup();
      this.foregrounds.push(fg);
      this.depthContainer.addChild(fg.container);
    }

    // 8. Dialogue system (above depthContainer)
    this.dialogueRunner = new DialogueRunner(
      dialogueData as Record<string, (typeof dialogueData)[keyof typeof dialogueData]>,
      (flag: string) => this.gameState.getFlag(flag as FlagId),
      (flag: string) => this.gameState.setFlag(flag as FlagId),
    );
    this.dialogueBubble = new DialogueBubble();
    this.container.addChild(this.dialogueBubble.container);

    // 9. Navigation arrow to Tortoise Burrow (above depthContainer)
    const arrow = new SceneArrow(
      'up',
      'tortoise_burrow',
      'Tortoise Burrow',
      620,
      30,
      this.tweens,
    );
    arrow.container.on('pointertap', () => {
      if (this.scruff.isMoving() || this.dialogueRunner.isActive()) return;
      this.scruff.moveTo(arrow.container.x, 300).then(() => {
        this.onSceneChange?.(arrow.targetScene);
      });
    });
    this.arrows.push(arrow);
    this.container.addChild(arrow.container);

    // 10. Item tap handlers
    for (const item of this.items) {
      item.container.on('pointertap', () => {
        if (this.scruff.isMoving() || this.dialogueRunner.isActive()) return;
        this.scruff.moveTo(item.container.x, item.container.y + 30).then(async () => {
          await item.playCollect();
          this.gameState.addItem(item.itemId);
          await this.scruff.playPickup();
          this.items = this.items.filter((i) => i !== item);
        });
      });
    }

    // 11. Ground tap handler (background receives taps)
    bg.eventMode = 'static';
    bg.on('pointertap', (e) => {
      if (this.scruff.isMoving()) return;

      // While dialogue is active, advance it on tap
      if (this.dialogueRunner.isActive()) {
        const nextLine = this.dialogueRunner.next();
        if (nextLine) {
          this.scruff.setTalking(true);
          this.dialogueBubble.show(
            nextLine.speaker,
            nextLine.text,
            this.scruff.x,
            this.scruff.y - 130,
          );
        } else {
          this.scruff.setTalking(false);
          this.dialogueBubble.hide();
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
        [],
        'scrub_thicket',
        'scrub_thicket',
        [],
        this.walkableArea.getObstacles(),
        this.foregrounds,
      );
      this.container.addChild(debug.container);
    }

    // 13. Perch debug overlay (editable in debug mode)
    if (WalkableAreaDebug.isEnabled()) {
      const perchOverlay = new PerchDebugOverlay(this.perchSystem, 'scrub_thicket', [1376, 768]);
      this.container.addChild(perchOverlay.container);
    }
  }

  enter(fromScene?: SceneId): void {
    const sceneData = (walkableAreasData as WalkableAreasJson).scrub_thicket as Record<string, unknown>;
    // Position Scruff based on which scene she came from
    const entry = resolveEntryPoint(sceneData.entryPoints as Record<string, number[]>, fromScene);
    this.scruff.setPosition(entry.x, entry.y);

    // Show tutorial dialogue on first visit
    if (!this.gameState.getFlag('tutorial_complete')) {
      const line = this.dialogueRunner.start('tutorial');
      if (line) {
        this.scruff.setTalking(true);
        this.dialogueBubble.show(
          line.speaker,
          line.text,
          this.scruff.x,
          this.scruff.y - 130,
        );
      }
      this.gameState.setFlag('tutorial_complete');
    }

    this.animBg?.resume();
  }

  update(_deltaMs: number): void {
    // Update item proximity glow based on Scruff's position
    for (const item of this.items) {
      const dx = this.scruff.x - item.container.x;
      const dy = this.scruff.y - item.container.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      item.setProximity(dist < 100);
    }

    // Apply depth scaling
    if (this.depthScaleConfig) {
      this.applyDepthScaling(this.depthScaleConfig, [this.scruff]);
    }
    // Re-sort by Y
    this.sortDepth();
  }

  exit(): void {
    this.animBg?.pause();
    this.dialogueBubble.hide();
  }
}
