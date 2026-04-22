import { Scene } from '../game/Scene';
import { pickThoughtId } from '../game/ThoughtPicker';
import { Scruff } from '../characters/Scruff';
import { NPC } from '../characters/NPC';
import { SceneArrow } from '../game/SceneArrow';
import { DialogueBubble, DialogueRunner } from '../game/DialogueSystem';
import { WalkableArea, resolveEntryPoint } from '../game/WalkableArea';
import { WalkableAreaDebug } from '../game/WalkableAreaDebug';
import { LayoutEditor, saveWalkableAreas } from '../game/LayoutEditor';
import { ForegroundObject } from '../game/ForegroundObject';
import { PerchSystem } from '../game/PerchSystem';
import { PerchDebugOverlay } from '../game/PerchDebugOverlay';
import { AmbientAudio } from '../game/AmbientAudio';
import { depthSort } from '../game/DepthSort';
import type { DepthScaleConfig } from '../game/DepthSort';
import { AnimatedBackground } from '../game/AnimatedBackground';
import { Container, Graphics, Sprite, Assets } from 'pixi.js';
import type { SceneId, FlagId, SceneDirection } from '../game/GameState';
import type { NPCConfig } from '../characters/NPC';
import dialogueData from '../data/dialogue.json';
import walkableAreasData from '../data/walkable-areas.json';
import npcConfigs from '../data/npc-configs.json';

type WalkableAreasJson = Record<string, Record<string, unknown>>;

export class TortoiseBurrow extends Scene {
  private scruff!: Scruff;
  private shelly!: NPC;
  private pip!: NPC;
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;
  private lastDialogueId: string | null = null;

  private surfaceWalkable!: WalkableArea;
  private undergroundWalkable!: WalkableArea;

  // Sub-area containers
  private surfaceContainer!: Container;
  private underground!: Container;
  private isUnderground = false;
  private burrowEntrance!: Graphics;

  // Depth containers for Y-sorting within each sub-area
  private undergroundDepthContainer!: Container;

  // Depth scale configs per sub-area
  private surfaceDepthScaleConfig: DepthScaleConfig | null = null;
  private undergroundDepthScaleConfig: DepthScaleConfig | null = null;

