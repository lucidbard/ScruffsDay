import { Application, Assets, Container, Graphics, Sprite, Text, Texture, TextStyle } from 'pixi.js';
import { GameState } from './game/GameState';
import type { ItemId } from './game/GameState';
import { TweenManager } from './game/Tween';
import { SceneManager } from './game/SceneManager';
import { InputManager } from './game/InputManager';
import { InventoryUI } from './game/InventoryUI';
import { MenuOverlay } from './game/MenuOverlay';
import { FastTravelMapOverlay } from './game/FastTravelMapOverlay';
import { ScrubThicket } from './scenes/ScrubThicket';
import { TortoiseBurrow } from './scenes/TortoiseBurrow';
import { CentralTrail } from './scenes/CentralTrail';
import { PineClearing } from './scenes/PineClearing';
import { SandyBarrens } from './scenes/SandyBarrens';
import { OwlsOverlook } from './scenes/OwlsOverlook';
import { IntroSequence } from './scenes/IntroSequence';
import { SplashScreen } from './scenes/SplashScreen';
import { VineBuster } from './minigames/VineBuster';
import { SeedScatter } from './minigames/SeedScatter';
import { NightWatch } from './minigames/NightWatch';
import { WalkableAreaDebug } from './game/WalkableAreaDebug';
import { DebugPanel } from './game/DebugPanel';

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

