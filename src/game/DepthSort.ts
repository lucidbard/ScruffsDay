import type { Container } from 'pixi.js';

export interface DepthScaleConfig {
  minY: number;
  maxY: number;
  minScale: number;
  maxScale: number;
}

/** Linear interpolation of scale based on Y position, clamped to config range. */
export function computeDepthScale(y: number, config: DepthScaleConfig): number {
  const t = Math.max(0, Math.min(1, (y - config.minY) / (config.maxY - config.minY)));
  return config.minScale + t * (config.maxScale - config.minScale);
}

/**
 * Sort a Container's children by their Y position (ascending).
 * Lower Y = further back = rendered first.
 * Uses addChild() which moves existing children to the end in Pixi v8.
 */
export function depthSort(parent: Container): void {
  const sorted = [...parent.children].sort((a, b) => a.position.y - b.position.y);
  for (const child of sorted) {
    parent.addChild(child);
  }
}
