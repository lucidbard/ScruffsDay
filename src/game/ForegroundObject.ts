import { Container, Sprite, Assets, Graphics } from 'pixi.js';

export interface ForegroundConfig {
  id: string;
  texturePath: string;
  x: number;
  y: number;
  depthY: number;
  /** Optional display height in game px; sprite is scaled to fit. */
  height?: number;
}

export class ForegroundObject {
  readonly container = new Container();
  private config: ForegroundConfig;
  private sprite: Sprite | null = null;
  private placeholder: Graphics | null = null;

  constructor(config: ForegroundConfig) {
    this.config = { ...config };
    // Container Y is the depthY — depth sorting uses container.y
    this.container.position.set(config.x, config.depthY);
  }

  async setup(): Promise<void> {
    try {
      const texture = await Assets.load(this.config.texturePath);
      this.sprite = new Sprite(texture);
      this.sprite.anchor.set(0.5, 1);
      if (this.config.height && texture.height > 0) {
        const s = this.config.height / texture.height;
        this.sprite.scale.set(s);
      }
      // Offset the sprite so its bottom aligns with the container origin (depthY)
      this.sprite.position.set(0, 0);
      this.container.addChild(this.sprite);
    } catch {
      // Texture load failed — render a magenta placeholder rectangle
      this.placeholder = new Graphics();
      this.placeholder.rect(-30, -80, 60, 80);
      this.placeholder.fill({ color: 0xff00ff, alpha: 0.5 });
      this.placeholder.stroke({ width: 2, color: 0xff00ff });
      this.container.addChild(this.placeholder);
    }
  }

  get id(): string {
    return this.config.id;
  }

  setPosition(x: number, depthY: number): void {
    this.config.x = x;
    this.config.depthY = depthY;
    this.container.position.set(x, depthY);
  }

  getConfig(): ForegroundConfig {
    return { ...this.config };
  }
}
