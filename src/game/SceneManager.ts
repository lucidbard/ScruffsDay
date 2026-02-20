import { Application, Container, Graphics } from 'pixi.js';
import type { Scene } from './Scene';
import type { SceneId, GameState } from './GameState';
import { Easing, type TweenManager } from './Tween';

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
  private switching = false;
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
    if (this.switching) return;
    this.switching = true;

    try {
      // Create fade overlay
      const overlay = new Graphics();
      overlay.rect(0, 0, 1280, 720);
      overlay.fill({ color: 0x000000 });
      overlay.alpha = 0;
      this.container.addChild(overlay);

      // Fade out
      await new Promise<void>((resolve) => {
        this.tweens.add({
          target: overlay as unknown as Record<string, number>,
          props: { alpha: 1 },
          duration: 300,
          easing: Easing.easeInOut,
          onComplete: resolve,
        });
      });

      // Exit current scene
      if (this.activeScene) {
        this.activeScene.exit();
        this.container.removeChild(this.activeScene.container);
      }

      // Get or create target scene
      let scene = this.scenes.get(id);
      if (!scene) {
        const factory = this.factories.get(id);
        if (!factory) throw new Error(`No scene registered for: ${id}`);
        scene = factory(this.app, this.gameState, this.tweens);
        await scene.setup();
        this.scenes.set(id, scene);
      }

      // Enter new scene (insert behind overlay)
      this.container.addChildAt(
        scene.container,
        this.container.children.indexOf(overlay)
      );
      scene.enter();
      this.activeScene = scene;
      this.activeSceneId = id;
      this.gameState.visitScene(id);

      // Auto-save on scene transition
      this.gameState.save();

      // Fade in
      await new Promise<void>((resolve) => {
        this.tweens.add({
          target: overlay as unknown as Record<string, number>,
          props: { alpha: 0 },
          duration: 300,
          easing: Easing.easeInOut,
          onComplete: () => {
            this.container.removeChild(overlay);
            resolve();
          },
        });
      });
    } finally {
      this.switching = false;
    }
  }

  update(deltaMs: number): void {
    this.activeScene?.update(deltaMs);
  }

  getActiveSceneId(): SceneId | null {
    return this.activeSceneId;
  }
}
