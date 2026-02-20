import { Scene } from '../game/Scene';
import { Scruff } from '../characters/Scruff';
import { InteractiveItem } from '../game/InteractiveItem';
import { SceneArrow } from '../game/SceneArrow';
import { DialogueBubble, DialogueRunner } from '../game/DialogueSystem';
import { Sprite, Assets } from 'pixi.js';
import type { SceneId, FlagId } from '../game/GameState';
import dialogueData from '../data/dialogue.json';

export class ScrubThicket extends Scene {
  private scruff!: Scruff;
  private items: InteractiveItem[] = [];
  private arrows: SceneArrow[] = [];
  private dialogueBubble!: DialogueBubble;
  private dialogueRunner!: DialogueRunner;

  /** Called by SceneManager wiring to navigate between scenes. */
  onSceneChange?: (sceneId: SceneId) => void;

  async setup(): Promise<void> {
    // 1. Background
    const bgTexture = await Assets.load('assets/backgrounds/scrub-thicket-bg.svg');
    const bg = new Sprite(bgTexture);
    bg.width = 1280;
    bg.height = 720;
    this.container.addChild(bg);

    // 2. Scruff
    this.scruff = new Scruff(this.tweens);
    await this.scruff.setup();
    this.scruff.setPosition(640, 550);
    this.container.addChild(this.scruff.container);

    // 3. Collectible items (only if not already in inventory)
    if (!this.gameState.hasItem('saw_palmetto_fronds')) {
      const palmetto = new InteractiveItem(
        {
          itemId: 'saw_palmetto_fronds',
          texturePath: 'assets/items/saw-palmetto-fronds.svg',
          x: 300,
          y: 450,
        },
        this.tweens,
      );
      await palmetto.setup();
      this.items.push(palmetto);
      this.container.addChild(palmetto.container);
    }

    if (!this.gameState.hasItem('rusty_lyonia_flowers')) {
      const lyonia = new InteractiveItem(
        {
          itemId: 'rusty_lyonia_flowers',
          texturePath: 'assets/items/rusty-lyonia-flowers.svg',
          x: 900,
          y: 400,
        },
        this.tweens,
      );
      await lyonia.setup();
      this.items.push(lyonia);
      this.container.addChild(lyonia.container);
    }

    // 4. Navigation arrow to Tortoise Burrow
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

    // 5. Dialogue system
    this.dialogueRunner = new DialogueRunner(
      dialogueData as Record<string, typeof dialogueData[keyof typeof dialogueData]>,
      (flag: string) => this.gameState.getFlag(flag as FlagId),
    );
    this.dialogueBubble = new DialogueBubble();
    this.container.addChild(this.dialogueBubble.container);

    // 6. Item tap handlers
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

    // 7. Ground tap handler (background receives taps)
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
            this.scruff.x,
            this.scruff.y - 130,
          );
        } else {
          this.dialogueBubble.hide();
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
    // Show tutorial dialogue on first visit
    if (!this.gameState.getFlag('tutorial_complete')) {
      const line = this.dialogueRunner.start('tutorial');
      if (line) {
        this.dialogueBubble.show(
          line.speaker,
          line.text,
          this.scruff.x,
          this.scruff.y - 130,
        );
      }
      this.gameState.setFlag('tutorial_complete');
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
  }

  exit(): void {
    this.dialogueBubble.hide();
  }
}
