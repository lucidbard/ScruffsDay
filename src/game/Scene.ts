import { Container, Application } from 'pixi.js';
import type { GameState, SceneId } from './GameState';
import type { TweenManager } from './Tween';

export abstract class Scene {
  readonly container = new Container();
  protected app: Application;
  protected gameState: GameState;
  protected tweens: TweenManager;

  constructor(app: Application, gameState: GameState, tweens: TweenManager) {
    this.app = app;
    this.gameState = gameState;
    this.tweens = tweens;
  }

  abstract setup(): Promise<void>;
  abstract enter(fromScene?: SceneId): void;
  abstract update(deltaMs: number): void;
  abstract exit(): void;

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
