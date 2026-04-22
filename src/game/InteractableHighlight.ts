import { Container, Graphics } from 'pixi.js';
import type { TweenManager } from './Tween';
import { Easing } from './Tween';

/**
 * Attach a soft pulsing glow behind an interactable container so younger players
 * can spot what can be tapped without exhaustive exploration.
 *
 * Returns a disposer that cancels the tween and removes the glow.
 */
export function attachInteractableHighlight(
  host: Container,
  radius: number,
  tweens: TweenManager,
  opts: { color?: number; yOffset?: number; baseAlpha?: number; peakAlpha?: number; durationMs?: number } = {},
): () => void {
  const color = opts.color ?? 0xFFD700;
  const yOffset = opts.yOffset ?? -radius * 0.6;
  const baseAlpha = opts.baseAlpha ?? 0.12;
  const peakAlpha = opts.peakAlpha ?? 0.32;
  const duration = opts.durationMs ?? 1100;

  const glow = new Graphics();
  glow.circle(0, yOffset, radius);
  glow.fill({ color, alpha: baseAlpha });
  host.addChildAt(glow, 0);

  // Pulse by tweening scale (works consistently across Pixi v8 Graphics).
  const tweenId = tweens.add({
    target: glow.scale as unknown as Record<string, number>,
    props: { x: 1.25, y: 1.25 },
    duration,
    yoyo: true,
    loop: true,
    easing: Easing.easeInOut,
  });

  // Independent alpha breath via onUpdate on a parallel dummy tween.
  const breath = { a: 0 };
  const alphaTweenId = tweens.add({
    target: breath,
    props: { a: 1 },
    duration,
    yoyo: true,
    loop: true,
    easing: Easing.easeInOut,
    onUpdate: (eased) => {
      glow.alpha = baseAlpha + (peakAlpha - baseAlpha) * eased;
    },
  });

  return () => {
    tweens.cancel(tweenId);
    tweens.cancel(alphaTweenId);
    if (glow.parent) glow.parent.removeChild(glow);
    glow.destroy();
  };
}
