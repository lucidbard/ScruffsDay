import { Application, Container } from 'pixi.js';
import type { Scene } from './Scene';
import type { SceneId, GameState } from './GameState';
import type { TweenManager } from './Tween';

type SceneFactory = (
  app: Application,
  gameState: GameState,
  tweens: TweenManager
) => Scene;

export class SceneManager {
  private scenes = new Map<SceneId, Scene>();
  private factories = new Map<SceneId, SceneFactory>();
  private activeScene: Scene | null = null;
  private activeSceneId: SceneId | null = null;
  readonly container = new Container();

  constructor(
    private app: Application,
    private gameState: GameState,
    private tweens: TweenManager
  ) {}

  register(id: SceneId, factory: SceneFactory): void {
    this.factories.set(id, factory);
  }

  async switchTo(id: SceneId): Promise<void> {
    if (this.activeScene) {
      this.activeScene.exit();
      this.container.removeChild(this.activeScene.container);
    }

    let scene = this.scenes.get(id);
    if (!scene) {
      const factory = this.factories.get(id);
      if (!factory) throw new Error(`No scene registered for: ${id}`);
      scene = factory(this.app, this.gameState, this.tweens);
      await scene.setup();
      this.scenes.set(id, scene);
    }

    this.container.addChild(scene.container);
    scene.enter();
    this.activeScene = scene;
    this.activeSceneId = id;
    this.gameState.visitScene(id);
  }

  update(deltaMs: number): void {
    this.activeScene?.update(deltaMs);
  }

  getActiveSceneId(): SceneId | null {
    return this.activeSceneId;
  }
}