// Vite injects BASE_URL at build time; fall back to root for tests
const BASE_URL: string =
  (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

async function init() {
  const app = new Application();
  await app.init({
    // Transparent so the blurred scene-matte <div> behind the canvas fills
    // the letterbox bars instead of a flat sky color.
    backgroundAlpha: 0,
    resizeTo: window,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl',
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

  // Mask the game to its internal 1280x720 bounds so characters flying off-
  // screen disappear at the scene edge instead of drifting out over the
  // blurred matte behind the canvas.
  const gameMask = new Graphics();
  gameMask.rect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  gameMask.fill({ color: 0xffffff });
  gameContainer.addChild(gameMask);
  gameContainer.mask = gameMask;

  // Preload item textures for inventory display
  const itemTexturePaths: Record<string, string> = {
    saw_palmetto_fronds: 'assets/items/saw-palmetto-fronds.png',
    scrub_hickory_nuts: 'assets/items/scrub-hickory-nuts.png',
    sand_pine_cones: 'assets/items/sand-pine-cones.png',
    florida_rosemary_cuttings: 'assets/items/florida-rosemary-cuttings.png',
    rusty_lyonia_flowers: 'assets/items/rusty-lyonia-flowers.png',
    chapman_oak_acorns: 'assets/items/chapman-oak-acorns.png',
    flicker_feather: 'assets/items/flicker-feather.png',
    pip_map: 'assets/items/pip-map.png',
  };

  const itemTextures = new Map<ItemId, Texture>();
  for (const [id, path] of Object.entries(itemTexturePaths)) {
    try {
      const tex = await Assets.load(path);
      itemTextures.set(id as ItemId, tex);
    } catch {
      // Item texture not available - will show placeholder
    }
  }

  // Preload UI textures so they're cached for immediate use
  try { await Assets.load('assets/ui/dialogue-bubble-bg.png'); } catch { /* optional */ }
  try { await Assets.load('assets/ui/map-icon.png'); } catch { /* optional */ }

  // Core systems
  const gameState = GameState.load() ?? new GameState();
  const tweens = new TweenManager();
  const sceneManager = new SceneManager(app, gameState, tweens);
  const inputManager = new InputManager(hitArea);
  const inventoryUI = new InventoryUI(gameState, tweens, itemTextures);

  // Menu overlay
  const menuOverlay = new MenuOverlay(gameState);
  const fastTravelMap = new FastTravelMapOverlay(gameState);
  await fastTravelMap.setup();

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
    if (fastTravelMap.isVisible()) {
      fastTravelMap.hide();
    }
    if (menuOverlay.isVisible()) {
      menuOverlay.hide();
    } else {
      menuOverlay.show();
    }
  });
  gameContainer.addChild(menuBtn);

  // Fast-travel map button (hidden until unlocked)
  const mapBtn = new Container();
  const mapBtnBg = new Graphics();
  mapBtnBg.roundRect(-20, -20, 40, 40, 8);
  mapBtnBg.fill({ color: 0x3e2723, alpha: 0.6 });
  mapBtnBg.stroke({ width: 2, color: 0xfff8dc });
  mapBtn.addChild(mapBtnBg);

  const mapIconTexture = Assets.cache.get('assets/ui/map-icon.png');
  if (mapIconTexture) {
    const mapIcon = new Sprite(mapIconTexture as Texture);
    mapIcon.anchor.set(0.5, 0.5);
    const iconScale = Math.min(26 / mapIcon.texture.width, 26 / mapIcon.texture.height);
    mapIcon.scale.set(iconScale);
    mapBtn.addChild(mapIcon);
  } else {
    const mapFallback = new Text({
      text: 'M',
      style: new TextStyle({ fontSize: 22, fill: '#FFF8DC', fontWeight: 'bold' }),
    });
    mapFallback.anchor.set(0.5, 0.5);
    mapBtn.addChild(mapFallback);
  }

  mapBtn.position.set(GAME_WIDTH - 90, 40);
  mapBtn.eventMode = 'static';
  mapBtn.cursor = 'pointer';
  mapBtn.visible = false;
  mapBtn.on('pointertap', () => {
    if (menuOverlay.isVisible()) {
      menuOverlay.hide();
    }
    if (fastTravelMap.isVisible()) {
      fastTravelMap.hide();
    } else {
      fastTravelMap.show();
    }
  });
  gameContainer.addChild(mapBtn);

  // Debug cog button (next to hamburger, only in debug mode)
  let debugPanel: DebugPanel | null = null;
  if (WalkableAreaDebug.isEnabled()) {
    const cogBtn = new Container();
    const cogBg = new Graphics();
    cogBg.roundRect(-20, -20, 40, 40, 8);
    cogBg.fill({ color: 0x3e2723, alpha: 0.6 });
    cogBg.stroke({ width: 2, color: 0xfff8dc });
    const cogIcon = new Text({
      text: '\u2699',
      style: new TextStyle({ fontSize: 24, fill: '#FFF8DC' }),
    });
    cogIcon.anchor.set(0.5, 0.5);
    cogBtn.addChild(cogBg, cogIcon);
    cogBtn.position.set(GAME_WIDTH - 140, 40);
    cogBtn.eventMode = 'static';
    cogBtn.cursor = 'pointer';
    cogBtn.on('pointertap', () => {
      debugPanel?.toggle();
    });
    gameContainer.addChild(cogBtn);
  }

  // Menu overlay on top of everything
  gameContainer.addChild(menuOverlay.container);
  gameContainer.addChild(fastTravelMap.container);

  inventoryUI.layout(GAME_WIDTH, GAME_HEIGHT);

  // Responsive scaling
  function resize() {
    const scale = Math.min(
      window.innerWidth / GAME_WIDTH,
      window.innerHeight / GAME_HEIGHT
    );
    gameContainer.scale.set(scale);
    // Always vertically center. Debug panel uses position:fixed so it
    // overlays without pushing the canvas.
    gameContainer.position.set(
      (window.innerWidth - GAME_WIDTH * scale) / 2,
      Math.max(0, (window.innerHeight - GAME_HEIGHT * scale) / 2),
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

    const activeSceneId = sceneManager.getActiveSceneId();
    // Inventory bar stays hidden in splash/intro AND until the player has
    // learned from Shelly that collecting plants matters.
    const inventoryVisible =
      activeSceneId !== 'splash' &&
      activeSceneId !== 'intro' &&
      gameState.getFlag('knows_saw_palmetto');
    inventoryUI.container.visible = inventoryVisible;

    const mapAvailable =
      activeSceneId !== 'splash' &&
      activeSceneId !== 'intro' &&
      gameState.hasItem('pip_map');
    mapBtn.visible = mapAvailable;
    if (!mapAvailable && fastTravelMap.isVisible()) {
      fastTravelMap.hide();
    }
  });

  // Register scenes
  sceneManager.register('splash', (app, gs, tw) => {
    const scene = new SplashScreen(app, gs, tw);
    scene.onSceneChange = (id, dir) => sceneManager.switchTo(id, dir);
    return scene;
  });

  sceneManager.register('intro', (app, gs, tw) => {
    const scene = new IntroSequence(app, gs, tw);
    scene.onSceneChange = (id, dir) => {
      // Inventory visibility now managed by ticker based on knows_saw_palmetto flag.
      menuBtn.visible = true;
      sceneManager.switchTo(id, dir);
    };
    return scene;
  });

  sceneManager.register('scrub_thicket', (app, gs, tw) => {
    const scene = new ScrubThicket(app, gs, tw);
    scene.onSceneChange = (id, dir) => sceneManager.switchTo(id, dir);
    return scene;
  });

  sceneManager.register('tortoise_burrow', (app, gs, tw) => {
    const scene = new TortoiseBurrow(app, gs, tw);
    scene.onSceneChange = (id, dir) => sceneManager.switchTo(id, dir);
    return scene;
  });

  sceneManager.register('central_trail', (app, gs, tw) => {
    const scene = new CentralTrail(app, gs, tw);
    scene.onSceneChange = (id, dir) => sceneManager.switchTo(id, dir);
    return scene;
  });

  sceneManager.register('pine_clearing', (app, gs, tw) => {
    const scene = new PineClearing(app, gs, tw);
    scene.onSceneChange = (id, dir) => sceneManager.switchTo(id, dir);
    return scene;
  });

  sceneManager.register('sandy_barrens', (app, gs, tw) => {
    const scene = new SandyBarrens(app, gs, tw);
    scene.onSceneChange = (id, dir) => sceneManager.switchTo(id, dir);
    return scene;
  });

  sceneManager.register('owls_overlook', (app, gs, tw) => {
    const scene = new OwlsOverlook(app, gs, tw);
    scene.onSceneChange = (id, dir) => sceneManager.switchTo(id, dir);
    return scene;
  });

  sceneManager.register('vine_buster', (_app, gs, tw) => {
    const scene = new VineBuster(_app, gs, tw);
    scene.onComplete = () => sceneManager.switchTo('pine_clearing');
    return scene;
  });

  sceneManager.register('seed_scatter', (_app, gs, tw) => {
    const scene = new SeedScatter(_app, gs, tw);
    scene.onComplete = () => sceneManager.switchTo('sandy_barrens');
    return scene;
  });

  sceneManager.register('night_watch', (_app, gs, tw) => {
    const scene = new NightWatch(_app, gs, tw);
    scene.onComplete = () => sceneManager.switchTo('owls_overlook');
    return scene;
  });

  fastTravelMap.onTravel = (sceneId) => {
    sceneManager.switchTo(sceneId);
  };

  // Debug panel (overlay, toggled by cog button)
  if (WalkableAreaDebug.isEnabled()) {
    debugPanel = new DebugPanel(sceneManager, gameState);
  }

  // Hide menu during intro, show for all other scenes.
  // Inventory visibility is fully driven by the ticker (flag-based).
  // Blurred background matte behind the letterboxed game — fills the dead
  // space (especially on iPad 4:3) with a softly-blurred scaled-up copy of
  // the current scene's background so the empty edges feel intentional.
  const matteEl = document.getElementById('scene-matte');
  const matteBgFor: Record<string, string> = {
    splash: '',
    intro: '',
    scrub_thicket: 'assets/backgrounds/scrub-thicket-bg.png',
    tortoise_burrow: 'assets/backgrounds/tortoise-burrow-bg.png',
    central_trail: 'assets/backgrounds/central-trail-bg.png',
    pine_clearing: 'assets/backgrounds/pine-clearing-bg.png',
    sandy_barrens: 'assets/backgrounds/sandy-barrens-bg.png',
    owls_overlook: 'assets/backgrounds/owls-overlook-bg.png',
    vine_buster: 'assets/backgrounds/pine-clearing-bg.png',
    seed_scatter: 'assets/backgrounds/sandy-barrens-bg.png',
    night_watch: 'assets/backgrounds/owls-overlook-bg.png',
  };

  const origOnSwitch = sceneManager.onSceneSwitch;
  sceneManager.onSceneSwitch = (id) => {
    fastTravelMap.hide();
    if (id === 'splash' || id === 'intro') {
      menuBtn.visible = false;
      mapBtn.visible = false;
    } else {
      menuBtn.visible = true;
    }
    if (matteEl) {
      const bg = matteBgFor[id];
      matteEl.style.backgroundImage = bg ? `url('${BASE_URL}${bg}')` : '';
    }
    origOnSwitch?.(id);
  };

  // Debug: allow jumping directly to a scene via ?scene=scene_id
  const urlParams = new URLSearchParams(window.location.search);
  const debugScene = urlParams.get('scene');

  if (debugScene && sceneManager.has(debugScene)) {
    gameState.setFlag('intro_seen');
    menuBtn.visible = true;
    await sceneManager.switchTo(debugScene as import('./game/GameState').SceneId);
  } else if (!gameState.getFlag('intro_seen')) {
    await sceneManager.switchTo('splash');
  } else {
    // If intro was seen, return to the last saved scene
    await sceneManager.switchTo(gameState.currentScene);
  }
}

init();
