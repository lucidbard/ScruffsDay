import { Scene } from '../game/Scene';
import { Scruff } from '../characters/Scruff';
import { NPC } from '../characters/NPC';
import { InteractiveItem } from '../game/InteractiveItem';
import { SceneArrow } from '../game/SceneArrow';
import { DialogueBubble, DialogueRunner } from '../game/DialogueSystem';
import { WalkableArea, resolveEntryPoint } from '../game/WalkableArea';
import { WalkableAreaDebug } from '../game/WalkableAreaDebug';
import { ForegroundObject } from '../game/ForegroundObject';
import type { DepthScaleConfig } from '../game/DepthSort';
import { Sprite, Assets, Graphics, Container, Text, TextStyle } from 'pixi.js';
import type { SceneId, FlagId } from '../game/GameState';
import type { NPCConfig } from '../characters/NPC';
import dialogueData from '../data/dialogue.json';
import walkableAreasData from '../data/walkable-areas.json';
import npcConfigs from '../data/npc-configs.json';

type WalkableAreasJson = Record<string, Record<string, unknown>>;

export class CentralTrail extends Scene {
  private scruff!: Scruff;
  private sage!: NPC;
  private items: InteractiveItem[] = [];
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;
  private lastDialogueId: string | null = null;
  private walkableArea!: WalkableArea;
  private upArrow!: SceneArrow;
  private signpost!: Container;
  private depthScaleConfig: DepthScaleConfig | null = null;
  private foregrounds: ForegroundObject[] = [];

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId) => void;

  async setup(): Promise<void> {
    const sceneData = (walkableAreasData as WalkableAreasJson).central_trail as Record<string, unknown>;

    // 1. Background
    const bgTexture = await Assets.load('assets/backgrounds/central-trail-bg.png');
    const bg = new Sprite(bgTexture);
    bg.width = 1280;
    bg.height = 720;
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

    // 5. Scruff
    this.scruff = new Scruff(this.tweens);
    await this.scruff.setup();
    const start = resolveEntryPoint(sceneData.entryPoints as Record<string, number[]>);
    this.scruff.setPosition(start.x, start.y);
    this.depthContainer.addChild(this.scruff.container);

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
            this.dialogueBubble.show(
              line.speaker,
              line.text,
              this.sage.container.x,
              this.sage.container.y - 160,
            );
          }
        });
    });

    // 8. Collectible items (only if not already in inventory)
    if (!this.gameState.hasItem('chapman_oak_acorns')) {
      const acorns = new InteractiveItem(
        {
          itemId: 'chapman_oak_acorns',
          texturePath: 'assets/items/chapman-oak-acorns.png',
          x: 200,
          y: 480,
        },
        this.tweens,
      );
      await acorns.setup();
      this.items.push(acorns);
      this.depthContainer.addChild(acorns.container);
    }

    if (!this.gameState.hasItem('scrub_hickory_nuts')) {
      const nuts = new InteractiveItem(
        {
          itemId: 'scrub_hickory_nuts',
          texturePath: 'assets/items/scrub-hickory-nuts.png',
          x: 700,
          y: 500,
        },
        this.tweens,
      );
      await nuts.setup();
      this.items.push(nuts);
      this.depthContainer.addChild(nuts.container);
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
    );
    this.dialogueBubble = new DialogueBubble();
    this.container.addChild(this.dialogueBubble.container);

    // 11. Navigation arrows (above depthContainer)

    // Down -> Tortoise Burrow
    const downArrow = new SceneArrow(
      'down',
      'tortoise_burrow',
      'Tortoise Burrow',
      620,
      660,
      this.tweens,
    );
    downArrow.container.on('pointertap', () => {
      if (!this.scruff.isMoving() && !this.dialogueRunner.isActive()) {
        this.onSceneChange?.('tortoise_burrow');
      }
    });
    this.arrows.push(downArrow);
    this.container.addChild(downArrow.container);

    // Left -> Pine Clearing
    const leftArrow = new SceneArrow(
      'left',
      'pine_clearing',
      'Pine Clearing',
      30,
      360,
      this.tweens,
    );
    leftArrow.container.on('pointertap', () => {
      if (!this.scruff.isMoving() && !this.dialogueRunner.isActive()) {
        this.onSceneChange?.('pine_clearing');
      }
    });
    this.arrows.push(leftArrow);
    this.container.addChild(leftArrow.container);

    // Right -> Sandy Barrens
    const rightArrow = new SceneArrow(
      'right',
      'sandy_barrens',
      'Sandy Barrens',
      1210,
      360,
      this.tweens,
    );
    rightArrow.container.on('pointertap', () => {
      if (!this.scruff.isMoving() && !this.dialogueRunner.isActive()) {
        this.onSceneChange?.('sandy_barrens');
      }
    });
    this.arrows.push(rightArrow);
    this.container.addChild(rightArrow.container);

    // Up -> Owl's Overlook (conditionally visible)
    this.upArrow = new SceneArrow(
      'up',
      'owls_overlook',
      "Owl's Overlook",
      620,
      30,
      this.tweens,
    );
    this.upArrow.container.on('pointertap', () => {
      if (!this.scruff.isMoving() && !this.dialogueRunner.isActive()) {
        this.onSceneChange?.('owls_overlook');
      }
    });
    this.arrows.push(this.upArrow);
    this.container.addChild(this.upArrow.container);
    // Initially hidden; shown in enter() if sunny_helped is set
    this.upArrow.container.visible = false;

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

    // 13. Item tap handlers
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

    // 14. Ground tap handler (background receives taps)
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
            this.sage.container.x,
            this.sage.container.y - 160,
          );
        } else {
          this.dialogueBubble.hide();
          this.lastDialogueId = null;
        }
        return;
      }

      const pos = e.getLocalPosition(this.container);
      // Constrain movement to walkable area
      this.scruff.moveToConstrained(pos.x, pos.y, this.walkableArea);
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
    }
  }

  enter(fromScene?: SceneId): void {
    const sceneData = (walkableAreasData as WalkableAreasJson).central_trail as Record<string, unknown>;
    // Position Scruff based on which scene she came from
    const entry = resolveEntryPoint(sceneData.entryPoints as Record<string, number[]>, fromScene);
    this.scruff.setPosition(entry.x, entry.y);

    // Set fast_travel_unlocked on first visit
    if (!this.gameState.getFlag('fast_travel_unlocked')) {
      this.gameState.setFlag('fast_travel_unlocked');
    }

    // Show/hide up arrow based on sunny_helped flag
    this.upArrow.container.visible = this.gameState.getFlag('sunny_helped');
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
    this.dialogueBubble.hide();
  }
}
