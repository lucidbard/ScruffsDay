import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { ItemId } from './GameState';
import itemsData from '../data/items.json';

interface ItemMeta {
  displayName: string;
  description: string;
}

const CARD_W = 640;
const CARD_H = 360;
const CARD_X = (1280 - CARD_W) / 2;
const CARD_Y = (720 - CARD_H) / 2;

/**
 * Modal card shown when a player taps an item. Plays a voiced description,
 * offers Pick Up / Leave buttons. onPickUp fires when the player commits.
 */
export class ItemInspectCard {
  readonly container = new Container();
  private bg = new Graphics();
  private dimmer = new Graphics();
  private preview: Sprite | null = null;
  private titleText: Text;
  private descText: Text;
  private pickUpBtn: Container;
  private leaveBtn: Container;
  private audio: HTMLAudioElement | null = null;

  private onPickUpCb: (() => void) | null = null;
  private onLeaveCb: (() => void) | null = null;

  constructor() {
    // Screen-dimming backdrop, captures background taps
    this.dimmer.rect(0, 0, 1280, 720);
    this.dimmer.fill({ color: 0x000000, alpha: 0.55 });
    this.dimmer.eventMode = 'static';
    this.dimmer.on('pointertap', (e) => e.stopPropagation());
    this.container.addChild(this.dimmer);

    // Card body
    this.bg.roundRect(CARD_X, CARD_Y, CARD_W, CARD_H, 24);
    this.bg.fill({ color: 0xFFF8DC });
    this.bg.stroke({ width: 4, color: 0x3E2723 });
    this.bg.eventMode = 'static';
    this.bg.on('pointertap', (e) => e.stopPropagation());
    this.container.addChild(this.bg);

    // Title
    this.titleText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: "'Fredoka', 'Comic Sans MS', sans-serif",
        fontSize: 30,
        fontWeight: 'bold',
        fill: '#1a5276',
      }),
    });
    this.titleText.anchor.set(0.5, 0);
    this.titleText.position.set(1280 / 2, CARD_Y + 20);
    this.container.addChild(this.titleText);

    // Description
    this.descText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: "'Fredoka', 'Comic Sans MS', sans-serif",
        fontSize: 22,
        fill: '#2B1B17',
        wordWrap: true,
        wordWrapWidth: CARD_W - 220,
        lineHeight: 28,
      }),
    });
    this.descText.position.set(CARD_X + 200, CARD_Y + 70);
    this.container.addChild(this.descText);

    this.pickUpBtn = this.makeButton('Pick Up', 0x2E8B57, () => {
      this.stopAudio();
      this.container.visible = false;
      this.onPickUpCb?.();
    });
    this.pickUpBtn.position.set(CARD_X + CARD_W - 200, CARD_Y + CARD_H - 70);
    this.container.addChild(this.pickUpBtn);

    this.leaveBtn = this.makeButton('Leave', 0x8B6914, () => {
      this.stopAudio();
      this.container.visible = false;
      this.onLeaveCb?.();
    });
    this.leaveBtn.position.set(CARD_X + 40, CARD_Y + CARD_H - 70);
    this.container.addChild(this.leaveBtn);

    this.container.visible = false;
  }

  private makeButton(label: string, color: number, onTap: () => void): Container {
    const c = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, 160, 50, 14);
    bg.fill({ color });
    bg.stroke({ width: 3, color: 0x3E2723 });
    c.addChild(bg);
    const t = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: "'Fredoka', 'Comic Sans MS', sans-serif",
        fontSize: 24,
        fontWeight: 'bold',
        fill: '#FFFFFF',
      }),
    });
    t.anchor.set(0.5);
    t.position.set(80, 25);
    c.addChild(t);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', (e) => { e.stopPropagation(); onTap(); });
    return c;
  }

  /** Show the card for a given item. Returns true if metadata found; false = no card. */
  async show(itemId: ItemId, texturePath: string, onPickUp: () => void, onLeave: () => void): Promise<boolean> {
    const meta = (itemsData as Record<string, ItemMeta>)[itemId];
    if (!meta) return false;

    this.onPickUpCb = onPickUp;
    this.onLeaveCb = onLeave;
    this.titleText.text = meta.displayName;
    this.descText.text = meta.description;

    // Swap preview sprite
    if (this.preview) {
      this.container.removeChild(this.preview);
      this.preview.destroy();
      this.preview = null;
    }
    try {
      const tex = await Assets.load(texturePath) as Texture;
      const s = new Sprite(tex);
      s.anchor.set(0.5, 0.5);
      const boxW = 150, boxH = 150;
      const scale = Math.min(boxW / tex.width, boxH / tex.height);
      s.scale.set(scale);
      s.position.set(CARD_X + 110, CARD_Y + CARD_H / 2);
      this.container.addChild(s);
      this.preview = s;
    } catch {
      // Missing texture — skip preview, still show text
    }

    this.playAudio(itemId);
    this.container.visible = true;
    return true;
  }

  private playAudio(itemId: ItemId): void {
    this.stopAudio();
    const a = new Audio(`assets/sounds/items/${itemId}.wav`);
    a.volume = 0.95;
    a.play().catch(() => {});
    this.audio = a;
  }

  private stopAudio(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
  }

  isVisible(): boolean {
    return this.container.visible;
  }
}
