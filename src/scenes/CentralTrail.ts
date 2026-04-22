import { Scene } from '../game/Scene';
import { pickThoughtId } from '../game/ThoughtPicker';
import { Scruff } from '../characters/Scruff';
import { NPC } from '../characters/NPC';
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
import { Sprite, Assets, Graphics, Container, Text, TextStyle } from 'pixi.js';
import { AnimatedBackground } from '../game/AnimatedBackground';
import type { SceneId, FlagId, SceneDirection } from '../game/GameState';
import type { NPCConfig } from '../characters/NPC';
import dialogueData from '../data/dialogue.json';
import walkableAreasData from '../data/walkable-areas.json';
import npcConfigs from '../data/npc-configs.json';

type WalkableAreasJson = Record<string, Record<string, unknown>>;

export class CentralTrail extends Scene {
  private scruff!: Scruff;
  private sage!: NPC;
  private items: InteractiveItem[] = [];
  private itemCard!: ItemInspectCard;
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;
  private lastDialogueId: string | null = null;
  private dialogueAnchor = { x: 0, y: 0 };
  private walkableArea!: WalkableArea;
  private upArrow!: SceneArrow;
  private signpost!: Container;
  private depthScaleConfig: DepthScaleConfig | null = null;
  private foregrounds: ForegroundObject[] = [];
  private animBg: AnimatedBackground | null = null;
  private perchSystem = new PerchSystem();
  private ambientAudio = new AmbientAudio();

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId, dir?: SceneDirection) => void;

  async setup(): Promise<void> {
    const sceneData = (walkableAreasData as WalkableAreasJson).central_trail as Record<string, unknown>;

    // 1. Background (animated video with static fallback)
    this.animBg = new AnimatedBackground(1280, 720);
    await this.animBg.load('central-trail', 'assets/backgrounds/central-trail-bg.png');
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
    await this.perchSystem.load('central_trail');
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

    // 6. Sage the Owl NPC
    this.sage = new NPC(npcConfigs.sage as NPCConfig, this.tweens);
    await this.sage.setup();
    this.depthContainer.addChild(this.sage.container);

    // 7. Sage tap handler
    this.sage.container.on('pointertap', () => {
      if (this.scruff.isMoving() || this.dialogueRunner.isActive()) return;
      this.scruff
        .moveTo(this.sage.container.x - 80, this.sage.container.y)
        .then(() => {
          const dialogueId = this.sage.getDialogueId(false, false);
          this.lastDialogueId = dialogueId;
          const line = this.dialogueRunner.start(dialogueId);
          if (line) {
            this.showDialogueLine(line, this.sage.container.x, this.sage.container.y - 160);
          }
        });
    });

    // 8. Collectible items (read from walkable-areas.json)
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

    // 9. Foreground objects
    const fgData = (sceneData.foregrounds as { id: string; texturePath: string; x: number; y: number; depthY: number }[] | undefined) ?? [];
    for (const fgCfg of fgData) {
      const fg = new ForegroundObject(fgCfg);
      await fg.setup();
      this.foregrounds.push(fg);
      this.depthContainer.addChild(fg.container);
    }

    // 10. Dialogue system (above depthContainer)
    this.dialogueRunner = new DialogueRunner(
      dialogueData as Record<string, (typeof dialogueData)[keyof typeof dialogueData]>,
      (flag: string) => this.gameState.getFlag(flag as FlagId),
      (flag: string) => this.gameState.setFlag(flag as FlagId),
    );
    this.dialogueBubble = new DialogueBubble(this.gameState);
    this.container.addChild(this.dialogueBubble.container);

    // 11. Navigation arrows (read from walkable-areas.json)
    const arrowConfigs = ((sceneData.arrows as { direction: 'left'|'right'|'up'|'down'; target: SceneId; label: string; x: number; y: number; requiresFlag?: FlagId; initiallyHidden?: boolean }[] | undefined) ?? []);
    const arrowIndexMap = new Map<SceneArrow, number>();
    for (let i = 0; i < arrowConfigs.length; i++) {
      const cfg = arrowConfigs[i];
      if (cfg.requiresFlag && !this.gameState.getFlag(cfg.requiresFlag)) continue;
      const arrow = new SceneArrow(cfg.direction, cfg.target, cfg.label, cfg.x, cfg.y, this.tweens);
      arrow.container.on('pointertap', () => {
        if (!this.scruff.isMoving() && !this.dialogueRunner.isActive()) {
          this.scruff.flyOffInDirection(cfg.direction).then(() => this.onSceneChange?.(cfg.target));
        }
      });
      if (cfg.initiallyHidden) arrow.container.visible = false;
      this.arrows.push(arrow);
      arrowIndexMap.set(arrow, i);
      // Track the up arrow so enter() can toggle visibility based on flags
      if (cfg.target === 'owls_overlook') this.upArrow = arrow;
      this.container.addChild(arrow.container);
    }

    // 12. Signpost (tappable visual element at center — above depthContainer)
    this.signpost = new Container();
    const signpostGraphic = new Graphics();
    // Post
    signpostGraphic.rect(632, 310, 16, 100);
    signpostGraphic.fill({ color: 0x8B6914 });
    signpostGraphic.stroke({ width: 2, color: 0x5C4A1E });
    // Cross piece
    signpostGraphic.rect(624, 306, 32, 8);
    signpostGraphic.fill({ color: 0xA0781E });
    signpostGraphic.stroke({ width: 1.5, color: 0x5C4A1E });
    this.signpost.addChild(signpostGraphic);

    const signLabel = new Text({
      text: 'Signpost',
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontSize: 12,
        fill: '#3E2723',
        align: 'center',
      }),
    });
    signLabel.anchor.set(0.5, 0);
    signLabel.position.set(640, 415);
    this.signpost.addChild(signLabel);

    this.signpost.eventMode = 'static';
    this.signpost.cursor = 'pointer';
    this.signpost.hitArea = { contains: (x: number, y: number) => {
      return x >= 610 && x <= 670 && y >= 280 && y <= 420;
    }};
    this.signpost.on('pointertap', () => {
      if (this.scruff.isMoving() || this.dialogueRunner.isActive()) return;
      // Set fast_travel_unlocked flag on first interaction
      if (!this.gameState.getFlag('fast_travel_unlocked')) {
        this.gameState.setFlag('fast_travel_unlocked');
      }
    });
    this.container.addChild(this.signpost);

    // 13. Item inspect card + tap handlers
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

    // 14. Ground tap handler (background receives taps)
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

    // 15. Debug overlay (above depthContainer)
    if (WalkableAreaDebug.isEnabled()) {
      const debug = new WalkableAreaDebug(
        this.walkableArea,
        sceneData.entryPoints as Record<string, number[]>,
        [this.sage],
        'central_trail',
        'central_trail',
        ['sage'],
        this.walkableArea.getObstacles(),
        this.foregrounds,
      );
      this.container.addChild(debug.container);

      const editor = new LayoutEditor(this.app, this.container, this.container);
      for (const [arrow, idx] of arrowIndexMap) {
        editor.attach({
          id: `arrow[${idx}]`,
          target: arrow.container,
          onDrop: async (x, y) => { arrowConfigs[idx].x = x; arrowConfigs[idx].y = y; await saveWalkableAreas(); },
        });
      }
      for (const [item, idx] of itemIndexMap) {
        editor.attach({
          id: `item[${idx}:${item.itemId}]`,
          target: item.container,
          color: 0xFFAA00,
          onDrop: async (x, y) => { itemConfigs[idx].x = x; itemConfigs[idx].y = y; await saveWalkableAreas(); },
        });
      }
    }

    // 16. Perch debug overlay (editable in debug mode)
    if (WalkableAreaDebug.isEnabled()) {
      const perchOverlay = new PerchDebugOverlay(this.perchSystem, 'central_trail', [1376, 768]);
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
      this.showDialogueLine(next, this.dialogueAnchor.x, this.dialogueAnchor.y);
    } else {
      this.dialogueBubble.hide();
      this.dialogueBubble.onSkip = null;
      this.lastDialogueId = null;
    }
  }

  enter(fromScene?: SceneId, exitDirection?: SceneDirection): void {
    const sceneData = (walkableAreasData as WalkableAreasJson).central_trail as Record<string, unknown>;
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

    // Set fast_travel_unlocked on first visit
    if (!this.gameState.getFlag('fast_travel_unlocked')) {
      this.gameState.setFlag('fast_travel_unlocked');
    }

    // Show/hide up arrow based on sunny_helped flag
    this.upArrow.container.visible = this.gameState.getFlag('sunny_helped');

    // Resume animated background
    this.animBg?.resume();
    this.ambientAudio.play();
    this.tryShowThought();
  }

  private tryShowThought(): void {
    if (this.dialogueRunner.isActive()) return;
    const id = pickThoughtId('central_trail', this.gameState);
    if (!id) return;
    const line = this.dialogueRunner.start(id);
    if (line) {
      this.scruff.setTalking(true);
      this.showDialogueLine(line, this.scruff.x, this.scruff.y - 130);
      this.gameState.markThoughtShown(id);
    }
  }

  update(_deltaMs: number): void {
    // NPC proximity excitement
    this.sage.setExcited(
      this.sage.isInRange(this.scruff.x, this.scruff.y),
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
      this.applyDepthScaling(this.depthScaleConfig, [this.scruff, this.sage]);
    }
    // Re-sort by Y
    this.sortDepth();
  }

  exit(): void {
    this.scruff.stop();
    this.dialogueBubble.hide();
    this.animBg?.pause();
    this.ambientAudio.pause();
  }
}
