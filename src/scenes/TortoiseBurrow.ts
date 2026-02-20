import { Scene } from '../game/Scene';
import { Scruff } from '../characters/Scruff';
import { NPC } from '../characters/NPC';
import { SceneArrow } from '../game/SceneArrow';
import { DialogueBubble, DialogueRunner } from '../game/DialogueSystem';
import { Container, Graphics, Sprite, Assets } from 'pixi.js';
import type { SceneId, FlagId } from '../game/GameState';
import dialogueData from '../data/dialogue.json';

export class TortoiseBurrow extends Scene {
  private scruff!: Scruff;
  private shelly!: NPC;
  private pip!: NPC;
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;
  private lastDialogueId: string | null = null;

  // Underground sub-area
  private surfaceContainer!: Container;
  private underground!: Container;
  private isUnderground = false;
  private burrowEntrance!: Graphics;

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId) => void;

  async setup(): Promise<void> {
    // Surface container holds all above-ground elements
    this.surfaceContainer = new Container();
    this.container.addChild(this.surfaceContainer);

    // 1. Background
    const bgTexture = await Assets.load('assets/backgrounds/tortoise-burrow-bg.svg');
    const bg = new Sprite(bgTexture);
    bg.width = 1280;
    bg.height = 720;
    this.surfaceContainer.addChild(bg);

    // 2. Scruff
    this.scruff = new Scruff(this.tweens);
    await this.scruff.setup();
    this.scruff.setPosition(640, 580);
    this.surfaceContainer.addChild(this.scruff.container);

    // 3. Shelly NPC
    this.shelly = new NPC(
      {
        id: 'shelly',
        name: 'Shelly',
        texturePath: 'assets/characters/shelly.svg',
        width: 120,
        height: 100,
        x: 500,
        y: 500,
        dialogueDefault: 'shelly_intro',
        dialogueHasItem: 'shelly_has_item',
        dialogueAfter: 'shelly_after',
        wantsItem: 'saw_palmetto_fronds',
        helpedFlag: 'shelly_helped',
      },
      this.tweens,
    );
    await this.shelly.setup();
    this.surfaceContainer.addChild(this.shelly.container);

    // 4. Shelly tap handler
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

    // 5. Dialogue system
    this.dialogueRunner = new DialogueRunner(
      dialogueData as Record<string, (typeof dialogueData)[keyof typeof dialogueData]>,
      (flag: string) => this.gameState.getFlag(flag as FlagId),
    );
    this.dialogueBubble = new DialogueBubble();
    this.container.addChild(this.dialogueBubble.container);

    // 6. Navigation arrows
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

    // 7. Burrow entrance (dark oval, tappable when shelly_helped)
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

    // 8. Underground sub-area
    await this.setupUnderground();

    // 9. Ground tap handler (background receives taps)
    bg.eventMode = 'static';
    bg.on('pointertap', (e) => {
      if (this.scruff.isMoving()) return;

      // While dialogue is active, advance it on tap
      if (this.dialogueRunner.isActive()) {
        this.advanceDialogue();
        return;
      }

      const pos = e.getLocalPosition(this.container);
      // Only allow movement in the ground area
      if (pos.y > 300) {
        this.scruff.moveTo(pos.x, pos.y);
      }
    });
  }

  private async setupUnderground(): Promise<void> {
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

    // Pip NPC
    this.pip = new NPC(
      {
        id: 'pip',
        name: 'Pip',
        texturePath: 'assets/characters/pip.svg',
        width: 60,
        height: 80,
        x: 500,
        y: 450,
        dialogueDefault: 'pip_intro',
        dialogueHasItem: 'pip_has_item',
        dialogueAfter: 'pip_after',
        wantsItem: 'scrub_hickory_nuts',
        helpedFlag: 'pip_helped',
      },
      this.tweens,
    );
    await this.pip.setup();
    this.underground.addChild(this.pip.container);

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

    // Back arrow to return to surface
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
      // Allow movement in the underground area (below the ceiling roots)
      if (pos.y > 150) {
        this.scruff.moveTo(pos.x, pos.y);
      }
    });
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

    // Move scruff from surface container to underground container
    this.surfaceContainer.removeChild(this.scruff.container);
    this.underground.addChild(this.scruff.container);
    this.scruff.setPosition(640, 550);

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

    // Move scruff back to surface container
    this.underground.removeChild(this.scruff.container);
    this.surfaceContainer.addChild(this.scruff.container);
    this.scruff.setPosition(640, 580);

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

  enter(): void {
    // Always return to surface view when entering the scene
    if (this.isUnderground) {
      this.switchToSurface();
    }
    // Reset Scruff position when entering
    this.scruff.setPosition(640, 580);

    // Enable burrow entrance if shelly has been helped
    if (this.gameState.getFlag('shelly_helped')) {
      this.burrowEntrance.eventMode = 'static';
    }
  }

  update(_deltaMs: number): void {
    if (this.isUnderground) {
      // NPC proximity excitement for Pip
      this.pip.setExcited(
        this.pip.isInRange(this.scruff.x, this.scruff.y),
      );
    } else {
      // NPC proximity excitement for Shelly
      this.shelly.setExcited(
        this.shelly.isInRange(this.scruff.x, this.scruff.y),
      );
    }
  }

  exit(): void {
    this.dialogueBubble.hide();
  }
}
