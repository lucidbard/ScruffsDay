import { Scene } from '../game/Scene';
import { Easing } from '../game/Tween';
import { pickThoughtId } from '../game/ThoughtPicker';
import { Scruff } from '../characters/Scruff';
import { InteractiveItem } from '../game/InteractiveItem';
import type { ItemConfig } from '../game/InteractiveItem';
import { LayoutEditor, saveWalkableAreas } from '../game/LayoutEditor';
import { SceneArrow } from '../game/SceneArrow';
import { DialogueBubble, DialogueRunner } from '../game/DialogueSystem';
import { ItemInspectCard } from '../game/ItemInspectCard';
import { wireItemTap } from '../game/ItemCollector';
import { WalkableArea, resolveEntryPoint } from '../game/WalkableArea';
import { WalkableAreaDebug } from '../game/WalkableAreaDebug';
import { ForegroundObject } from '../game/ForegroundObject';
import { PerchSystem } from '../game/PerchSystem';
import { PerchDebugOverlay } from '../game/PerchDebugOverlay';
import { AmbientAudio } from '../game/AmbientAudio';
import type { DepthScaleConfig } from '../game/DepthSort';
import { AnimatedBackground } from '../game/AnimatedBackground';
import { Sprite, Assets, Container, Texture } from 'pixi.js';
import type { SceneId, FlagId, SceneDirection } from '../game/GameState';
import dialogueData from '../data/dialogue.json';
import walkableAreasData from '../data/walkable-areas.json';

type WalkableAreasJson = Record<string, Record<string, unknown>>;

