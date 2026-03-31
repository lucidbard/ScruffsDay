import { Scene } from '../game/Scene';
import { Scruff } from '../characters/Scruff';
import { NPC } from '../characters/NPC';
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
import { Sprite, Assets, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { SceneId, FlagId, SceneDirection } from '../game/GameState';
import type { NPCConfig } from '../characters/NPC';
import { NightWatch } from '../minigames/NightWatch';
import { Easing } from '../game/Tween';
import dialogueData from '../data/dialogue.json';
import walkableAreasData from '../data/walkable-areas.json';
import npcConfigs from '../data/npc-configs.json';

type WalkableAreasJson = Record<string, Record<string, unknown>>;

export class OwlsOverlook extends Scene {
  private scruff!: Scruff;
  private sage!: NPC;
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;
  private lastDialogueId: string | null = null;
  private walkableArea!: WalkableArea;
  private activeMinigame: NightWatch | null = null;
  private depthScaleConfig: DepthScaleConfig | null = null;
  private foregrounds: ForegroundObject[] = [];
  private animBg: AnimatedBackground | null = null;
  private perchSystem = new PerchSystem();
  private ambientAudio = new AmbientAudio();

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId, dir?: SceneDirection) => void;

  async setup(): Promise<void> {
    const sceneData = (walkableAreasData as WalkableAreasJson).owls_overlook as Record<string, unknown>;

    // 1. Background
    this.animBg = new AnimatedBackground(1280, 720);
    await this.animBg.load('owls-overlook', 'assets/backgrounds/owls-overlook-bg.png');
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
    await this.perchSystem.load('owls_overlook');
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

    // 6. Sage NPC (owl) - perched on the dead tree
    this.sage = new NPC(npcConfigs.sage_overlook as NPCConfig, this.tweens);
    await this.sage.setup();
    this.depthContainer.addChild(this.sage.container);

    // 7. Sage tap handler
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

    // 8. Foreground objects
    const fgData = (sceneData.foregrounds as { id: string; texturePath: string; x: number; y: number; depthY: number }[] | undefined) ?? [];
    for (const fgCfg of fgData) {
      const fg = new ForegroundObject(fgCfg);
      await fg.setup();
      this.foregrounds.push(fg);
      this.depthContainer.addChild(fg.container);
    }

    // 9. Dialogue system (above depthContainer)
    this.dialogueRunner = new DialogueRunner(
      dialogueData as Record<string, (typeof dialogueData)[keyof typeof dialogueData]>,
      (flag: string) => this.gameState.getFlag(flag as FlagId),
      (flag: string) => this.gameState.setFlag(flag as FlagId),
    );
    this.dialogueBubble = new DialogueBubble();
    this.container.addChild(this.dialogueBubble.container);

    // 10. Navigation arrow - down to Central Trail (above depthContainer)
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

    // 11. Ground tap handler
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
        [this.sage],
        'owls_overlook',
        'owls_overlook',
        ['sage_overlook'],
        this.walkableArea.getObstacles(),
        this.foregrounds,
      );
      this.container.addChild(debug.container);
    }

    // 13. Perch debug overlay (editable in debug mode)
    if (WalkableAreaDebug.isEnabled()) {
      const perchOverlay = new PerchDebugOverlay(this.perchSystem, 'owls_overlook', [1376, 768]);
      this.container.addChild(perchOverlay.container);
    }
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

  enter(fromScene?: SceneId, exitDirection?: SceneDirection): void {
    const sceneData = (walkableAreasData as WalkableAreasJson).owls_overlook as Record<string, unknown>;
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
    this.sage.setExcited(
      this.sage.isInRange(this.scruff.x, this.scruff.y),
    );

    // Apply depth scaling
    if (this.depthScaleConfig) {
      this.applyDepthScaling(this.depthScaleConfig, [this.scruff, this.sage]);
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
