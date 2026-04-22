import { Sprite, Assets, Texture } from 'pixi.js';

/**
 * Loads a static background image as a sprite.
 *
 * Previously this class also played an intermittent looping video, but that
 * added significant memory pressure on mobile (notably iOS Safari), long
 * load times, and minimal gameplay value. The class shape is preserved so
 * scenes don't need changes.
 */
export class AnimatedBackground {
  readonly sprite: Sprite;
  private width: number;
  private height: number;

  constructor(width = 1280, height = 720, _restMin = 10, _restMax = 30) {
    this.width = width;
    this.height = height;
    this.sprite = new Sprite();
  }

  async load(_name: string, staticPath: string): Promise<void> {
    const texture = await Assets.load(staticPath) as Texture;
    this.sprite.texture = texture;
    this.sprite.width = this.width;
    this.sprite.height = this.height;
  }

  resume(): void {
    // Static-only: no video playback to resume.
  }

  pause(): void {
    // Static-only: no video playback to pause.
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
