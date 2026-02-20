import { Application, Container, Graphics } from 'pixi.js';
import { GameState } from './game/GameState';
import { TweenManager } from './game/Tween';
import { SceneManager } from './game/SceneManager';
import { InputManager } from './game/InputManager';
import { InventoryUI } from './game/InventoryUI';
import { ScrubThicket } from './scenes/ScrubThicket';

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

async function init() {
  const app = new Application();
  await app.init({
    background: '#87CEEB',
    resizeTo: window,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  document.body.appendChild(app.canvas);

  // Game container - all game content goes here, gets scaled uniformly
  const gameContainer = new Container();
  app.stage.addChild(gameContainer);

  // Hit area for input (full game area)
  const hitArea = new Graphics();
  hitArea.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  hitArea.fill({ color: 0x000000, alpha: 0 });
  gameContainer.addChild(hitArea);

  // Core systems
  const gameState = GameState.load() ?? new GameState();
  const tweens = new TweenManager();
  const sceneManager = new SceneManager(app, gameState, tweens);
  const inputManager = new InputManager(hitArea);
  const inventoryUI = new InventoryUI(gameState, tweens, new Map());

  // Layer order: scenes behind, UI in front
  gameContainer.addChild(sceneManager.container);
  gameContainer.addChild(inventoryUI.container);

  inventoryUI.layout(GAME_WIDTH, GAME_HEIGHT);

  // Responsive scaling
  function resize() {
    const scale = Math.min(
      window.innerWidth / GAME_WIDTH,
      window.innerHeight / GAME_HEIGHT
    );
    gameContainer.scale.set(scale);
    gameContainer.position.set(
      (window.innerWidth - GAME_WIDTH * scale) / 2,
      (window.innerHeight - GAME_HEIGHT * scale) / 2
    );
  }
  window.addEventListener('resize', resize);
  resize();

  // Game loop
  app.ticker.add((ticker) => {
    const deltaMs = ticker.deltaMS;
    tweens.update(deltaMs);
    sceneManager.update(deltaMs);
    inventoryUI.refresh();
  });

  // Register scenes
  sceneManager.register('scrub_thicket', (app, gs, tw) => {
    const scene = new ScrubThicket(app, gs, tw);
    scene.onSceneChange = (id) => sceneManager.switchTo(id);
    return scene;
  });

  // Start at the scrub thicket
  await sceneManager.switchTo('scrub_thicket');
}

init();