  // Foreground objects per sub-area
  private surfaceForegrounds: ForegroundObject[] = [];
  private undergroundForegrounds: ForegroundObject[] = [];
  private animBg: AnimatedBackground | null = null;
  private perchSystem = new PerchSystem();
  private ambientAudio = new AmbientAudio();

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId, dir?: SceneDirection) => void;

  async setup(): Promise<void> {
    const tbData = (walkableAreasData as WalkableAreasJson).tortoise_burrow as Record<string, Record<string, unknown>>;
    const surfaceData = tbData.surface as Record<string, unknown>;
    const undergroundData = tbData.underground as Record<string, unknown>;

    // Surface container holds all above-ground elements
    this.surfaceContainer = new Container();
    this.container.addChild(this.surfaceContainer);

    // 1. Background
    this.animBg = new AnimatedBackground(1280, 720);
    await this.animBg.load('tortoise-burrow', 'assets/backgrounds/tortoise-burrow-bg.png');
    const bg = this.animBg.sprite;
    this.surfaceContainer.addChild(bg);

    // 2. Surface depth container (Y-sorted every frame)
    this.depthContainer = new Container();
    this.surfaceContainer.addChild(this.depthContainer);

    // 3. Walkable areas with obstacles
    const surfPolyData = (surfaceData.polygons as { points: number[][] }[])[0];
    const surfObstacleData = (surfaceData.obstacles as { points: number[][] }[] | undefined) ?? [];
    this.surfaceWalkable = new WalkableArea(
      surfPolyData.points.map(([x, y]: number[]) => ({ x, y })),
      surfObstacleData.map((obs) => obs.points.map(([x, y]: number[]) => ({ x, y }))),
    );

    const ugPolyData = (undergroundData.polygons as { points: number[][] }[])[0];
    const ugObstacleData = (undergroundData.obstacles as { points: number[][] }[] | undefined) ?? [];
    this.undergroundWalkable = new WalkableArea(
      ugPolyData.points.map(([x, y]: number[]) => ({ x, y })),
      ugObstacleData.map((obs) => obs.points.map(([x, y]: number[]) => ({ x, y }))),
    );

    // 4. Surface depth scale config
    this.surfaceDepthScaleConfig = (surfaceData.depthScale as DepthScaleConfig | undefined) ?? null;

    // 5. Perch system + Scruff
    await this.perchSystem.load('tortoise_burrow');
    this.scruff = new Scruff(this.tweens);
    await this.scruff.setup();
    const start = resolveEntryPoint(surfaceData.entryPoints as Record<string, number[]>);
    this.scruff.setPosition(start.x, start.y);
    this.depthContainer.addChild(this.scruff.container);

    // 5b. Ambient audio with call sync
    await this.ambientAudio.load(
      'assets/sounds/scrub-jay-ambient.mp3',
      'assets/sounds/scrub-jay-calls.json',
      () => this.scruff.setTalking(true),
      () => this.scruff.setTalking(false),
    );

    // 6. Shelly NPC
    this.shelly = new NPC(npcConfigs.shelly as NPCConfig, this.tweens);
    await this.shelly.setup();
    this.depthContainer.addChild(this.shelly.container);

    // 7. Surface foreground objects
    const surfFgData = (surfaceData.foregrounds as { id: string; texturePath: string; x: number; y: number; depthY: number }[] | undefined) ?? [];
    for (const fgCfg of surfFgData) {
      const fg = new ForegroundObject(fgCfg);
      await fg.setup();
      this.surfaceForegrounds.push(fg);
      this.depthContainer.addChild(fg.container);
    }

    // 8. Shelly tap handler
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
            this.dialogueBubble.show(line, this.shelly.container.x, this.shelly.container.y - 120);
            this.updateTalkingState(line.speaker);
            this.dialogueBubble.onSkip = () => this.advanceDialogue();
          }
        });
    });

    // 9. Dialogue system
    this.dialogueRunner = new DialogueRunner(
      dialogueData as Record<string, (typeof dialogueData)[keyof typeof dialogueData]>,
      (flag: string) => this.gameState.getFlag(flag as FlagId),
      (flag: string) => this.gameState.setFlag(flag as FlagId),
    );
    this.dialogueBubble = new DialogueBubble(this.gameState);
    this.container.addChild(this.dialogueBubble.container);

    // 10. Navigation arrows (read from walkable-areas.json surface.arrows)
    const surfaceArrowConfigs = ((surfaceData.arrows as { direction: 'left'|'right'|'up'|'down'; target: SceneId; label: string; x: number; y: number; requiresFlag?: FlagId }[] | undefined) ?? []);
    const surfaceArrowIndexMap = new Map<SceneArrow, number>();
    for (let i = 0; i < surfaceArrowConfigs.length; i++) {
      const cfg = surfaceArrowConfigs[i];
      if (cfg.requiresFlag && !this.gameState.getFlag(cfg.requiresFlag)) continue;
      const arrow = new SceneArrow(cfg.direction, cfg.target, cfg.label, cfg.x, cfg.y, this.tweens);
      arrow.container.on('pointertap', () => {
        if (!this.scruff.isMoving() && !this.dialogueRunner.isActive()) {
          this.scruff.flyOffInDirection(cfg.direction).then(() => this.onSceneChange?.(cfg.target));
        }
      });
      this.arrows.push(arrow);
      surfaceArrowIndexMap.set(arrow, i);
      this.surfaceContainer.addChild(arrow.container);
    }

    // 11. Burrow entrance (position read from walkable-areas.json)
    const burrow = this.readBurrowConfig(surfaceData);
    this.burrowEntrance = new Graphics();
    this.burrowEntrance.ellipse(0, 0, burrow.rx, burrow.ry);
    this.burrowEntrance.fill({ color: 0x000000, alpha: 0.001 });
    this.burrowEntrance.position.set(burrow.x, burrow.y);
    this.burrowEntrance.eventMode = 'static';
    this.burrowEntrance.cursor = 'pointer';
    this.burrowEntrance.on('pointertap', () => {
      if (!this.isUnderground) {
        if (this.gameState.getFlag('shelly_helped')) {
          this.switchToUnderground();
        } else {
          // Hint that they need to help Shelly first
          const line = this.dialogueRunner.start('shelly_intro');
          if (line) {
            this.dialogueBubble.show(line, this.scruff.x, this.scruff.y - 100);
            this.updateTalkingState(line.speaker);
            this.dialogueBubble.onSkip = () => this.advanceDialogue();
          }
        }
      }
    });
    this.surfaceContainer.addChild(this.burrowEntrance);

    // Debug: draggable burrow entrance overlay + arrows; autosaves to walkable-areas.json
    if (WalkableAreaDebug.isEnabled()) {
      await this.setupBurrowDebug(burrow);
      const editor = new LayoutEditor(this.app, this.surfaceContainer, this.surfaceContainer);
      for (const [arrow, idx] of surfaceArrowIndexMap) {
        editor.attach({
          id: `arrow[${idx}]`,
          target: arrow.container,
          onDrop: async (x, y) => { surfaceArrowConfigs[idx].x = x; surfaceArrowConfigs[idx].y = y; await saveWalkableAreas(); },
        });
      }
    }

    // 12. Underground sub-area
    await this.setupUnderground(undergroundData);

    // 13. Ground tap handler (background receives taps)
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
        this.scruff.moveToConstrained(pos.x, pos.y, this.surfaceWalkable);
      }
    });

    // Debug overlay (surface)
    if (WalkableAreaDebug.isEnabled()) {
      const debug = new WalkableAreaDebug(
        this.surfaceWalkable,
        surfaceData.entryPoints as Record<string, number[]>,
        [this.shelly],
        'tortoise_burrow',
        'tortoise_burrow.surface',
        ['shelly'],
        this.surfaceWalkable.getObstacles(),
        this.surfaceForegrounds,
      );
      this.surfaceContainer.addChild(debug.container);
    }

    // Perch debug overlay (editable in debug mode)
    if (WalkableAreaDebug.isEnabled()) {
      const perchOverlay = new PerchDebugOverlay(this.perchSystem, 'tortoise_burrow', [1376, 768]);
      this.container.addChild(perchOverlay.container);
    }
  }

  private async setupUnderground(undergroundData: Record<string, unknown>): Promise<void> {
    this.underground = new Container();
    this.underground.visible = false;
    this.container.addChild(this.underground);

    // Underground background - illustrated burrow interior
    let ugBg: Sprite | Graphics;
    try {
      const ugTex = await Assets.load('assets/backgrounds/underground-bg.jpg');
      ugBg = new Sprite(ugTex);
      (ugBg as Sprite).width = 1280;
      (ugBg as Sprite).height = 720;
    } catch {
      ugBg = new Graphics();
      (ugBg as Graphics).rect(0, 0, 1280, 720);
      (ugBg as Graphics).fill({ color: 0x2D1B0E });
    }
    this.underground.addChild(ugBg);

    // Underground depth container (Y-sorted every frame)
    this.undergroundDepthContainer = new Container();
    this.underground.addChild(this.undergroundDepthContainer);

    // Underground depth scale config
    this.undergroundDepthScaleConfig = (undergroundData.depthScale as DepthScaleConfig | undefined) ?? null;

    // Pip NPC
    this.pip = new NPC(npcConfigs.pip as NPCConfig, this.tweens);
    await this.pip.setup();
    this.undergroundDepthContainer.addChild(this.pip.container);

    // Underground foreground objects
    const ugFgData = (undergroundData.foregrounds as { id: string; texturePath: string; x: number; y: number; depthY: number }[] | undefined) ?? [];
    for (const fgCfg of ugFgData) {
      const fg = new ForegroundObject(fgCfg);
      await fg.setup();
      this.undergroundForegrounds.push(fg);
      this.undergroundDepthContainer.addChild(fg.container);
    }

    // Pip tap handler
    this.pip.container.on('pointertap', () => {
      if (this.scruff.isMoving() || this.dialogueRunner.isActive()) return;
      this.scruff
        .moveTo(this.pip.container.x - 60, this.pip.container.y)
        .then(() => {
          const hasItem = this.gameState.hasItem('scrub_hickory_nuts');
          const isHelped = this.gameState.getFlag('pip_helped');
          const dialogueId = this.pip.getDialogueId(hasItem, isHelped);
          this.lastDialogueId = dialogueId;
          const line = this.dialogueRunner.start(dialogueId);
          if (line) {
            this.dialogueBubble.show(line, this.pip.container.x, this.pip.container.y - 100);
            this.updateTalkingState(line.speaker);
            this.dialogueBubble.onSkip = () => this.advanceDialogue();
          }
        });
    });

    // Back arrows (read from walkable-areas.json underground.arrows)
    const ugArrowConfigs = ((undergroundData.arrows as { direction: 'left'|'right'|'up'|'down'; target: SceneId; label: string; x: number; y: number; requiresFlag?: FlagId }[] | undefined) ?? []);
    const ugArrowIndexMap = new Map<SceneArrow, number>();
    for (let i = 0; i < ugArrowConfigs.length; i++) {
      const cfg = ugArrowConfigs[i];
      if (cfg.requiresFlag && !this.gameState.getFlag(cfg.requiresFlag)) continue;
      const arrow = new SceneArrow(cfg.direction, cfg.target, cfg.label, cfg.x, cfg.y, this.tweens);
      arrow.container.on('pointertap', () => {
        if (!this.scruff.isMoving() && !this.dialogueRunner.isActive()) {
          this.switchToSurface();
        }
      });
      ugArrowIndexMap.set(arrow, i);
      this.underground.addChild(arrow.container);
    }
    if (WalkableAreaDebug.isEnabled()) {
      const editor = new LayoutEditor(this.app, this.underground, this.underground);
      for (const [arrow, idx] of ugArrowIndexMap) {
        editor.attach({
          id: `arrow[${idx}]`,
          target: arrow.container,
          onDrop: async (x, y) => { ugArrowConfigs[idx].x = x; ugArrowConfigs[idx].y = y; await saveWalkableAreas(); },
        });
      }
    }

    // Underground ground tap handler
    ugBg.eventMode = 'static';
    ugBg.on('pointertap', (e) => {
      if (this.scruff.isMoving()) return;

      // While dialogue is active, advance it on tap (blocked until voice ends)
      if (this.dialogueRunner.isActive()) {
        if (this.dialogueBubble.canAdvance()) this.advanceDialogue();
        return;
      }

      const pos = e.getLocalPosition(this.underground);
      // Constrain movement to underground walkable area
      this.scruff.moveToConstrained(pos.x, pos.y, this.undergroundWalkable);
    });

    // Debug overlay (underground)
    if (WalkableAreaDebug.isEnabled()) {
      const ugDebug = new WalkableAreaDebug(
        this.undergroundWalkable,
        undergroundData.entryPoints as Record<string, number[]>,
        [this.pip],
        'tortoise_burrow',
        'tortoise_burrow.underground',
        ['pip'],
        this.undergroundWalkable.getObstacles(),
        this.undergroundForegrounds,
      );
      this.underground.addChild(ugDebug.container);
    }
  }

  /** Burrow ellipse position + radii, sourced from walkable-areas.json. */
  private readBurrowConfig(surfaceData: Record<string, unknown>): { x: number; y: number; rx: number; ry: number } {
    const raw = surfaceData.burrow as Partial<{ x: number; y: number; rx: number; ry: number }> | undefined;
    return {
      x: raw?.x ?? 670,
      y: raw?.y ?? 380,
      rx: raw?.rx ?? 90,
      ry: raw?.ry ?? 55,
    };
  }

  /** Debug-mode draggable burrow ellipse. Drag to reposition (autosaves on drop);
   *  tap without dragging still triggers the underground transition. */
  private async setupBurrowDebug(burrow: { x: number; y: number; rx: number; ry: number }): Promise<void> {
    const { Text, TextStyle } = await import('pixi.js');
    this.surfaceContainer.sortableChildren = true;

    // Visible magenta ellipse + full-ellipse hit area
    const rx = burrow.rx, ry = burrow.ry;
    this.burrowEntrance.clear();
    this.burrowEntrance.ellipse(0, 0, rx, ry);
    this.burrowEntrance.fill({ color: 0xFF00FF, alpha: 0.25 });
    this.burrowEntrance.ellipse(0, 0, rx, ry);
    this.burrowEntrance.stroke({ width: 3, color: 0xFF00FF, alpha: 0.9 });
    this.burrowEntrance.hitArea = {
      contains: (x: number, y: number) => (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1,
    };
    this.burrowEntrance.zIndex = 10000;
    this.burrowEntrance.cursor = 'grab';

    const label = new Text({
      text: `Burrow (${burrow.x}, ${burrow.y})`,
      style: new TextStyle({
        fontSize: 14,
        fill: '#FF00FF',
        fontWeight: 'bold',
        stroke: { color: 0x000000, width: 3 },
      }),
    });
    label.position.set(burrow.x + rx + 8, burrow.y - 8);
    label.zIndex = 10001;
    this.surfaceContainer.addChild(label);

    // Swap the tap handler (underground transition) for a drag-or-tap handler
    this.burrowEntrance.removeAllListeners();

    let dragging = false;
    let moved = false;
    let offX = 0, offY = 0;
    const DRAG_THRESHOLD = 3; // px — distinguish tap vs drag

    this.burrowEntrance.on('pointerdown', (e) => {
      const local = e.getLocalPosition(this.surfaceContainer);
      offX = local.x - this.burrowEntrance.position.x;
      offY = local.y - this.burrowEntrance.position.y;
      dragging = true;
      moved = false;
      this.burrowEntrance.cursor = 'grabbing';
      e.stopPropagation();
      console.info('[burrow] pointerdown at', Math.round(local.x), Math.round(local.y));
    });

    this.burrowEntrance.on('globalpointermove', (e) => {
      if (!dragging) return;
      const local = e.getLocalPosition(this.surfaceContainer);
      const nx = local.x - offX;
      const ny = local.y - offY;
      const dx = nx - this.burrowEntrance.position.x;
      const dy = ny - this.burrowEntrance.position.y;
      if (!moved && (dx * dx + dy * dy) >= DRAG_THRESHOLD * DRAG_THRESHOLD) moved = true;
      this.burrowEntrance.position.set(nx, ny);
      label.text = `Burrow (${Math.round(nx)}, ${Math.round(ny)})`;
      label.position.set(nx + rx + 8, ny - 8);
    });

    const drop = async () => {
      if (!dragging) return;
      dragging = false;
      this.burrowEntrance.cursor = 'grab';
      const nx = Math.round(this.burrowEntrance.position.x);
      const ny = Math.round(this.burrowEntrance.position.y);
      if (moved) {
        burrow.x = nx;
        burrow.y = ny;
        console.info('[burrow] drop at', nx, ny);
        try {
          await this.saveBurrowConfig(burrow);
          console.info('[burrow] saved');
        } catch (err) {
          console.warn('[burrow] save failed', err);
        }
      } else if (!this.isUnderground) {
        // Treat as tap: same behavior as the non-debug pointertap handler
        if (this.gameState.getFlag('shelly_helped')) {
          this.switchToUnderground();
        } else {
          const line = this.dialogueRunner.start('shelly_intro');
          if (line) {
            this.dialogueBubble.show(line, this.scruff.x, this.scruff.y - 100);
            this.updateTalkingState(line.speaker);
            this.dialogueBubble.onSkip = () => this.advanceDialogue();
          }
        }
      }
    };
    this.burrowEntrance.on('pointerup', drop);
    this.burrowEntrance.on('pointerupoutside', drop);
  }

  /** Persist burrow position to src/data/walkable-areas.json via the dev plugin. */
  private async saveBurrowConfig(burrow: { x: number; y: number; rx: number; ry: number }): Promise<void> {
    const surface = (walkableAreasData as WalkableAreasJson).tortoise_burrow.surface as Record<string, unknown>;
    surface.burrow = burrow;
    await saveWalkableAreas();
  }

  /** Advance current dialogue, showing next line or ending it. */
  private advanceDialogue(): void {
    const nextLine = this.dialogueRunner.next();
    if (nextLine) {
      // Position bubble relative to whoever is speaking
      const speakerContainer = this.isUnderground
        ? this.pip.container
        : this.shelly.container;
      const yOffset = this.isUnderground ? -100 : -120;
      this.dialogueBubble.show(nextLine, speakerContainer.x, speakerContainer.y + yOffset);
      this.updateTalkingState(nextLine.speaker);
    } else {
      this.dialogueBubble.hide();
      this.dialogueBubble.onSkip = null;
      this.updateTalkingState(null);
      void this.handleDialogueEnd();
    }
  }

  /** Toggle talking bob on the speaking NPC; stops all when null. */
  private updateTalkingState(speaker: string | null): void {
    this.shelly?.setTalking(speaker === 'Shelly');
    this.pip?.setTalking(speaker === 'Pip');
    if (speaker === 'Scruff') this.scruff.setTalking(true);
    else this.scruff.setTalking(false);
  }

  private switchToUnderground(): void {
    this.isUnderground = true;
    this.dialogueBubble.hide();

    // Move scruff from surface depth container to underground depth container
    this.depthContainer!.removeChild(this.scruff.container);
    this.undergroundDepthContainer.addChild(this.scruff.container);
    const tbData = (walkableAreasData as WalkableAreasJson).tortoise_burrow as Record<string, Record<string, unknown>>;
    const ugEntry = resolveEntryPoint(
      tbData.underground.entryPoints as Record<string, number[]>,
    );
    this.scruff.setPosition(ugEntry.x, ugEntry.y);

    // Toggle visibility
    this.surfaceContainer.visible = false;
    this.underground.visible = true;

    // Ensure dialogue bubble stays on top
    this.container.removeChild(this.dialogueBubble.container);
    this.container.addChild(this.dialogueBubble.container);
  }

  private switchToSurface(): void {
    this.isUnderground = false;
    this.dialogueBubble.hide();

    // Move scruff back to surface depth container
    this.undergroundDepthContainer.removeChild(this.scruff.container);
    this.depthContainer!.addChild(this.scruff.container);
    const tbData = (walkableAreasData as WalkableAreasJson).tortoise_burrow as Record<string, Record<string, unknown>>;
    const sfEntry = resolveEntryPoint(
      tbData.surface.entryPoints as Record<string, number[]>,
    );
    this.scruff.setPosition(sfEntry.x, sfEntry.y);

    // Toggle visibility
    this.underground.visible = false;
    this.surfaceContainer.visible = true;

    // Ensure dialogue bubble stays on top
    this.container.removeChild(this.dialogueBubble.container);
    this.container.addChild(this.dialogueBubble.container);
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

    // If the last dialogue was pip_has_item and pip isn't helped yet, process the item exchange
    if (
      this.lastDialogueId === 'pip_has_item' &&
      this.gameState.hasItem('scrub_hickory_nuts') &&
      !this.gameState.getFlag('pip_helped')
    ) {
      this.gameState.removeItem('scrub_hickory_nuts');
      this.gameState.addItem('pip_map');
      this.gameState.setFlag('pip_helped');
      await this.pip.playHappy();
    }

    this.lastDialogueId = null;
  }

  enter(fromScene?: SceneId, exitDirection?: SceneDirection): void {
    // Always return to surface view when entering the scene
    if (this.isUnderground) {
      this.switchToSurface();
    }
    // Position Scruff based on which scene she came from
    const surfaceData = (walkableAreasData as WalkableAreasJson).tortoise_burrow.surface as Record<string, unknown>;
    const entry = resolveEntryPoint(surfaceData.entryPoints as Record<string, number[]>, fromScene);
    
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

    // Enable burrow entrance if shelly has been helped
    if (this.gameState.getFlag('shelly_helped')) {
      this.burrowEntrance.eventMode = 'static';
    }

    this.animBg?.resume();
    this.ambientAudio.play();
    this.tryShowThought();
  }

  private tryShowThought(): void {
    if (this.dialogueRunner.isActive()) return;
    const id = pickThoughtId('tortoise_burrow', this.gameState);
    if (!id) return;
    const line = this.dialogueRunner.start(id);
    if (line) {
      this.scruff.setTalking(true);
      this.dialogueBubble.show(line, this.scruff.x, this.scruff.y - 130);
            this.updateTalkingState(line.speaker);
      this.dialogueBubble.onSkip = () => this.advanceDialogue();
      this.gameState.markThoughtShown(id);
    }
  }

  update(_deltaMs: number): void {
    if (this.isUnderground) {
      // NPC proximity excitement for Pip
      this.pip.setExcited(
        this.pip.isInRange(this.scruff.x, this.scruff.y),
      );

      // Apply underground depth scaling
      if (this.undergroundDepthScaleConfig) {
        this.applyDepthScaling(this.undergroundDepthScaleConfig, [this.scruff, this.pip]);
      }
      // Re-sort underground depth container by Y
      depthSort(this.undergroundDepthContainer);
    } else {
      // NPC proximity excitement for Shelly
      this.shelly.setExcited(
        this.shelly.isInRange(this.scruff.x, this.scruff.y),
      );

      // Apply surface depth scaling
      if (this.surfaceDepthScaleConfig) {
        this.applyDepthScaling(this.surfaceDepthScaleConfig, [this.scruff, this.shelly]);
      }
      // Re-sort surface depth container by Y
      this.sortDepth();
    }
  }

  exit(): void {
    this.scruff.stop();
    this.animBg?.pause();
    this.ambientAudio.pause();
    this.dialogueBubble.hide();
  }
}
