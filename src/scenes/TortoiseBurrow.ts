import { Scene } from '../game/Scene';
import { Scruff } from '../characters/Scruff';
import { NPC } from '../characters/NPC';
import { SceneArrow } from '../game/SceneArrow';
import { DialogueBubble, DialogueRunner } from '../game/DialogueSystem';
import { WalkableArea, resolveEntryPoint } from '../game/WalkableArea';
import { WalkableAreaDebug } from '../game/WalkableAreaDebug';
import { ForegroundObject } from '../game/ForegroundObject';
import { depthSort } from '../game/DepthSort';
import type { DepthScaleConfig } from '../game/DepthSort';
import { AnimatedBackground } from '../game/AnimatedBackground';
import { Container, Graphics, Sprite, Assets } from 'pixi.js';
import type { SceneId, FlagId } from '../game/GameState';
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

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId) => void;

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

    // 5. Scruff
    this.scruff = new Scruff(this.tweens);
    await this.scruff.setup();
    const start = resolveEntryPoint(surfaceData.entryPoints as Record<string, number[]>);
    this.scruff.setPosition(start.x, start.y);
    this.depthContainer.addChild(this.scruff.container);

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
            this.dialogueBubble.show(
              line.speaker,
              line.text,
              this.shelly.container.x,
              this.shelly.container.y - 120,
            );
          }
        });
    });

    // 9. Dialogue system
    this.dialogueRunner = new DialogueRunner(
      dialogueData as Record<string, (typeof dialogueData)[keyof typeof dialogueData]>,
      (flag: string) => this.gameState.getFlag(flag as FlagId),
    );
    this.dialogueBubble = new DialogueBubble();
    this.container.addChild(this.dialogueBubble.container);

    // 10. Navigation arrows (above depthContainer, on surfaceContainer)
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
    this.surfaceContainer.addChild(downArrow.container);

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
    this.surfaceContainer.addChild(upArrow.container);

    // 11. Burrow entrance (dark oval, tappable when shelly_helped)
    this.burrowEntrance = new Graphics();
    this.burrowEntrance.ellipse(560, 500, 50, 30);
    this.burrowEntrance.fill({ color: 0x1a0f00 });
    this.burrowEntrance.eventMode = 'none'; // disabled by default
    this.burrowEntrance.cursor = 'pointer';
    this.burrowEntrance.on('pointertap', () => {
      if (this.gameState.getFlag('shelly_helped') && !this.isUnderground) {
        this.switchToUnderground();
      }
    });
    this.surfaceContainer.addChild(this.burrowEntrance);

    // 12. Underground sub-area
    await this.setupUnderground(undergroundData);

    // 13. Ground tap handler (background receives taps)
    bg.eventMode = 'static';
    bg.on('pointertap', (e) => {
      if (this.scruff.isMoving()) return;

      // While dialogue is active, advance it on tap
      if (this.dialogueRunner.isActive()) {
        this.advanceDialogue();
        return;
      }

      const pos = e.getLocalPosition(this.container);
      // Constrain movement to walkable area
      this.scruff.moveToConstrained(pos.x, pos.y, this.surfaceWalkable);
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
  }

  private async setupUnderground(undergroundData: Record<string, unknown>): Promise<void> {
    this.underground = new Container();
    this.underground.visible = false;
    this.container.addChild(this.underground);

    // Underground background - dark brown earth
    const ugBg = new Graphics();
    ugBg.rect(0, 0, 1280, 720);
    ugBg.fill({ color: 0x2D1B0E });
    this.underground.addChild(ugBg);

    // Root decorations across the ceiling
    const roots = new Graphics();
    roots.moveTo(100, 50);
    roots.bezierCurveTo(300, 80, 500, 20, 700, 60);
    roots.moveTo(400, 30);
    roots.bezierCurveTo(600, 70, 800, 10, 1100, 50);
    roots.moveTo(200, 70);
    roots.bezierCurveTo(400, 40, 600, 90, 900, 45);
    roots.stroke({ width: 4, color: 0x5C3D1E });
    this.underground.addChild(roots);

    // Light area in center (slightly lighter brown)
    const lightArea = new Graphics();
    lightArea.ellipse(640, 400, 300, 200);
    lightArea.fill({ color: 0x3E2A14, alpha: 0.5 });
    this.underground.addChild(lightArea);

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
            this.dialogueBubble.show(
              line.speaker,
              line.text,
              this.pip.container.x,
              this.pip.container.y - 100,
            );
          }
        });
    });

    // Back arrow to return to surface (above depth container, on underground)
    const backArrow = new SceneArrow(
      'up',
      'tortoise_burrow',
      'Go Up',
      620,
      30,
      this.tweens,
    );
    backArrow.container.on('pointertap', () => {
      if (!this.scruff.isMoving() && !this.dialogueRunner.isActive()) {
        this.switchToSurface();
      }
    });
    this.underground.addChild(backArrow.container);

    // Underground ground tap handler
    ugBg.eventMode = 'static';
    ugBg.on('pointertap', (e) => {
      if (this.scruff.isMoving()) return;

      // While dialogue is active, advance it on tap
      if (this.dialogueRunner.isActive()) {
        this.advanceDialogue();
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

  /** Advance current dialogue, showing next line or ending it. */
  private advanceDialogue(): void {
    const nextLine = this.dialogueRunner.next();
    if (nextLine) {
      // Position bubble relative to whoever is speaking
      const speakerContainer = this.isUnderground
        ? this.pip.container
        : this.shelly.container;
      const yOffset = this.isUnderground ? -100 : -120;
      this.dialogueBubble.show(
        nextLine.speaker,
        nextLine.text,
        speakerContainer.x,
        speakerContainer.y + yOffset,
      );
    } else {
      this.dialogueBubble.hide();
      this.handleDialogueEnd();
    }
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
      // Enable burrow entrance now that shelly is helped
      this.burrowEntrance.eventMode = 'static';
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

  enter(fromScene?: SceneId): void {
    // Always return to surface view when entering the scene
    if (this.isUnderground) {
      this.switchToSurface();
    }
    // Position Scruff based on which scene she came from
    const surfaceData = (walkableAreasData as WalkableAreasJson).tortoise_burrow.surface as Record<string, unknown>;
    const entry = resolveEntryPoint(surfaceData.entryPoints as Record<string, number[]>, fromScene);
    this.scruff.setPosition(entry.x, entry.y);

    // Enable burrow entrance if shelly has been helped
    if (this.gameState.getFlag('shelly_helped')) {
      this.burrowEntrance.eventMode = 'static';
    }

    this.animBg?.resume();
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
    this.animBg?.pause();
    this.dialogueBubble.hide();
  }
}