export class ScrubThicket extends Scene {
  private scruff!: Scruff;
  private items: InteractiveItem[] = [];
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;
  private itemCard!: ItemInspectCard;
  private dialogueAnchor = { x: 0, y: 0 };
  private walkableArea!: WalkableArea;
  private depthScaleConfig: DepthScaleConfig | null = null;
  private foregrounds: ForegroundObject[] = [];
  private animBg: AnimatedBackground | null = null;
  private perchSystem = new PerchSystem();
  private ambientAudio = new AmbientAudio();

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId, dir?: SceneDirection) => void;

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

    // 5b. Ambient audio with call sync
    await this.ambientAudio.load(
      'assets/sounds/scrub-jay-ambient.mp3',
      'assets/sounds/scrub-jay-calls.json',
      () => this.scruff.setTalking(true),
      () => this.scruff.setTalking(false),
    );

    // 6. Collectible items (read from walkable-areas.json)
    const itemConfigs = ((sceneData.items as (ItemConfig & { requiresFlag?: FlagId })[] | undefined) ?? []);
    const itemIndexMap = new Map<InteractiveItem, number>();
    for (let i = 0; i < itemConfigs.length; i++) {
      const cfg = itemConfigs[i];
      if (this.gameState.hasItem(cfg.itemId)) continue;
      if (cfg.requiresFlag && !this.gameState.getFlag(cfg.requiresFlag)) continue;
      const item = new InteractiveItem(cfg, this.tweens);
      await item.setup();
      this.items.push(item);
      itemIndexMap.set(item, i);
      this.depthContainer.addChild(item.container);
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
    this.dialogueBubble = new DialogueBubble(this.gameState);
    this.container.addChild(this.dialogueBubble.container);

    // 9. Navigation arrows (read from walkable-areas.json)
    const arrowConfigs = ((sceneData.arrows as { direction: 'left'|'right'|'up'|'down'; target: SceneId; label: string; x: number; y: number; requiresFlag?: FlagId }[] | undefined) ?? []);
    const arrowIndexMap = new Map<SceneArrow, number>();
    for (let i = 0; i < arrowConfigs.length; i++) {
      const cfg = arrowConfigs[i];
      if (cfg.requiresFlag && !this.gameState.getFlag(cfg.requiresFlag)) continue;
      const arrow = new SceneArrow(cfg.direction, cfg.target, cfg.label, cfg.x, cfg.y, this.tweens);
      arrow.container.on('pointertap', () => {
        if (this.scruff.isMoving() || this.dialogueRunner.isActive()) return;
        this.scruff.flyToAndShrink(arrow.container.x, arrow.container.y + 40, 0.3).then(() => {
          this.onSceneChange?.(arrow.targetScene);
        });
      });
      this.arrows.push(arrow);
      arrowIndexMap.set(arrow, i);
      this.container.addChild(arrow.container);
    }

    // 10. Item inspect card + tap handlers
    this.itemCard = new ItemInspectCard();
    this.container.addChild(this.itemCard.container);
    for (const item of this.items) {
      wireItemTap(
        item,
        this.itemCard,
        this.scruff,
        this.gameState,
        () => this.scruff.isMoving() || this.dialogueRunner.isActive(),
        (removed) => { this.items = this.items.filter((i) => i !== removed); },
      );
    }

    // 11. Ground tap handler (background receives taps)
    bg.eventMode = 'static';
    bg.on('pointertap', (e) => {
      if (this.scruff.isMoving()) return;

      // While dialogue is active, advance it on tap (blocked until voice ends)
      if (this.dialogueRunner.isActive()) {
        if (this.dialogueBubble.canAdvance()) this.advanceDialogue();
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

      const editor = new LayoutEditor(this.app, this.container, this.container);
      for (const [arrow, idx] of arrowIndexMap) {
        editor.attach({
          id: `arrow[${idx}]`,
          target: arrow.container,
          onDrop: async (x, y) => {
            arrowConfigs[idx].x = x;
            arrowConfigs[idx].y = y;
            await saveWalkableAreas();
          },
        });
      }
      for (const [item, idx] of itemIndexMap) {
        editor.attach({
          id: `item[${idx}:${item.itemId}]`,
          target: item.container,
          color: 0xFFAA00,
          onDrop: async (x, y) => {
            itemConfigs[idx].x = x;
            itemConfigs[idx].y = y;
            await saveWalkableAreas();
          },
        });
      }
    }

    // 13. Perch debug overlay (editable in debug mode)
    if (WalkableAreaDebug.isEnabled()) {
      const perchOverlay = new PerchDebugOverlay(this.perchSystem, 'scrub_thicket', [1376, 768]);
      this.container.addChild(perchOverlay.container);
    }
  }

  private showDialogueLine(line: { speaker: string; text: string; audioPath: string }, x: number, y: number): void {
    this.dialogueAnchor = { x, y };
    this.dialogueBubble.show(line, x, y);
    this.dialogueBubble.onSkip = () => this.advanceDialogue();
  }

  private advanceDialogue(): void {
    const next = this.dialogueRunner.next();
    if (next) {
      this.scruff.setTalking(true);
      this.showDialogueLine(next, this.dialogueAnchor.x, this.dialogueAnchor.y);
    } else {
      this.scruff.setTalking(false);
      this.dialogueBubble.hide();
      this.dialogueBubble.onSkip = null;
    }
  }

  enter(fromScene?: SceneId, exitDirection?: SceneDirection): void {
    const sceneData = (walkableAreasData as WalkableAreasJson).scrub_thicket as Record<string, unknown>;
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

    // Show tutorial dialogue on first visit; else offer a progression thought.
    if (!this.gameState.getFlag('tutorial_complete')) {
      const line = this.dialogueRunner.start('tutorial');
      if (line) {
        this.scruff.setTalking(true);
        this.showDialogueLine(line, this.scruff.x, this.scruff.y - 130);
      }
      this.gameState.setFlag('tutorial_complete');
    } else {
      this.tryShowThought();
    }

    this.animBg?.resume();
    this.ambientAudio.play();
    this.startIdleHint();
  }

  private tryShowThought(): void {
    if (this.dialogueRunner.isActive()) return;
    const id = pickThoughtId('scrub_thicket', this.gameState);
    if (!id) return;
    const line = this.dialogueRunner.start(id);
    if (line) {
      this.scruff.setTalking(true);
      this.showDialogueLine(line, this.scruff.x, this.scruff.y - 130);
      this.gameState.markThoughtShown(id);
    }
  }

  private idleHintTimer: number | null = null;

  /**
   * First-scene engagement: after ~6 s of no interaction before Shelly has
   * been helped, pulse the up-arrow to the Tortoise Burrow so the player
   * has a clear destination.
   */
  private startIdleHint(): void {
    this.clearIdleHint();
    if (this.gameState.getFlag('shelly_helped')) return;
    const arrow = this.arrows[0];
    if (!arrow) return;
    this.idleHintTimer = window.setTimeout(() => {
      this.idleHintTimer = null;
      // Breathing scale pulse on the arrow container.
      const start = arrow.container.scale.x;
      this.tweens.add({
        target: arrow.container.scale as unknown as Record<string, number>,
        props: { x: start * 1.25, y: start * 1.25 },
        duration: 700,
        yoyo: true,
        loop: true,
        easing: Easing.easeInOut,
      });
    }, 6000);
  }

  private clearIdleHint(): void {
    if (this.idleHintTimer !== null) {
      clearTimeout(this.idleHintTimer);
      this.idleHintTimer = null;
    }
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
    this.clearIdleHint();
    this.scruff.stop();
    this.animBg?.pause();
    this.ambientAudio.pause();
    this.dialogueBubble.hide();
  }
}
