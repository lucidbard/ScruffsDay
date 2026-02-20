import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { GameState } from './game/GameState';
import { TweenManager } from './game/Tween';
import { SceneManager } from './game/SceneManager';
import { InputManager } from './game/InputManager';
import { InventoryUI } from './game/InventoryUI';
import { MenuOverlay } from './game/MenuOverlay';
import { ScrubThicket } from './scenes/ScrubThicket';
import { TortoiseBurrow } from './scenes/TortoiseBurrow';
import { CentralTrail } from './scenes/CentralTrail';
import { PineClearing } from './scenes/PineClearing';
import { SandyBarrens } from './scenes/SandyBarrens';
import { OwlsOverlook } from './scenes/OwlsOverlook';

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

  // Menu overlay
  const menuOverlay = new MenuOverlay(gameState);

  // Layer order: scenes behind, UI in front, menu on top
  gameContainer.addChild(sceneManager.container);
  gameContainer.addChild(inventoryUI.container);

  // Menu button (top-right corner)
  const menuBtn = new Container();
  const menuBtnBg = new Graphics();
  menuBtnBg.roundRect(-20, -20, 40, 40, 8);
  menuBtnBg.fill({ color: 0x3e2723, alpha: 0.6 });
  menuBtnBg.stroke({ width: 2, color: 0xfff8dc });
  const menuIcon = new Text({
    text: '\u2630',
    style: new TextStyle({ fontSize: 24, fill: '#FFF8DC' }),
  });
  menuIcon.anchor.set(0.5, 0.5);
  menuBtn.addChild(menuBtnBg, menuIcon);
  menuBtn.position.set(GAME_WIDTH - 40, 40);
  menuBtn.eventMode = 'static';
  menuBtn.cursor = 'pointer';
  menuBtn.on('pointertap', () => {
    if (menuOverlay.isVisible()) {
      menuOverlay.hide();
    } else {
      menuOverlay.show();
    }
  });
  gameContainer.addChild(menuBtn);

  // Menu overlay on top of everything
  gameContainer.addChild(menuOverlay.container);

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

  sceneManager.register('tortoise_burrow', (app, gs, tw) => {
    const scene = new TortoiseBurrow(app, gs, tw);
    scene.onSceneChange = (id) => sceneManager.switchTo(id);
    return scene;
  });

  sceneManager.register('central_trail', (app, gs, tw) => {
    const scene = new CentralTrail(app, gs, tw);
    scene.onSceneChange = (id) => sceneManager.switchTo(id);
    return scene;
  });

  sceneManager.register('pine_clearing', (app, gs, tw) => {
    const scene = new PineClearing(app, gs, tw);
    scene.onSceneChange = (id) => sceneManager.switchTo(id);
    return scene;
  });

  sceneManager.register('sandy_barrens', (app, gs, tw) => {
    const scene = new SandyBarrens(app, gs, tw);
    scene.onSceneChange = (id) => sceneManager.switchTo(id);
    return scene;
  });

  sceneManager.register('owls_overlook', (app, gs, tw) => {
    const scene = new OwlsOverlook(app, gs, tw);
    scene.onSceneChange = (id) => sceneManager.switchTo(id);
    return scene;
  });

  // Start at the scrub thicket
  await sceneManager.switchTo('scrub_thicket');
}

init();
