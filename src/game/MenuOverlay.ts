import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameState } from './GameState';

export class MenuOverlay {
  readonly container = new Container();

  constructor(private gameState: GameState) {
    // Dark overlay
    const darkBg = new Graphics();
    darkBg.rect(0, 0, 1280, 720);
    darkBg.fill({ color: 0x000000, alpha: 0.7 });
    darkBg.eventMode = 'static'; // blocks clicks to game below
    darkBg.on('pointertap', () => this.hide());
    this.container.addChild(darkBg);

    // Panel
    const panel = new Graphics();
    panel.roundRect(440, 210, 400, 300, 16);
    panel.fill({ color: 0xfff8dc });
    panel.stroke({ width: 3, color: 0x3e2723 });
    panel.eventMode = 'static'; // prevent clicks from reaching darkBg
    this.container.addChild(panel);

    // Title
    const title = new Text({
      text: "Scruff's Day",
      style: new TextStyle({
        fontSize: 32,
        fill: '#4169E1',
        fontWeight: 'bold',
      }),
    });
    title.anchor.set(0.5, 0);
    title.position.set(640, 230);
    this.container.addChild(title);

    // Buttons
    this.createButton('Continue', 640, 310, () => this.hide());
    this.createButton('Save Game', 640, 380, () => {
      this.gameState.save();
      this.showSavedFeedback();
    });
    this.createButton('New Game', 640, 450, () => {
      localStorage.removeItem('scruffs_day_save');
      location.reload();
    });

    this.container.visible = false;
  }

  private createButton(
    label: string,
    x: number,
    y: number,
    onClick: () => void
  ): void {
    const btn = new Container();
    const bg = new Graphics();
    bg.roundRect(-100, -20, 200, 40, 8);
    bg.fill({ color: 0xd2b48c });
    bg.stroke({ width: 2, color: 0x3e2723 });
    const text = new Text({
      text: label,
      style: new TextStyle({ fontSize: 20, fill: '#3E2723' }),
    });
    text.anchor.set(0.5, 0.5);
    btn.addChild(bg, text);
    btn.position.set(x, y);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', onClick);
    this.container.addChild(btn);
  }

  private showSavedFeedback(): void {
    const saved = new Text({
      text: 'Saved!',
      style: new TextStyle({
        fontSize: 18,
        fill: '#2E7D32',
        fontWeight: 'bold',
      }),
    });
    saved.anchor.set(0.5, 0);
    saved.position.set(640, 410);
    this.container.addChild(saved);
    setTimeout(() => {
      this.container.removeChild(saved);
    }, 1500);
  }

  show(): void {
    this.container.visible = true;
  }

  hide(): void {
    this.container.visible = false;
  }

  isVisible(): boolean {
    return this.container.visible;
  }
}
