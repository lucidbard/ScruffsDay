/**
 * Animation state machine for Scruff the scrub jay.
 *
 * States:
 *   IDLE_FRONT  — facing camera, breathing loop
 *   TURNING     — transitioning from front to side (play once)
 *   IDLE_SIDE   — facing left/right, breathing loop (not typically held long)
 *   HOPPING     — short ground hop cycle (looping while moving)
 *   FLYING      — full flight with wing flap (looping while moving)
 *   TALKING     — facing camera, mouth movement loop
 *   LANDING     — turning back from side to front (reverse of turn, play once)
 *
 * Movement sequence:
 *   IDLE_FRONT → TURNING → HOPPING/FLYING → LANDING → IDLE_FRONT
 *
 * Talking:
 *   IDLE_FRONT → TALKING → IDLE_FRONT
 */

import { Sprite, Texture, Rectangle, Assets } from 'pixi.js';

export type AnimState =
  | 'idle_front'
  | 'turning'
  | 'idle_side'
  | 'hopping'
  | 'flying'
  | 'talking'
  | 'landing';

export type Direction = 'left' | 'right';

interface AnimClip {
  frames: Texture[];
  fps: number;
  loop: boolean;
}

// Spritesheet frame dimensions
// All spritesheets normalized to 256x256 per frame
const FRAME_W = 256, FRAME_H = 256;

export class ScruffAnimator {
  private sprite: Sprite;
  private state: AnimState = 'idle_front';
  private direction: Direction = 'right';
  private frameIndex = 0;
  private animInterval: number | null = null;
  private onAnimComplete: (() => void) | null = null;

  // Clips (loaded async)
  private clips: Partial<Record<string, AnimClip>> = {};

  constructor(sprite: Sprite) {
    this.sprite = sprite;
  }

  async loadAll(): Promise<void> {
    // Load all spritesheets in parallel
    const [idleSheet, talkSheet, turnSheet, hopSheet, flySheet, idleFront] = await Promise.all([
      Assets.load('assets/characters/scruff-idle-sheet.png').catch(() => null),
      Assets.load('assets/characters/scruff-talking-sheet.png').catch(() => null),
      Assets.load('assets/characters/scruff-turn-sheet.png').catch(() => null),
      Assets.load('assets/characters/scruff-hop-sheet.png').catch(() => null),
      Assets.load('assets/characters/scruff-fly-sheet.png').catch(() => null),
      Assets.load('assets/characters/scruff-idle-front.png'),
    ]);

    // Slice sheets into clips
    this.clips['idle_front'] = {
      frames: idleSheet ? this.sliceSheet(idleSheet, FRAME_W, FRAME_H, 25) : [idleFront],
      fps: 16,
      loop: true,
    };

    this.clips['talking'] = {
      frames: talkSheet ? this.sliceSheet(talkSheet, FRAME_W, FRAME_H, 25) : this.clips['idle_front']!.frames,
      fps: 16,
      loop: true,
    };

    this.clips['turning'] = {
      frames: turnSheet ? this.sliceSheet(turnSheet, FRAME_W, FRAME_H, 13) : [idleFront],
      fps: 32,
      loop: false,
    };

    // Landing = turn in reverse
    this.clips['landing'] = {
      frames: [...(this.clips['turning']?.frames ?? [idleFront])].reverse(),
      fps: 32,
      loop: false,
    };

    this.clips['hopping'] = {
      frames: hopSheet ? this.sliceSheet(hopSheet, FRAME_W, FRAME_H, 13) : [idleFront],
      fps: 16,
      loop: true,
    };

    this.clips['flying'] = {
      frames: flySheet ? this.sliceSheet(flySheet, FRAME_W, FRAME_H, 25) : [idleFront],
      fps: 16,
      loop: true,
    };

    // Idle side = last frame of turn
    const turnFrames = this.clips['turning']!.frames;
    this.clips['idle_side'] = {
      frames: [turnFrames[turnFrames.length - 1]],
      fps: 1,
      loop: true,
    };
  }

  private sliceSheet(texture: Texture, frameW: number, frameH: number, count: number): Texture[] {
    const frames: Texture[] = [];
    for (let i = 0; i < count; i++) {
      frames.push(new Texture({
        source: texture.source,
        frame: new Rectangle(i * frameW, 0, frameW, frameH),
      }));
    }
    return frames;
  }

  /** Get current state. */
  getState(): AnimState {
    return this.state;
  }

  /** Get current direction. */
  getDirection(): Direction {
    return this.direction;
  }

  /** Play the idle front animation. */
  playIdleFront(): void {
    this.direction = 'right'; // neutral
    this.applyFlip();
    this.play('idle_front');
  }

  /** Play talking animation. */
  playTalking(): void {
    this.play('talking');
  }

  /** Stop talking, return to idle. */
  stopTalking(): void {
    this.play('idle_front');
  }

  /**
   * Sequence: turn toward direction → callback when turn complete.
   * If already facing that direction, callback fires immediately.
   */
  turnToward(dir: Direction): Promise<void> {
    return new Promise((resolve) => {
      if (this.state === 'turning' || this.state === 'landing') {
        // Already transitioning, wait for it
        this.onAnimComplete = () => {
          this.turnToward(dir).then(resolve);
        };
        return;
      }

      this.direction = dir;
      this.applyFlip();

      const clip = this.clips['turning'];
      if (!clip || clip.frames.length <= 1) {
        // No turn animation, just snap
        this.state = 'idle_side';
        resolve();
        return;
      }

      this.play('turning', () => {
        this.state = 'idle_side';
        resolve();
      });
    });
  }

  /** Play hopping animation (looping). */
  playHopping(dir: Direction): void {
    this.direction = dir;
    this.applyFlip();
    this.play('hopping');
  }

  /** Play flying animation (looping). */
  playFlying(dir: Direction): void {
    this.direction = dir;
    this.applyFlip();
    this.play('flying');
  }

  /**
   * Sequence: land (turn back to front) → idle.
   */
  land(): Promise<void> {
    return new Promise((resolve) => {
      const clip = this.clips['landing'];
      if (!clip || clip.frames.length <= 1) {
        this.playIdleFront();
        resolve();
        return;
      }

      this.play('landing', () => {
        this.playIdleFront();
        resolve();
      });
    });
  }

  /** Stop current animation. */
  stop(): void {
    if (this.animInterval !== null) {
      clearInterval(this.animInterval);
      this.animInterval = null;
    }
    this.onAnimComplete = null;
  }

  private play(clipName: string, onComplete?: () => void): void {
    this.stop();
    const clip = this.clips[clipName];
    if (!clip || clip.frames.length === 0) {
      onComplete?.();
      return;
    }

    this.state = clipName as AnimState;
    this.frameIndex = 0;
    this.onAnimComplete = onComplete ?? null;
    this.sprite.texture = clip.frames[0];

    const interval = 1000 / clip.fps;
    this.animInterval = window.setInterval(() => {
      this.frameIndex++;

      if (this.frameIndex >= clip.frames.length) {
        if (clip.loop) {
          this.frameIndex = 0;
        } else {
          // Non-looping clip finished — save callback before stop() clears it
          const cb = this.onAnimComplete;
          this.stop();
          cb?.();
          return;
        }
      }

      this.sprite.texture = clip.frames[this.frameIndex];
    }, interval);
  }

  private applyFlip(): void {
    const scaleX = Math.abs(this.sprite.scale.x);
    this.sprite.scale.x = this.direction === 'left' ? -scaleX : scaleX;
  }
}
