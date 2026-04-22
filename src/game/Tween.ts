export const Easing = {
  linear: (t: number) => t,
  easeInOut: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => t * (2 - t),
  bounce: (t: number) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
} as const;

export type EasingFn = (t: number) => number;

export interface TweenConfig {
  target: Record<string, number>;
  props: Record<string, number>;
  duration: number;
  easing?: EasingFn;
  onUpdate?: (easedT: number, t: number) => void;
  onComplete?: () => void;
  loop?: boolean;
  yoyo?: boolean;
  delay?: number;
}

interface ActiveTween {
  id: number;
  target: Record<string, number>;
  startValues: Record<string, number>;
  endValues: Record<string, number>;
  duration: number;
  elapsed: number;
  easing: EasingFn;
  onUpdate?: (easedT: number, t: number) => void;
  onComplete?: () => void;
  loop: boolean;
  yoyo: boolean;
  forward: boolean;
  delay: number;
}

let nextId = 0;

export class TweenManager {
  private tweens: ActiveTween[] = [];

  get count(): number {
    return this.tweens.length;
  }

  add(config: TweenConfig): number {
    const id = nextId++;
    const startValues: Record<string, number> = {};
    for (const key of Object.keys(config.props)) {
      startValues[key] = config.target[key] ?? 0;
    }
    this.tweens.push({
      id,
      target: config.target,
      startValues,
      endValues: { ...config.props },
      duration: config.duration,
      elapsed: 0,
      easing: config.easing ?? Easing.linear,
      onUpdate: config.onUpdate,
      onComplete: config.onComplete,
      loop: config.loop ?? false,
      yoyo: config.yoyo ?? false,
      forward: true,
      delay: config.delay ?? 0,
    });
    return id;
  }

  cancel(id: number): void {
    this.tweens = this.tweens.filter((t) => t.id !== id);
  }

  cancelAll(): void {
    this.tweens = [];
  }

  update(deltaMs: number): void {
    const completed: number[] = [];

    for (const tween of this.tweens) {
      if (tween.delay > 0) {
        tween.delay -= deltaMs;
        if (tween.delay > 0) continue;
        deltaMs = -tween.delay;
        tween.delay = 0;
      }

      tween.elapsed += deltaMs;
      let t = Math.min(tween.elapsed / tween.duration, 1);
      const easedT = tween.easing(tween.forward ? t : 1 - t);

      for (const key of Object.keys(tween.endValues)) {
        const start = tween.startValues[key];
        const end = tween.endValues[key];
        tween.target[key] = start + (end - start) * easedT;
      }

      tween.onUpdate?.(easedT, t);

      if (t >= 1) {
        if (tween.loop) {
          tween.elapsed = 0;
          if (tween.yoyo) {
            tween.forward = !tween.forward;
          }
        } else {
          tween.onComplete?.();
          completed.push(tween.id);
        }
      }
    }

    this.tweens = this.tweens.filter((t) => !completed.includes(t.id));
  }
}
