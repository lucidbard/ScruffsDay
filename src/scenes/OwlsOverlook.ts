import { Scene } from '../game/Scene';
import { Scruff } from '../characters/Scruff';
import { NPC } from '../characters/NPC';
import { SceneArrow } from '../game/SceneArrow';
import { DialogueBubble, DialogueRunner } from '../game/DialogueSystem';
import { Sprite, Assets, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { SceneId, FlagId } from '../game/GameState';
import { NightWatch } from '../minigames/NightWatch';
import { Easing } from '../game/Tween';
import dialogueData from '../data/dialogue.json';

export class OwlsOverlook extends Scene {
  private scruff!: Scruff;
  private sage!: NPC;
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;
  private lastDialogueId: string | null = null;
  private activeMinigame: NightWatch | null = null;

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId) => void;

  async setup(): Promise<void> {
    // 1. Background
    const bgTexture = await Assets.load('assets/backgrounds/owls-overlook-bg.png');
    const bg = new Sprite(bgTexture);
    bg.width = 1280;
    bg.height = 720;
    this.container.addChild(bg);

    // 2. Scruff
    this.scruff = new Scruff(this.tweens);
    await this.scruff.setup();
    this.scruff.setPosition(640, 620);
    this.container.addChild(this.scruff.container);

    // 3. Sage NPC (owl) - perched on the dead tree
    this.sage = new NPC(
      {
        id: 'sage',
        name: 'Sage',
        texturePath: 'assets/characters/sage.png',
        width: 100,
        height: 140,
        x: 640,
        y: 420,
        dialogueDefault: 'sage_finale_intro',
        dialogueHasItem: null,
        dialogueAfter: 'sage_finale_after',
        wantsItem: null,
        helpedFlag: null,
      },
      this.tweens,
    );
    await this.sage.setup();
    this.container.addChild(this.sage.container);

    // 4. Sage tap handler
    this.sage.container.on('pointertap', () => {
      if (this.scruff.isMoving() || this.dialogueRunner.isActive() || this.activeMinigame) return;
      this.scruff
        .moveTo(this.sage.container.x - 80, this.sage.container.y)
        .then(() => {
          const isComplete = this.gameState.getFlag('game_complete');

          let dialogueId: string;
          if (isComplete) {
            dialogueId = 'sage_finale_after';
          } else if (this.hasAllProofItems()) {
            dialogueId = 'sage_finale_ready';
          } else {
            dialogueId = 'sage_finale_intro';
          }

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

    // 5. Dialogue system
    this.dialogueRunner = new DialogueRunner(
      dialogueData as Record<string, (typeof dialogueData)[keyof typeof dialogueData]>,
      (flag: string) => this.gameState.getFlag(flag as FlagId),
    );
    this.dialogueBubble = new DialogueBubble();
    this.container.addChild(this.dialogueBubble.container);

    // 6. Navigation arrow - down to Central Trail
    const downArrow = new SceneArrow(
      'down',
      'central_trail',
      'Central Trail',
      620,
      660,
      this.tweens,
    );
    downArrow.container.on('pointertap', () => {
      if (!this.scruff.isMoving() && !this.dialogueRunner.isActive() && !this.activeMinigame) {
        this.onSceneChange?.('central_trail');
      }
    });
    this.arrows.push(downArrow);
    this.container.addChild(downArrow.container);

    // 7. Ground tap handler
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
            this.sage.container.x,
            this.sage.container.y - 160,
          );
        } else {
          this.dialogueBubble.hide();
          this.handleDialogueEnd();
        }
        return;
      }

      const pos = e.getLocalPosition(this.container);
      // Only allow movement in the ground area
      if (pos.y > 500) {
        this.scruff.moveTo(pos.x, pos.y);
      }
    });
  }

  /** Check if the player has all four proof items. */
  private hasAllProofItems(): boolean {
    return (
      this.gameState.hasItem('rusty_lyonia_flowers') &&
      this.gameState.hasItem('chapman_oak_acorns') &&
      this.gameState.hasItem('flicker_feather') &&
      this.gameState.hasItem('pip_map')
    );
  }

  private async handleDialogueEnd(): Promise<void> {
    if (
      this.lastDialogueId === 'sage_finale_ready' &&
      !this.gameState.getFlag('game_complete')
    ) {
      // Launch Night Watch mini-game
      await this.startMinigame();
    } else if (this.lastDialogueId === 'sage_finale_celebration') {
      // After celebration dialogue, show ending screen
      this.showEndingScreen();
    }
    this.lastDialogueId = null;
  }

  private async startMinigame(): Promise<void> {
    const minigame = new NightWatch(this.app, this.gameState, this.tweens);
    await minigame.setup();
    minigame.onComplete = async () => {
      // Remove minigame overlay
      this.container.removeChild(minigame.container);
      this.activeMinigame = null;

      // Set game_complete flag
      this.gameState.setFlag('game_complete');

      // Play Sage's celebration animation
      await this.sage.playHappy();

      // Show celebration dialogue
      this.lastDialogueId = 'sage_finale_celebration';
      const line = this.dialogueRunner.start('sage_finale_celebration');
      if (line) {
        this.dialogueBubble.show(
          line.speaker,
          line.text,
          this.sage.container.x,
          this.sage.container.y - 160,
        );
      }
    };
    this.container.addChild(minigame.container);
    minigame.enter();
    this.activeMinigame = minigame;
  }

  private showEndingScreen(): void {
    const overlay = new Container();

    // Full-screen dark background
    const screenBg = new Graphics();
    screenBg.rect(0, 0, 1280, 720);
    screenBg.fill({ color: 0x0a0a2e, alpha: 0.95 });
    screenBg.eventMode = 'static';
    overlay.addChild(screenBg);

    // Stars decoration
    const starPositions = [
      { x: 100, y: 80 }, { x: 250, y: 120 }, { x: 400, y: 60 },
      { x: 550, y: 100 }, { x: 700, y: 50 }, { x: 850, y: 90 },
      { x: 1000, y: 70 }, { x: 1150, y: 110 }, { x: 180, y: 180 },
      { x: 480, y: 160 }, { x: 780, y: 140 }, { x: 1080, y: 170 },
    ];
    for (const star of starPositions) {
      const s = new Graphics();
      s.circle(star.x, star.y, 2);
      s.fill({ color: 0xffffff, alpha: 0.6 });
      overlay.addChild(s);
    }

    // "The End" title
    const endTitle = new Text({
      text: 'The End',
      style: new TextStyle({
        fontSize: 72,
        fill: '#FFE44D',
        fontWeight: 'bold',
        fontFamily: 'Georgia, serif',
      }),
    });
    endTitle.anchor.set(0.5, 0);
    endTitle.position.set(640, 100);
    overlay.addChild(endTitle);

    // Subtitle
    const subtitle = new Text({
      text: 'Thanks for helping Lyonia Preserve!',
      style: new TextStyle({
        fontSize: 30,
        fill: '#CCCCEE',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    subtitle.anchor.set(0.5, 0);
    subtitle.position.set(640, 200);
    overlay.addChild(subtitle);

    // Conservation message
    const message = new Text({
      text:
        'Lyonia Preserve is a real nature preserve in Deltona, Florida.\n' +
        'It protects the Florida scrub habitat - one of the most endangered\n' +
        'ecosystems in North America.\n\n' +
        'Gopher tortoises, Florida scrub-jays, eastern indigo snakes,\n' +
        'and many other species depend on scrub habitat to survive.\n\n' +
        'You can help real wildlife by learning about native plants,\n' +
        'removing invasive species, and supporting conservation efforts!',
      style: new TextStyle({
        fontSize: 19,
        fill: '#AAAACC',
        wordWrap: true,
        wordWrapWidth: 700,
        lineHeight: 28,
        fontFamily: 'Arial, sans-serif',
        align: 'center',
      }),
    });
    message.anchor.set(0.5, 0);
    message.position.set(640, 260);
    overlay.addChild(message);

    // Game title
    const gameTitle = new Text({
      text: "Scruff's Day",
      style: new TextStyle({
        fontSize: 28,
        fill: '#FFE44D',
        fontWeight: 'bold',
        fontStyle: 'italic',
        fontFamily: 'Georgia, serif',
      }),
    });
    gameTitle.anchor.set(0.5, 0);
    gameTitle.position.set(640, 530);
    overlay.addChild(gameTitle);

    // "Play Again?" button
    const btnContainer = new Container();
    const btnBg = new Graphics();
    btnBg.roundRect(-100, -25, 200, 50, 12);
    btnBg.fill({ color: 0x4169e1 });
    btnBg.stroke({ width: 3, color: 0xffe44d });
    btnContainer.addChild(btnBg);

    const btnText = new Text({
      text: 'Play Again?',
      style: new TextStyle({
        fontSize: 24,
        fill: '#FFFFFF',
        fontWeight: 'bold',
        fontFamily: 'Arial, sans-serif',
      }),
    });
    btnText.anchor.set(0.5, 0.5);
    btnText.position.set(0, 0);
    btnContainer.addChild(btnText);

    btnContainer.position.set(640, 610);
    btnContainer.eventMode = 'static';
    btnContainer.cursor = 'pointer';

    // Pulse animation on button
    this.tweens.add({
      target: btnContainer.scale as unknown as Record<string, number>,
      props: { x: 1.08, y: 1.08 },
      duration: 600,
      yoyo: true,
      loop: true,
      easing: Easing.easeInOut,
    });

    btnContainer.on('pointertap', () => {
      // Clear game state and reload
      localStorage.removeItem('scruffs_day_save');
      window.location.reload();
    });

    overlay.addChild(btnContainer);

    // Fade in the overlay
    overlay.alpha = 0;
    this.container.addChild(overlay);
    this.tweens.add({
      target: overlay as unknown as Record<string, number>,
      props: { alpha: 1 },
      duration: 1000,
      easing: Easing.easeInOut,
    });
  }

  enter(): void {
    // Reset Scruff position when entering
    this.scruff.setPosition(640, 620);
  }

  update(deltaMs: number): void {
    // If minigame is active, delegate updates to it
    if (this.activeMinigame) {
      this.activeMinigame.update(deltaMs);
      return;
    }

    // NPC proximity excitement
    this.sage.setExcited(
      this.sage.isInRange(this.scruff.x, this.scruff.y),
    );
  }

  exit(): void {
    this.dialogueBubble.hide();
    if (this.activeMinigame) {
      this.activeMinigame.exit();
      this.container.removeChild(this.activeMinigame.container);
      this.activeMinigame = null;
    }
  }
}
