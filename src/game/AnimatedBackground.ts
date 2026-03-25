import { Sprite, Assets, Texture, VideoSource } from 'pixi.js';

/**
 * Loads a looping video as a background sprite with periodic playback.
 * The video plays once, then rests on the static frame for a random
 * interval (10-30s by default) before playing again.
 * Falls back to the static image if the video isn't available.
 *
 * Usage:
 *   const bg = new AnimatedBackground(1280, 720);
 *   await bg.load('central-trail', 'assets/backgrounds/central-trail-bg.png');
 *   scene.addChild(bg.sprite);
 */
export class AnimatedBackground {
  readonly sprite: Sprite;
  private videoSource: VideoSource | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private width: number;
  private height: number;
  private restTimer: number | null = null;
  private active = false;

  /** Min/max seconds to rest between animation plays. */
  private restMin: number;
  private restMax: number;

  constructor(width = 1280, height = 720, restMin = 10, restMax = 30) {
    this.width = width;
    this.height = height;
    this.restMin = restMin;
    this.restMax = restMax;
    this.sprite = new Sprite();
  }

  async load(name: string, staticPath: string): Promise<void> {
    let texture: Texture | null = null;

    for (const ext of ['webm', 'mp4']) {
      const videoPath = `assets/animated/${name}-loop.${ext}`;
      try {
        texture = await Assets.load({
          src: videoPath,
          data: {
            autoPlay: false,
            loop: false,
            muted: true,
          },
        });
        if (texture && texture.source instanceof VideoSource) {
          this.videoSource = texture.source;
          this.videoEl = this.videoSource.resource as HTMLVideoElement;
          this.videoEl.loop = false;
          this.videoEl.muted = true;

          // When video ends, rest then replay
          this.videoEl.addEventListener('ended', () => this.scheduleNext());
          break;
        }
      } catch {
        // Format not available
      }
    }

    if (!texture) {
      texture = await Assets.load(staticPath) as Texture;
    }

    this.sprite.texture = texture!;
    this.sprite.width = this.width;
    this.sprite.height = this.height;
  }

  /** Start periodic playback (call on scene enter). */
  resume(): void {
    this.active = true;
    if (this.videoEl) {
      // Play immediately on first enter, then schedule after
      this.playOnce();
    }
  }

  /** Stop playback and clear timers (call on scene exit). */
  pause(): void {
    this.active = false;
    if (this.videoEl) {
      this.videoEl.pause();
    }
    if (this.restTimer !== null) {
      clearTimeout(this.restTimer);
      this.restTimer = null;
    }
  }

  private playOnce(): void {
    if (!this.active || !this.videoEl) return;
    this.videoEl.currentTime = 0;
    this.videoEl.play().catch(() => { /* autoplay blocked */ });
  }

  private scheduleNext(): void {
    if (!this.active) return;
    const delay = (this.restMin + Math.random() * (this.restMax - this.restMin)) * 1000;
    this.restTimer = window.setTimeout(() => {
      this.restTimer = null;
      this.playOnce();
    }, delay);
  }

  destroy(): void {
    this.pause();
    this.sprite.destroy();
  }
}
