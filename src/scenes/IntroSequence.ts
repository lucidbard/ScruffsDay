import { Scene } from '../game/Scene';
import { Assets, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import { Easing } from '../game/Tween';
import type { SceneId, SceneDirection } from '../game/GameState';

interface PanelDef {
  image: string;
  narration: string;
}

const PANELS: PanelDef[] = [
  {
    image: 'assets/intro/panel-1.jpg',
    narration: 'It was a beautiful spring morning at Lyonia Preserve...',
  },
  {
    image: 'assets/intro/panel-2.jpg',
    narration: 'Scruff, a young Florida scrub jay, loved his home in the scrub thicket.',
  },
  {
    image: 'assets/intro/panel-3.jpg',
    narration:
      'But something was wrong. Strange plants were growing everywhere, crowding out the plants that belonged here.',
  },
  {
    image: 'assets/intro/panel-4.jpg',
    narration:
      'The animals of the preserve were in trouble. Without their native plants, they couldn\u2019t find food or shelter.',
  },
  {
    image: 'assets/intro/panel-5.jpg',
    narration:
      'Scruff knew what he had to do. He would find the native plants and bring them to his friends!',
  },
  {
    image: 'assets/intro/panel-6.jpg',
    narration: '',
  },
];

export class IntroSequence extends Scene {
  private panels: Sprite[] = [];
  private currentPanel = 0;
  private transitioning = false;

  private narrationBar!: Graphics;
  private narrationText!: Text;
  private promptText!: Text;
  private skipBtn!: Container;

  onSceneChange?: (sceneId: SceneId, dir?: SceneDirection) => void;

  async setup(): Promise<void> {
    // Preload all panel textures in parallel
    const textures = await Promise.all(PANELS.map((p) => Assets.load(p.image)));
    for (const texture of textures) {
      const sprite = new Sprite(texture);
      sprite.width = 1280;
      sprite.height = 720;
      sprite.alpha = 0;
      this.container.addChild(sprite);
      this.panels.push(sprite);
    }

    // Narration bar (semi-transparent black bar at bottom)
    this.narrationBar = new Graphics();
    this.narrationBar.rect(0, 600, 1280, 120);
    this.narrationBar.fill({ color: 0x000000, alpha: 0.7 });
    this.container.addChild(this.narrationBar);

    // Narration text
    this.narrationText = new Text({
      text: '',
      style: new TextStyle({
        fontSize: 26,
        fill: '#FFFFFF',
        wordWrap: true,
        wordWrapWidth: 1200,
        align: 'center',
      }),
    });
    this.narrationText.anchor.set(0.5, 0.5);
    this.narrationText.position.set(640, 640);
    this.container.addChild(this.narrationText);

    // "Tap to continue" prompt
    this.promptText = new Text({
      text: 'tap to continue',
      style: new TextStyle({
        fontSize: 16,
        fill: '#AAAAAA',
        fontStyle: 'italic',
      }),
    });
    this.promptText.anchor.set(0.5, 0);
    this.promptText.position.set(640, 690);
    this.container.addChild(this.promptText);

    // Skip button (top-right)
    this.skipBtn = new Container();
    const skipBg = new Graphics();
    skipBg.roundRect(-40, -16, 80, 32, 8);
    skipBg.fill({ color: 0x000000, alpha: 0.5 });
    const skipText = new Text({
      text: 'Skip',
      style: new TextStyle({ fontSize: 18, fill: '#FFFFFF' }),
    });
    skipText.anchor.set(0.5, 0.5);
    this.skipBtn.addChild(skipBg, skipText);
    this.skipBtn.position.set(1230, 30);
    this.skipBtn.eventMode = 'static';
    this.skipBtn.cursor = 'pointer';
    this.skipBtn.on('pointertap', (e) => {
      e.stopPropagation();
      this.finish();
    });
    this.container.addChild(this.skipBtn);

    // Tap-to-advance on the whole scene
    const hitArea = new Graphics();
    hitArea.rect(0, 0, 1280, 720);
    hitArea.fill({ color: 0x000000, alpha: 0 });
    hitArea.eventMode = 'static';
    hitArea.cursor = 'pointer';
    hitArea.on('pointertap', () => this.advance());
    // Insert behind UI elements but in front of nothing
    this.container.addChildAt(hitArea, this.panels.length);
  }

  enter(_fromScene?: SceneId): void {
    this.currentPanel = 0;
    this.panels[0].alpha = 1;
    this.showPanel(0);
  }

  private showPanel(index: number): void {
    const panel = PANELS[index];
    const isLastPanel = index === PANELS.length - 1;

    if (isLastPanel) {
      // Title card - hide narration bar, show "tap to start"
      this.narrationBar.visible = false;
      this.narrationText.visible = false;
      this.promptText.text = 'tap to start';
      this.promptText.position.set(640, 640);
      this.promptText.style.fontSize = 24;
      this.promptText.style.fill = '#FFFFFF';
      this.promptText.style.fontStyle = 'normal';
    } else {
      this.narrationBar.visible = true;
      this.narrationText.visible = true;
      this.narrationText.text = panel.narration;
      this.promptText.text = 'tap to continue';
      this.promptText.position.set(640, 690);
      this.promptText.style.fontSize = 16;
      this.promptText.style.fill = '#AAAAAA';
      this.promptText.style.fontStyle = 'italic';
    }
  }

  private advance(): void {
    if (this.transitioning) return;

    const nextIndex = this.currentPanel + 1;

    if (nextIndex >= PANELS.length) {
      // Past the last panel - start the game
      this.finish();
      return;
    }

    this.transitioning = true;

    const current = this.panels[this.currentPanel];
    const next = this.panels[nextIndex];
    next.alpha = 0;

    // Crossfade: fade out current, fade in next
    this.tweens.add({
      target: current as unknown as Record<string, number>,
      props: { alpha: 0 },
      duration: 500,
      easing: Easing.easeInOut,
    });

    this.tweens.add({
      target: next as unknown as Record<string, number>,
      props: { alpha: 1 },
      duration: 500,
      easing: Easing.easeInOut,
      onComplete: () => {
        this.currentPanel = nextIndex;
        this.showPanel(nextIndex);
        this.transitioning = false;
      },
    });
  }

  private finish(): void {
    if (this.transitioning) return;
    this.gameState.setFlag('intro_seen');
    this.onSceneChange?.('scrub_thicket');
  }

  update(_deltaMs: number): void {
    // No per-frame logic needed
  }

  exit(): void {
    // Clean up
  }
}
