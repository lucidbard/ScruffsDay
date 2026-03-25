import { Assets, Texture, VideoSource } from 'pixi.js';

/**
 * Provides a looping video texture for an NPC sprite.
 * Falls back to the static texture if no video exists.
 *
 * Usage:
 *   const animTex = new AnimatedNPCTexture();
 *   const texture = await animTex.load('pip', 'assets/characters/pip.png');
 *   sprite.texture = texture;
 */
export class AnimatedNPCTexture {
  private videoSource: VideoSource | null = null;

  /**
   * Try loading a video texture for this NPC; fall back to static.
   * @param name - NPC name matching manifest (e.g. "pip", "sage")
   * @param staticPath - Path to the static fallback texture
   * @returns The texture to assign to the sprite
   */
  async load(name: string, staticPath: string): Promise<Texture> {
    for (const ext of ['webm', 'mp4']) {
      const videoPath = `assets/animated/${name}-loop.${ext}`;
      try {
        const texture = await Assets.load({
          src: videoPath,
          data: {
            autoPlay: true,
            loop: true,
            muted: true,
          },
        });
        if (texture && texture.source instanceof VideoSource) {
          this.videoSource = texture.source;
          return texture;
        }
      } catch {
        // Not available
      }
    }

    return await Assets.load(staticPath);
  }

  pause(): void {
    if (this.videoSource) {
      const resource = this.videoSource.resource as HTMLVideoElement;
      resource.pause();
    }
  }

  resume(): void {
    if (this.videoSource) {
      const resource = this.videoSource.resource as HTMLVideoElement;
      resource.play().catch(() => {});
    }
  }
}
