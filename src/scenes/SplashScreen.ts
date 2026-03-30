import { Scene } from '../game/Scene';
import { Assets, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import { Easing } from '../game/Tween';
import type { SceneId, SceneDirection } from '../game/GameState';

export class SplashScreen extends Scene {
  private content!: Container;
  private ready = false;

  onSceneChange?: (sceneId: SceneId, dir?: SceneDirection) => void;

  async setup(): Promise<void> {
    // Dark background
    const bg = new Graphics();
    bg.rect(0, 0, 1280, 720);
    bg.fill({ color: 0xfaf8f0 });
    bg.eventMode = 'static';
    bg.cursor = 'pointer';
    bg.on('pointertap', () => this.advance());
    this.container.addChild(bg);

    this.content = new Container();
    this.content.alpha = 0;
    this.container.addChild(this.content);

    // Logo
    const logoTexture = await Assets.load('assets/ui/cuplet-fern-logo.png');
    const logo = new Sprite(logoTexture);
    logo.anchor.set(0.5, 0.5);
    const logoScale = 280 / logoTexture.height;
    logo.scale.set(logoScale);
    logo.position.set(640, 280);
    this.content.addChild(logo);

    // "About" text
    const aboutText = new Text({
      text: 'Scruff\'s Day is made possible by the\nCuplet Fern Chapter of the Florida Native Plant Society',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 22,
        fill: '#3E2723',
        align: 'center',
        lineHeight: 32,
      }),
    });
    aboutText.anchor.set(0.5, 0);
    aboutText.position.set(640, 450);
    this.content.addChild(aboutText);

    // Website link
    const link = new Text({
      text: 'cupletfern.org',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 20,
        fill: '#1565C0',
        align: 'center',
      }),
    });
    link.anchor.set(0.5, 0);
    link.position.set(640, 530);
    link.eventMode = 'static';
    link.cursor = 'pointer';
    link.on('pointertap', (e) => {
      e.stopPropagation();
      window.open('http://cupletfern.org/', '_blank');
    });
    this.content.addChild(link);

    // Tap prompt
    const prompt = new Text({
      text: 'tap to continue',
      style: new TextStyle({
        fontSize: 16,
        fill: '#999999',
        fontStyle: 'italic',
      }),
    });
    prompt.anchor.set(0.5, 0);
    prompt.position.set(640, 660);
    this.content.addChild(prompt);
  }

  enter(_fromScene?: SceneId): void {
    this.ready = false;
    this.content.alpha = 0;

    // Fade in
    this.tweens.add({
      target: this.content as unknown as Record<string, number>,
      props: { alpha: 1 },
      duration: 800,
      easing: Easing.easeInOut,
      onComplete: () => {
        this.ready = true;
      },
    });
  }

  private advance(): void {
    if (!this.ready) return;
    this.ready = false;

    // Fade out then transition
    this.tweens.add({
      target: this.content as unknown as Record<string, number>,
      props: { alpha: 0 },
      duration: 500,
      easing: Easing.easeInOut,
      onComplete: () => {
        this.onSceneChange?.('intro');
      },
    });
  }

  update(_deltaMs: number): void {}
  exit(): void {}
}
