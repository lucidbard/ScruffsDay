import { Assets, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import type { GameState, SceneId } from './GameState';

interface TravelLocation {
  id: SceneId;
  label: string;
  x: number;
  y: number;
}

interface LocationButton {
  id: SceneId;
  container: Container;
  marker: Graphics;
  label: Text;
}

const MAP_X = 160;
const MAP_Y = 70;
const MAP_W = 960;
const MAP_H = 640;

const LOCATIONS: TravelLocation[] = [
  { id: 'owls_overlook', label: "Owl's Overlook", x: 0.43, y: 0.13 },
  { id: 'pine_clearing', label: 'Pine Clearing', x: 0.13, y: 0.20 },
  { id: 'central_trail', label: 'Central Trail', x: 0.45, y: 0.50 },
  { id: 'sandy_barrens', label: 'Sandy Barrens', x: 0.78, y: 0.20 },
  { id: 'scrub_thicket', label: 'Scrub Thicket', x: 0.20, y: 0.83 },
  { id: 'tortoise_burrow', label: 'Tortoise Burrow', x: 0.78, y: 0.72 },
];

export class FastTravelMapOverlay {
  readonly container = new Container();
  onTravel?: (sceneId: SceneId) => void;

  private buttons: LocationButton[] = [];

  constructor(private gameState: GameState) {
    const darkBg = new Graphics();
    darkBg.rect(0, 0, 1280, 720);
    darkBg.fill({ color: 0x000000, alpha: 0.7 });
    darkBg.eventMode = 'static';
    darkBg.cursor = 'pointer';
    darkBg.on('pointertap', () => this.hide());
    this.container.addChild(darkBg);

    this.container.visible = false;
  }

  async setup(): Promise<void> {
    const panel = new Graphics();
    panel.roundRect(110, 30, 1060, 660, 22);
    panel.fill({ color: 0xFFF8DC, alpha: 0.98 });
    panel.stroke({ width: 4, color: 0x3E2723 });
    panel.eventMode = 'static';
    panel.on('pointertap', (e) => e.stopPropagation());
    this.container.addChild(panel);

    const title = new Text({
      text: 'Travel Map',
      style: new TextStyle({
        fontFamily: 'Georgia, serif',
        fontSize: 34,
        fontWeight: 'bold',
        fill: '#4169E1',
      }),
    });
    title.anchor.set(0.5, 0);
    title.position.set(640, 44);
    this.container.addChild(title);

    const subtitle = new Text({
      text: 'Pick a destination',
      style: new TextStyle({
        fontFamily: "'Fredoka', 'Comic Sans MS', sans-serif",
        fontSize: 20,
        fill: '#5D4037',
      }),
    });
    subtitle.anchor.set(0.5, 0);
    subtitle.position.set(640, 86);
    this.container.addChild(subtitle);

    const mapFrame = new Graphics();
    mapFrame.roundRect(MAP_X - 6, MAP_Y - 6, MAP_W + 12, MAP_H + 12, 18);
    mapFrame.fill({ color: 0xDCC9A3 });
    mapFrame.stroke({ width: 3, color: 0x6D4C41 });
    this.container.addChild(mapFrame);

    const mapTexture = await Assets.load('assets/ui/fast-travel-map.png');
    const mapSprite = new Sprite(mapTexture);
    mapSprite.position.set(MAP_X, MAP_Y);
    mapSprite.width = MAP_W;
    mapSprite.height = MAP_H;
    mapSprite.eventMode = 'static';
    mapSprite.on('pointertap', (e) => e.stopPropagation());
    this.container.addChild(mapSprite);

    for (const location of LOCATIONS) {
      const button = this.createLocationButton(location);
      this.buttons.push(button);
      this.container.addChild(button.container);
    }
  }

  private createLocationButton(location: TravelLocation): LocationButton {
    const container = new Container();
    container.position.set(MAP_X + location.x * MAP_W, MAP_Y + location.y * MAP_H);
    container.eventMode = 'static';
    container.cursor = 'pointer';
    container.on('pointertap', () => {
      if (!this.canTravelTo(location.id)) return;
      if (this.gameState.currentScene === location.id) {
        this.hide();
        return;
      }
      this.hide();
      this.onTravel?.(location.id);
    });

    const marker = new Graphics();
    container.addChild(marker);

    const label = new Text({
      text: location.label,
      style: new TextStyle({
        fontFamily: "'Fredoka', 'Comic Sans MS', sans-serif",
        fontSize: 20,
        fill: '#FFFFFF',
        fontWeight: 'bold',
        stroke: { width: 4, color: 0x3E2723 },
      }),
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, 18);
    container.addChild(label);

    return { id: location.id, container, marker, label };
  }

  private canTravelTo(sceneId: SceneId): boolean {
    switch (sceneId) {
      case 'scrub_thicket':
      case 'tortoise_burrow':
      case 'central_trail':
      case 'pine_clearing':
      case 'sandy_barrens':
        return this.gameState.getFlag('fast_travel_unlocked');
      case 'owls_overlook':
        return this.gameState.getFlag('sunny_helped') || this.gameState.hasVisited('owls_overlook');
      default:
        return false;
    }
  }

  private refresh(): void {
    for (const button of this.buttons) {
      const available = this.canTravelTo(button.id);
      const current = this.gameState.currentScene === button.id;

      button.container.visible = available;
      button.container.cursor = current ? 'default' : 'pointer';

      button.marker.clear();
      button.marker.circle(0, 0, current ? 16 : 13);
      button.marker.fill({
        color: current ? 0xFFD54F : 0x4169E1,
        alpha: 0.95,
      });
      button.marker.stroke({
        width: 4,
        color: current ? 0x3E2723 : 0xFFF8DC,
      });
    }
  }

  show(): void {
    this.refresh();
    this.container.visible = true;
  }

  hide(): void {
    this.container.visible = false;
  }

  isVisible(): boolean {
    return this.container.visible;
  }
}
