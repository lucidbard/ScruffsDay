import { Scene } from '../game/Scene';
import { Scruff } from '../characters/Scruff';
import { NPC } from '../characters/NPC';
import { InteractiveItem } from '../game/InteractiveItem';
import { SceneArrow } from '../game/SceneArrow';
import { DialogueBubble, DialogueRunner } from '../game/DialogueSystem';
import { Sprite, Assets, Graphics, Container, Text, TextStyle } from 'pixi.js';
import type { SceneId, FlagId } from '../game/GameState';
import dialogueData from '../data/dialogue.json';

export class CentralTrail extends Scene {
  private scruff!: Scruff;
  private sage!: NPC;
  private items: InteractiveItem[] = [];
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;
  private lastDialogueId: string | null = null;
  private upArrow!: SceneArrow;
  private signpost!: Container;

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId) => void;

  async setup(): Promise<void> {
    // 1. Background
    const bgTexture = await Assets.load('assets/backgrounds/central-trail-bg.svg');
    const bg = new Sprite(bgTexture);
    bg.width = 1280;
    bg.height = 720;
    this.container.addChild(bg);

    // 2. Scruff
    this.scruff = new Scruff(this.tweens);
    await this.scruff.setup();
    this.scruff.setPosition(640, 580);
    this.container.addChild(this.scruff.container);

    // 3. Sage the Owl NPC
    this.sage = new NPC(
      {
        id: 'sage',
        name: 'Sage',
        texturePath: 'assets/characters/sage.svg',
        width: 100,
        height: 140,
        x: 900,
        y: 400,
        dialogueDefault: 'sage_intro',
        dialogueHasItem: null,
        dialogueAfter: null,
        wantsItem: null,
        helpedFlag: null,
      },
      this.tweens,
    );
    await this.sage.setup();
    this.container.addChild(this.sage.container);

    // 4. Sage tap handler
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

    // 5. Collectible items (only if not already in inventory)
    if (!this.gameState.hasItem('chapman_oak_acorns')) {
      const acorns = new InteractiveItem(
        {
          itemId: 'chapman_oak_acorns',
          texturePath: 'assets/items/chapman-oak-acorns.svg',
          x: 200,
          y: 480,
        },
        this.tweens,
      );
      await acorns.setup();
      this.items.push(acorns);
      this.container.addChild(acorns.container);
    }

    if (!this.gameState.hasItem('scrub_hickory_nuts')) {
      const nuts = new InteractiveItem(
        {
          itemId: 'scrub_hickory_nuts',
          texturePath: 'assets/items/scrub-hickory-nuts.svg',
          x: 700,
          y: 500,
        },
        this.tweens,
      );
      await nuts.setup();
      this.items.push(nuts);
      this.container.addChild(nuts.container);
    }

    // 6. Dialogue system
    this.dialogueRunner = new DialogueRunner(
      dialogueData as Record<string, (typeof dialogueData)[keyof typeof dialogueData]>,
      (flag: string) => this.gameState.getFlag(flag as FlagId),
    );
    this.dialogueBubble = new DialogueBubble();
    this.container.addChild(this.dialogueBubble.container);

    // 7. Navigation arrows (4 directions)

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

    // 8. Signpost (tappable visual element at center)
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

    // 9. Item tap handlers
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

    // 10. Ground tap handler (background receives taps)
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
      // Only allow movement in the ground area
      if (pos.y > 300) {
        this.scruff.moveTo(pos.x, pos.y);
      }
    });
  }

  enter(): void {
    // Reset Scruff position when entering
    this.scruff.setPosition(640, 580);

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
  }

  exit(): void {
    this.dialogueBubble.hide();
  }
}
