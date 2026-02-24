import { Container, Application } from 'pixi.js';
import type { GameState, SceneId } from './GameState';
import type { TweenManager } from './Tween';
import { depthSort, computeDepthScale } from './DepthSort';
import type { DepthScaleConfig } from './DepthSort';

export abstract class Scene {
  readonly container = new Container();
  protected app: Application;
  protected gameState: GameState;
  protected tweens: TweenManager;
  protected depthContainer?: Container;

  constructor(app: Application, gameState: GameState, tweens: TweenManager) {
    this.app = app;
    this.gameState = gameState;
    this.tweens = tweens;
  }

  abstract setup(): Promise<void>;
  abstract enter(fromScene?: SceneId): void;
  abstract update(deltaMs: number): void;
  abstract exit(): void;

  /** Re-sort depthContainer children by Y position. */
  protected sortDepth(): void {
    if (this.depthContainer) depthSort(this.depthContainer);
  }

  /** Apply depth-based scaling to characters based on their Y position. */
  protected applyDepthScaling(
    config: DepthScaleConfig,
    characters: { applyDepthScale(factor: number): void; container: { y: number } }[],
  ): void {
    for (const c of characters) {
      c.applyDepthScale(computeDepthScale(c.container.y, config));
    }
  }

  /** Override in subclasses to rebuild data after debug edits. */
  refreshDebugData(): void {
    // no-op by default
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
