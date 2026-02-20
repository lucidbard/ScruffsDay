# Scruff's Day Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a 20-30 minute point-and-click adventure game about a scrub jay restoring native plants at Lyonia Preserve, playable on mobile browsers and deployed to GitHub Pages.

**Architecture:** Scene-graph adventure using PixiJS v8. Each preserve location is a PixiJS Container that the SceneManager swaps in/out. A central GameState tracks inventory and story flags. Characters are multi-part SVG assemblies animated via a lightweight custom tween system. Three self-contained arcade mini-game scenes.

**Tech Stack:** PixiJS v8, TypeScript, Vite, Vitest, GitHub Pages

**Design Doc:** `docs/plans/2026-02-20-scruffs-day-design.md`

---

## Phase 1: Project Scaffolding

### Task 1: Initialize Vite + TypeScript + PixiJS project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`

**Step 1: Initialize project and install dependencies**

Run:
```bash
npm init -y
npm install pixi.js@^8
npm install -D typescript vite vitest @types/node
```

**Step 2: Configure TypeScript**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**Step 3: Configure Vite**

`vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: '/ScruffsDay/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
```

**Step 4: Create index.html**

`index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Scruff's Day</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #87CEEB; }
    canvas { display: block; touch-action: none; }
  </style>
</head>
<body>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

**Step 5: Create entry point with PixiJS app**

`src/main.ts`:
```typescript
import { Application } from 'pixi.js';

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

  // Scale game to fit viewport while maintaining aspect ratio
  function resize() {
    const scale = Math.min(
      window.innerWidth / GAME_WIDTH,
      window.innerHeight / GAME_HEIGHT
    );
    app.stage.scale.set(scale);
    app.stage.position.set(
      (window.innerWidth - GAME_WIDTH * scale) / 2,
      (window.innerHeight - GAME_HEIGHT * scale) / 2
    );
  }
  window.addEventListener('resize', resize);
  resize();
}

init();
```

**Step 6: Add npm scripts to package.json**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "deploy": "npm run build && npx gh-pages -d dist"
  }
}
```

**Step 7: Run dev server and verify blue sky background renders**

Run: `npm run dev`
Expected: Browser opens showing solid `#87CEEB` sky blue canvas filling the viewport.

**Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.ts
git commit -m "feat: scaffold Vite + TypeScript + PixiJS project"
```

---

## Phase 2: Core Engine

### Task 2: GameState - inventory and story flags

**Files:**
- Create: `src/game/GameState.ts`
- Create: `src/game/__tests__/GameState.test.ts`

**Step 1: Write failing tests for GameState**

`src/game/__tests__/GameState.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '../GameState';

describe('GameState', () => {
  let state: GameState;

  beforeEach(() => {
    state = new GameState();
  });

  describe('inventory', () => {
    it('starts with empty inventory', () => {
      expect(state.getInventory()).toEqual([]);
    });

    it('adds items to inventory', () => {
      state.addItem('saw_palmetto_fronds');
      expect(state.getInventory()).toContain('saw_palmetto_fronds');
    });

    it('removes items from inventory', () => {
      state.addItem('saw_palmetto_fronds');
      state.removeItem('saw_palmetto_fronds');
      expect(state.getInventory()).not.toContain('saw_palmetto_fronds');
    });

    it('checks if item exists', () => {
      expect(state.hasItem('saw_palmetto_fronds')).toBe(false);
      state.addItem('saw_palmetto_fronds');
      expect(state.hasItem('saw_palmetto_fronds')).toBe(true);
    });

    it('does not add duplicate items', () => {
      state.addItem('saw_palmetto_fronds');
      state.addItem('saw_palmetto_fronds');
      expect(state.getInventory()).toHaveLength(1);
    });
  });

  describe('flags', () => {
    it('starts with no flags set', () => {
      expect(state.getFlag('shelly_helped')).toBe(false);
    });

    it('sets and gets flags', () => {
      state.setFlag('shelly_helped');
      expect(state.getFlag('shelly_helped')).toBe(true);
    });

    it('clears flags', () => {
      state.setFlag('shelly_helped');
      state.clearFlag('shelly_helped');
      expect(state.getFlag('shelly_helped')).toBe(false);
    });
  });

  describe('scene tracking', () => {
    it('starts at scrub_thicket', () => {
      expect(state.currentScene).toBe('scrub_thicket');
    });

    it('tracks visited scenes', () => {
      expect(state.hasVisited('central_trail')).toBe(false);
      state.visitScene('central_trail');
      expect(state.hasVisited('central_trail')).toBe(true);
    });
  });

  describe('serialization', () => {
    it('serializes and deserializes state', () => {
      state.addItem('saw_palmetto_fronds');
      state.setFlag('shelly_helped');
      state.visitScene('central_trail');

      const json = state.serialize();
      const restored = GameState.deserialize(json);

      expect(restored.hasItem('saw_palmetto_fronds')).toBe(true);
      expect(restored.getFlag('shelly_helped')).toBe(true);
      expect(restored.hasVisited('central_trail')).toBe(true);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/__tests__/GameState.test.ts`
Expected: FAIL - module not found

**Step 3: Implement GameState**

`src/game/GameState.ts`:
```typescript
export type ItemId =
  | 'saw_palmetto_fronds'
  | 'scrub_hickory_nuts'
  | 'sand_pine_cones'
  | 'florida_rosemary_cuttings'
  | 'rusty_lyonia_flowers'
  | 'chapman_oak_acorns'
  | 'flicker_feather'
  | 'pip_map';

export type SceneId =
  | 'scrub_thicket'
  | 'tortoise_burrow'
  | 'central_trail'
  | 'pine_clearing'
  | 'sandy_barrens'
  | 'owls_overlook';

export type FlagId =
  | 'tutorial_complete'
  | 'shelly_helped'
  | 'pip_helped'
  | 'flicker_helped'
  | 'sunny_helped'
  | 'vine_buster_complete'
  | 'seed_scatter_complete'
  | 'night_watch_complete'
  | 'fast_travel_unlocked'
  | 'game_complete';

interface SerializedState {
  inventory: ItemId[];
  flags: FlagId[];
  currentScene: SceneId;
  visitedScenes: SceneId[];
}

export class GameState {
  private inventory: Set<ItemId> = new Set();
  private flags: Set<FlagId> = new Set();
  private visitedScenes: Set<SceneId> = new Set(['scrub_thicket']);
  currentScene: SceneId = 'scrub_thicket';

  getInventory(): ItemId[] {
    return [...this.inventory];
  }

  addItem(item: ItemId): void {
    this.inventory.add(item);
  }

  removeItem(item: ItemId): void {
    this.inventory.delete(item);
  }

  hasItem(item: ItemId): boolean {
    return this.inventory.has(item);
  }

  setFlag(flag: FlagId): void {
    this.flags.add(flag);
  }

  clearFlag(flag: FlagId): void {
    this.flags.delete(flag);
  }

  getFlag(flag: FlagId): boolean {
    return this.flags.has(flag);
  }

  visitScene(scene: SceneId): void {
    this.visitedScenes.add(scene);
    this.currentScene = scene;
  }

  hasVisited(scene: SceneId): boolean {
    return this.visitedScenes.has(scene);
  }

  getVisitedScenes(): SceneId[] {
    return [...this.visitedScenes];
  }

  serialize(): string {
    const data: SerializedState = {
      inventory: [...this.inventory],
      flags: [...this.flags],
      currentScene: this.currentScene,
      visitedScenes: [...this.visitedScenes],
    };
    return JSON.stringify(data);
  }

  static deserialize(json: string): GameState {
    const data: SerializedState = JSON.parse(json);
    const state = new GameState();
    data.inventory.forEach((item) => state.addItem(item));
    data.flags.forEach((flag) => state.setFlag(flag));
    data.visitedScenes.forEach((scene) => state.visitedScenes.add(scene));
    state.currentScene = data.currentScene;
    return state;
  }

  save(): void {
    localStorage.setItem('scruffs_day_save', this.serialize());
  }

  static load(): GameState | null {
    const json = localStorage.getItem('scruffs_day_save');
    if (!json) return null;
    return GameState.deserialize(json);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/__tests__/GameState.test.ts`
Expected: All 9 tests PASS

**Step 5: Commit**

```bash
git add src/game/GameState.ts src/game/__tests__/GameState.test.ts
git commit -m "feat: add GameState with inventory, flags, and serialization"
```

---

### Task 3: Tween system for animations

**Files:**
- Create: `src/game/Tween.ts`
- Create: `src/game/__tests__/Tween.test.ts`

**Step 1: Write failing tests**

`src/game/__tests__/Tween.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TweenManager, Easing } from '../Tween';

describe('TweenManager', () => {
  let manager: TweenManager;

  beforeEach(() => {
    manager = new TweenManager();
  });

  it('tweens a numeric property over time', () => {
    const obj = { x: 0 };
    manager.add({ target: obj, props: { x: 100 }, duration: 1000 });

    manager.update(500); // halfway
    expect(obj.x).toBeCloseTo(50, 0);

    manager.update(500); // complete
    expect(obj.x).toBeCloseTo(100, 0);
  });

  it('removes completed tweens', () => {
    const obj = { x: 0 };
    manager.add({ target: obj, props: { x: 100 }, duration: 1000 });
    manager.update(1000);
    expect(manager.count).toBe(0);
  });

  it('calls onComplete when done', () => {
    const obj = { x: 0 };
    let called = false;
    manager.add({
      target: obj,
      props: { x: 100 },
      duration: 1000,
      onComplete: () => { called = true; },
    });
    manager.update(1000);
    expect(called).toBe(true);
  });

  it('supports looping tweens', () => {
    const obj = { x: 0 };
    manager.add({
      target: obj,
      props: { x: 100 },
      duration: 1000,
      loop: true,
    });
    manager.update(1000); // first loop done
    expect(obj.x).toBeCloseTo(100, 0);
    manager.update(500); // halfway through second loop
    expect(obj.x).toBeCloseTo(50, 0);
  });

  it('supports yoyo (ping-pong) tweens', () => {
    const obj = { x: 0 };
    manager.add({
      target: obj,
      props: { x: 100 },
      duration: 1000,
      yoyo: true,
      loop: true,
    });
    manager.update(1000); // reached 100
    manager.update(500); // going back, halfway = 50
    expect(obj.x).toBeCloseTo(50, 0);
  });

  it('supports easeInOut easing', () => {
    const obj = { x: 0 };
    manager.add({
      target: obj,
      props: { x: 100 },
      duration: 1000,
      easing: Easing.easeInOut,
    });
    manager.update(500);
    // easeInOut at 0.5 = 0.5, so x should be ~50
    expect(obj.x).toBeCloseTo(50, 0);
  });

  it('can cancel tweens by id', () => {
    const obj = { x: 0 };
    const id = manager.add({ target: obj, props: { x: 100 }, duration: 1000 });
    manager.cancel(id);
    manager.update(1000);
    expect(obj.x).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/__tests__/Tween.test.ts`
Expected: FAIL

**Step 3: Implement TweenManager**

`src/game/Tween.ts`:
```typescript
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
```

**Step 4: Run tests**

Run: `npx vitest run src/game/__tests__/Tween.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add src/game/Tween.ts src/game/__tests__/Tween.test.ts
git commit -m "feat: add TweenManager for character and UI animations"
```

---

### Task 4: SceneManager

**Files:**
- Create: `src/game/Scene.ts` (base class)
- Create: `src/game/SceneManager.ts`

**Step 1: Define Scene base class**

`src/game/Scene.ts`:
```typescript
import { Container, Application } from 'pixi.js';
import type { GameState } from './GameState';
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

  /** Called once when scene is first created. Load assets, build display tree. */
  abstract setup(): Promise<void>;

  /** Called each time the scene becomes active. Reset animations, update state-dependent visuals. */
  abstract enter(): void;

  /** Called each frame while scene is active. deltaMs = milliseconds since last frame. */
  abstract update(deltaMs: number): void;

  /** Called when leaving this scene. Stop animations, cleanup. */
  abstract exit(): void;

  /** Called once when scene is permanently destroyed. Release resources. */
  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

**Step 2: Implement SceneManager**

`src/game/SceneManager.ts`:
```typescript
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

    // Enter new scene
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
```

**Step 3: Commit**

```bash
git add src/game/Scene.ts src/game/SceneManager.ts
git commit -m "feat: add Scene base class and SceneManager"
```

---

### Task 5: InputManager for tap-to-move

**Files:**
- Create: `src/game/InputManager.ts`

**Step 1: Implement InputManager**

`src/game/InputManager.ts`:
```typescript
import { Container, FederatedPointerEvent } from 'pixi.js';

export interface TapEvent {
  /** Position in game coordinates */
  x: number;
  y: number;
  /** The original pixi event */
  originalEvent: FederatedPointerEvent;
}

type TapHandler = (event: TapEvent) => void;

export class InputManager {
  private handlers: TapHandler[] = [];
  private tapStartPos: { x: number; y: number } | null = null;

  /** Maximum distance between pointerdown and pointerup to count as a tap */
  private static readonly TAP_THRESHOLD = 10;

  constructor(hitArea: Container) {
    hitArea.eventMode = 'static';
    hitArea.cursor = 'pointer';

    hitArea.on('pointerdown', (e: FederatedPointerEvent) => {
      const pos = e.getLocalPosition(hitArea);
      this.tapStartPos = { x: pos.x, y: pos.y };
    });

    hitArea.on('pointerup', (e: FederatedPointerEvent) => {
      if (!this.tapStartPos) return;
      const pos = e.getLocalPosition(hitArea);
      const dx = pos.x - this.tapStartPos.x;
      const dy = pos.y - this.tapStartPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < InputManager.TAP_THRESHOLD) {
        const event: TapEvent = { x: pos.x, y: pos.y, originalEvent: e };
        for (const handler of this.handlers) {
          handler(event);
        }
      }
      this.tapStartPos = null;
    });

    hitArea.on('pointerupoutside', () => {
      this.tapStartPos = null;
    });
  }

  onTap(handler: TapHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }
}
```

**Step 2: Commit**

```bash
git add src/game/InputManager.ts
git commit -m "feat: add InputManager for tap-to-move input"
```

---

### Task 6: DialogueSystem

**Files:**
- Create: `src/game/DialogueSystem.ts`
- Create: `src/data/dialogue.json`
- Create: `src/game/__tests__/DialogueSystem.test.ts`

**Step 1: Define dialogue data structure and test file**

`src/data/dialogue.json`:
```json
{
  "shelly_intro": {
    "speaker": "Shelly",
    "lines": [
      { "text": "Oh dear, oh dear... my burrow entrance is completely blocked!", "condition": null },
      { "text": "Those invasive Brazilian pepper plants grew right over it.", "condition": null },
      { "text": "If only I had some nice saw palmetto fronds to rebuild...", "condition": null }
    ],
    "next": null
  },
  "shelly_has_item": {
    "speaker": "Shelly",
    "lines": [
      { "text": "Are those... saw palmetto fronds?! Oh, thank you!", "condition": null },
      { "text": "Now I can rebuild my burrow entrance properly.", "condition": null },
      { "text": "Say, my friend Pip the mouse lives underground. Let me show you the way!", "condition": null }
    ],
    "next": null,
    "action": "give_item:saw_palmetto_fronds",
    "setFlag": "shelly_helped"
  },
  "shelly_after": {
    "speaker": "Shelly",
    "lines": [
      { "text": "My burrow is looking great! Pip is down below if you need him.", "condition": null }
    ],
    "next": null
  }
}
```

**Step 2: Write tests for dialogue logic**

`src/game/__tests__/DialogueSystem.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { DialogueRunner } from '../DialogueSystem';
import type { DialogueData } from '../DialogueSystem';

const testDialogue: DialogueData = {
  test_convo: {
    speaker: 'Shelly',
    lines: [
      { text: 'Line one', condition: null },
      { text: 'Line two', condition: null },
      { text: 'Line three', condition: null },
    ],
    next: null,
  },
  conditional_convo: {
    speaker: 'Pip',
    lines: [
      { text: 'Before help', condition: null },
      { text: 'After help too', condition: 'shelly_helped' },
    ],
    next: null,
  },
};

describe('DialogueRunner', () => {
  let runner: DialogueRunner;
  const flags = new Set<string>();

  beforeEach(() => {
    runner = new DialogueRunner(testDialogue, (flag) => flags.has(flag));
    flags.clear();
  });

  it('starts a conversation and returns first line', () => {
    const line = runner.start('test_convo');
    expect(line).toEqual({ speaker: 'Shelly', text: 'Line one' });
  });

  it('advances through lines', () => {
    runner.start('test_convo');
    expect(runner.next()).toEqual({ speaker: 'Shelly', text: 'Line two' });
    expect(runner.next()).toEqual({ speaker: 'Shelly', text: 'Line three' });
  });

  it('returns null when conversation ends', () => {
    runner.start('test_convo');
    runner.next();
    runner.next();
    expect(runner.next()).toBeNull();
  });

  it('skips lines whose condition is not met', () => {
    const line = runner.start('conditional_convo');
    expect(line).toEqual({ speaker: 'Pip', text: 'Before help' });
    expect(runner.next()).toBeNull(); // skips "After help too"
  });

  it('shows conditional lines when flag is set', () => {
    flags.add('shelly_helped');
    runner.start('conditional_convo');
    const line2 = runner.next();
    expect(line2).toEqual({ speaker: 'Pip', text: 'After help too' });
  });

  it('reports whether conversation is active', () => {
    expect(runner.isActive()).toBe(false);
    runner.start('test_convo');
    expect(runner.isActive()).toBe(true);
    runner.next();
    runner.next();
    runner.next(); // ends
    expect(runner.isActive()).toBe(false);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run src/game/__tests__/DialogueSystem.test.ts`
Expected: FAIL

**Step 4: Implement DialogueSystem**

`src/game/DialogueSystem.ts`:
```typescript
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { TweenManager } from './Tween';
import { Easing } from './Tween';

export interface DialogueLine {
  text: string;
  condition: string | null;
}

export interface DialogueNode {
  speaker: string;
  lines: DialogueLine[];
  next: string | null;
  action?: string;
  setFlag?: string;
}

export type DialogueData = Record<string, DialogueNode>;

export interface ActiveLine {
  speaker: string;
  text: string;
}

export class DialogueRunner {
  private data: DialogueData;
  private checkFlag: (flag: string) => boolean;
  private currentNode: DialogueNode | null = null;
  private lineIndex = 0;
  private active = false;

  constructor(data: DialogueData, checkFlag: (flag: string) => boolean) {
    this.data = data;
    this.checkFlag = checkFlag;
  }

  start(nodeId: string): ActiveLine | null {
    const node = this.data[nodeId];
    if (!node) return null;
    this.currentNode = node;
    this.lineIndex = 0;
    this.active = true;
    return this.getCurrentLine();
  }

  next(): ActiveLine | null {
    if (!this.currentNode) return null;
    this.lineIndex++;
    const line = this.getCurrentLine();
    if (!line) {
      this.active = false;
      this.currentNode = null;
    }
    return line;
  }

  isActive(): boolean {
    return this.active;
  }

  getCurrentNode(): DialogueNode | null {
    return this.currentNode;
  }

  private getCurrentLine(): ActiveLine | null {
    if (!this.currentNode) return null;

    // Find next line whose condition is met (or has no condition)
    while (this.lineIndex < this.currentNode.lines.length) {
      const line = this.currentNode.lines[this.lineIndex];
      if (line.condition === null || this.checkFlag(line.condition)) {
        return { speaker: this.currentNode.speaker, text: line.text };
      }
      this.lineIndex++;
    }
    this.active = false;
    return null;
  }
}

/**
 * Visual dialogue bubble renderer for PixiJS.
 * Call show() to display a speech bubble, hide() to remove it.
 */
export class DialogueBubble {
  readonly container = new Container();
  private bg = new Graphics();
  private label = new Text({
    text: '',
    style: new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 22,
      fill: '#3E2723',
      wordWrap: true,
      wordWrapWidth: 500,
      lineHeight: 28,
    }),
  });
  private speakerLabel = new Text({
    text: '',
    style: new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 18,
      fontWeight: 'bold',
      fill: '#4169E1',
    }),
  });
  private tapPrompt = new Text({
    text: 'tap to continue...',
    style: new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 14,
      fill: '#999999',
      fontStyle: 'italic',
    }),
  });

  constructor() {
    this.container.addChild(this.bg, this.speakerLabel, this.label, this.tapPrompt);
    this.container.visible = false;
  }

  show(speaker: string, text: string, x: number, y: number): void {
    this.speakerLabel.text = speaker;
    this.label.text = text;

    const padding = 16;
    const contentWidth = Math.max(this.label.width, this.speakerLabel.width, 200);
    const bubbleWidth = contentWidth + padding * 2;
    const bubbleHeight = this.speakerLabel.height + this.label.height + this.tapPrompt.height + padding * 3;

    this.bg.clear();
    this.bg.roundRect(0, 0, bubbleWidth, bubbleHeight, 12);
    this.bg.fill({ color: 0xFFF8DC });
    this.bg.stroke({ width: 3, color: 0x3E2723 });

    this.speakerLabel.position.set(padding, padding);
    this.label.position.set(padding, padding + this.speakerLabel.height + 8);
    this.tapPrompt.position.set(
      padding,
      padding + this.speakerLabel.height + 8 + this.label.height + 8
    );

    // Position bubble above the speaker, centered
    this.container.position.set(x - bubbleWidth / 2, y - bubbleHeight - 20);
    this.container.visible = true;
  }

  hide(): void {
    this.container.visible = false;
  }
}
```

**Step 5: Run tests**

Run: `npx vitest run src/game/__tests__/DialogueSystem.test.ts`
Expected: All 6 tests PASS

**Step 6: Commit**

```bash
git add src/game/DialogueSystem.ts src/game/__tests__/DialogueSystem.test.ts src/data/dialogue.json
git commit -m "feat: add DialogueRunner and DialogueBubble for NPC conversations"
```

---

### Task 7: InventoryUI

**Files:**
- Create: `src/game/InventoryUI.ts`

**Step 1: Implement InventoryUI**

`src/game/InventoryUI.ts`:
```typescript
import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { GameState, ItemId } from './GameState';
import type { TweenManager } from './Tween';
import { Easing } from './Tween';

const SLOT_SIZE = 64;
const SLOT_PADDING = 8;
const MAX_SLOTS = 6;
const TRAY_PADDING = 12;

/** Item display names for tooltip */
const ITEM_NAMES: Record<ItemId, string> = {
  saw_palmetto_fronds: 'Saw Palmetto Fronds',
  scrub_hickory_nuts: 'Scrub Hickory Nuts',
  sand_pine_cones: 'Sand Pine Cones',
  florida_rosemary_cuttings: 'Florida Rosemary',
  rusty_lyonia_flowers: 'Rusty Lyonia Flowers',
  chapman_oak_acorns: 'Chapman Oak Acorns',
  flicker_feather: "Flicker's Feather",
  pip_map: "Pip's Map",
};

export class InventoryUI {
  readonly container = new Container();
  private bg = new Graphics();
  private slots: Container[] = [];
  private selectedItem: ItemId | null = null;
  private onSelectCallbacks: ((item: ItemId | null) => void)[] = [];

  constructor(
    private gameState: GameState,
    private tweens: TweenManager,
    private itemTextures: Map<ItemId, Texture>
  ) {
    this.container.addChild(this.bg);
    this.buildSlots();
  }

  private buildSlots(): void {
    const totalWidth = MAX_SLOTS * (SLOT_SIZE + SLOT_PADDING) - SLOT_PADDING + TRAY_PADDING * 2;
    const totalHeight = SLOT_SIZE + TRAY_PADDING * 2;

    this.bg.clear();
    this.bg.roundRect(0, 0, totalWidth, totalHeight, 8);
    this.bg.fill({ color: 0xFFF8DC, alpha: 0.9 });
    this.bg.stroke({ width: 2, color: 0x3E2723 });

    for (let i = 0; i < MAX_SLOTS; i++) {
      const slot = new Container();
      const slotBg = new Graphics();
      slotBg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 6);
      slotBg.fill({ color: 0xFFFFFF, alpha: 0.5 });
      slotBg.stroke({ width: 1, color: 0xD2B48C });
      slot.addChild(slotBg);
      slot.position.set(TRAY_PADDING + i * (SLOT_SIZE + SLOT_PADDING), TRAY_PADDING);
      slot.eventMode = 'static';
      slot.cursor = 'pointer';
      this.container.addChild(slot);
      this.slots.push(slot);
    }
  }

  /** Call each frame or after inventory changes to sync display with GameState */
  refresh(): void {
    const items = this.gameState.getInventory();

    for (let i = 0; i < MAX_SLOTS; i++) {
      const slot = this.slots[i];
      // Remove old item sprite (keep slot background at index 0)
      while (slot.children.length > 1) {
        slot.removeChildAt(1);
      }

      if (i < items.length) {
        const itemId = items[i];
        const texture = this.itemTextures.get(itemId);
        if (texture) {
          const sprite = new Sprite(texture);
          sprite.width = SLOT_SIZE - 8;
          sprite.height = SLOT_SIZE - 8;
          sprite.position.set(4, 4);
          slot.addChild(sprite);
        } else {
          // Placeholder colored circle if texture not loaded
          const placeholder = new Graphics();
          placeholder.circle(SLOT_SIZE / 2, SLOT_SIZE / 2, SLOT_SIZE / 3);
          placeholder.fill({ color: 0x8FBC8F });
          slot.addChild(placeholder);
        }

        // Make tappable
        const currentItem = itemId;
        slot.removeAllListeners();
        slot.eventMode = 'static';
        slot.on('pointertap', () => {
          this.selectedItem = this.selectedItem === currentItem ? null : currentItem;
          this.onSelectCallbacks.forEach((cb) => cb(this.selectedItem));
          this.highlightSelected();
        });
      } else {
        slot.removeAllListeners();
        slot.eventMode = 'none';
      }
    }
  }

  private highlightSelected(): void {
    const items = this.gameState.getInventory();
    for (let i = 0; i < MAX_SLOTS; i++) {
      const slot = this.slots[i];
      const bg = slot.children[0] as Graphics;
      bg.clear();
      bg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 6);
      if (i < items.length && items[i] === this.selectedItem) {
        bg.fill({ color: 0xFFD700, alpha: 0.5 });
        bg.stroke({ width: 2, color: 0x4169E1 });
      } else {
        bg.fill({ color: 0xFFFFFF, alpha: 0.5 });
        bg.stroke({ width: 1, color: 0xD2B48C });
      }
    }
  }

  getSelectedItem(): ItemId | null {
    return this.selectedItem;
  }

  clearSelection(): void {
    this.selectedItem = null;
    this.highlightSelected();
  }

  onSelect(callback: (item: ItemId | null) => void): void {
    this.onSelectCallbacks.push(callback);
  }

  /** Position the tray at the bottom-center of the game area */
  layout(gameWidth: number, gameHeight: number): void {
    const totalWidth = MAX_SLOTS * (SLOT_SIZE + SLOT_PADDING) - SLOT_PADDING + TRAY_PADDING * 2;
    const totalHeight = SLOT_SIZE + TRAY_PADDING * 2;
    this.container.position.set(
      (gameWidth - totalWidth) / 2,
      gameHeight - totalHeight - 8
    );
  }
}
```

**Step 2: Commit**

```bash
git add src/game/InventoryUI.ts
git commit -m "feat: add InventoryUI tray with item selection"
```

---

### Task 8: Wire up main.ts with engine systems

**Files:**
- Modify: `src/main.ts`

**Step 1: Update main.ts to integrate all engine systems**

Replace `src/main.ts` with:
```typescript
import { Application, Container, Graphics } from 'pixi.js';
import { GameState } from './game/GameState';
import { TweenManager } from './game/Tween';
import { SceneManager } from './game/SceneManager';
import { InputManager } from './game/InputManager';
import { InventoryUI } from './game/InventoryUI';

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
  });

  // TODO: Register scenes and switch to scrub_thicket
  // sceneManager.register('scrub_thicket', (app, gs, tw) => new ScrubThicket(app, gs, tw));
  // await sceneManager.switchTo('scrub_thicket');
}

init();
```

**Step 2: Run dev server, verify it loads without errors**

Run: `npm run dev`
Expected: Blue sky background with inventory tray visible at bottom center. No console errors.

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (GameState: 9, Tween: 7, DialogueSystem: 6 = 22 total)

**Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire up engine systems in main game loop"
```

---

## Phase 3: Player Character & SVG Assets

### Task 9: Create placeholder SVG assets

**Files:**
- Create: `src/assets/characters/scruff.svg`
- Create: `src/assets/backgrounds/scrub-thicket-bg.svg`
- Create: `src/assets/items/saw-palmetto-fronds.svg`
- Create: `src/assets/ui/arrow-right.svg`
- Create: `src/assets/ui/arrow-left.svg`

Create placeholder SVG assets that follow the design doc's Homestar Runner style: thick black outlines (3-4px), bold flat colors, exaggerated proportions.

**Scruff (multi-part):** Build Scruff as separate SVG files for each animatable part, OR as a single SVG with named groups that get extracted. For the initial implementation, use a single composed SVG that can be loaded as a texture. Multi-part animation will be added in a later task.

**Step 1: Create Scruff placeholder SVG**

`src/assets/characters/scruff.svg` - A simple scrub jay shape:
- Round blue head (40% of height) with white eye circles and black pupils
- Blue crest on top
- Small gray body
- Stick legs with round feet
- All with 3px black stroke, flat fills, ~200x300px viewBox

**Step 2: Create background placeholder**

`src/assets/backgrounds/scrub-thicket-bg.svg` - Scrub landscape:
- Sky gradient-free pale blue top half
- Sandy tan ground
- Simple geometric bush shapes in sage green
- A rusty lyonia bush with orange accent
- 1280x720 viewBox

**Step 3: Create item placeholder**

`src/assets/items/saw-palmetto-fronds.svg` - Fan-shaped palm frond:
- Green fan shape with thick black outline
- ~64x64 viewBox

**Step 4: Create nav arrow placeholders**

Simple arrow shapes with thick outlines, ~48x48 viewBox.

**Step 5: Commit**

```bash
git add src/assets/
git commit -m "feat: add placeholder SVG assets for characters, backgrounds, items, UI"
```

---

### Task 10: Scruff player character with movement

**Files:**
- Create: `src/characters/Scruff.ts`

**Step 1: Implement Scruff character**

`src/characters/Scruff.ts`:
```typescript
import { Container, Sprite, Texture, Assets } from 'pixi.js';
import type { TweenManager } from '../game/Tween';
import { Easing } from '../game/Tween';

export class Scruff {
  readonly container = new Container();
  private sprite!: Sprite;
  private tweens: TweenManager;
  private moving = false;
  private idleTweenId: number | null = null;
  private speed = 200; // pixels per second

  /** Current position in game coordinates */
  get x(): number { return this.container.x; }
  get y(): number { return this.container.y; }

  constructor(tweens: TweenManager) {
    this.tweens = tweens;
  }

  async setup(): Promise<void> {
    const texture = await Assets.load('assets/characters/scruff.svg');
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5, 1); // anchor at bottom-center (feet)
    this.sprite.width = 80;
    this.sprite.height = 120;
    this.container.addChild(this.sprite);
    this.startIdle();
  }

  /** Place Scruff at a position */
  setPosition(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  /** Move Scruff to target position. Returns a promise that resolves when arrived. */
  moveTo(targetX: number, targetY: number): Promise<void> {
    return new Promise((resolve) => {
      this.stopIdle();
      this.moving = true;

      // Flip sprite based on direction
      this.sprite.scale.x = targetX < this.container.x
        ? -Math.abs(this.sprite.scale.x)
        : Math.abs(this.sprite.scale.x);

      const dx = targetX - this.container.x;
      const dy = targetY - this.container.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const duration = (distance / this.speed) * 1000;

      // Walking bounce animation
      const bounceId = this.tweens.add({
        target: this.sprite.scale as unknown as Record<string, number>,
        props: { y: this.sprite.scale.y * 0.9 },
        duration: 150,
        yoyo: true,
        loop: true,
        easing: Easing.easeInOut,
      });

      this.tweens.add({
        target: this.container.position as unknown as Record<string, number>,
        props: { x: targetX, y: targetY },
        duration: Math.max(duration, 100),
        easing: Easing.easeOut,
        onComplete: () => {
          this.tweens.cancel(bounceId);
          this.sprite.scale.y = Math.abs(this.sprite.scale.y);
          this.moving = false;
          this.startIdle();
          resolve();
        },
      });
    });
  }

  isMoving(): boolean {
    return this.moving;
  }

  private startIdle(): void {
    // Gentle bob animation
    this.idleTweenId = this.tweens.add({
      target: this.container.position as unknown as Record<string, number>,
      props: { y: this.container.y - 4 },
      duration: 800,
      yoyo: true,
      loop: true,
      easing: Easing.easeInOut,
    });
  }

  private stopIdle(): void {
    if (this.idleTweenId !== null) {
      this.tweens.cancel(this.idleTweenId);
      this.idleTweenId = null;
    }
  }

  /** Play item pickup celebration */
  playPickup(): Promise<void> {
    return new Promise((resolve) => {
      this.stopIdle();
      this.tweens.add({
        target: this.container.position as unknown as Record<string, number>,
        props: { y: this.container.y - 30 },
        duration: 300,
        easing: Easing.easeOut,
        onComplete: () => {
          this.tweens.add({
            target: this.container.position as unknown as Record<string, number>,
            props: { y: this.container.y + 30 },
            duration: 300,
            easing: Easing.bounce,
            onComplete: () => {
              this.startIdle();
              resolve();
            },
          });
        },
      });
    });
  }
}
```

**Step 2: Commit**

```bash
git add src/characters/Scruff.ts
git commit -m "feat: add Scruff player character with tap-to-move and idle animation"
```

---

### Task 11: NPC base class

**Files:**
- Create: `src/characters/NPC.ts`

**Step 1: Implement NPC base class**

`src/characters/NPC.ts`:
```typescript
import { Container, Sprite, Texture, Assets, Graphics } from 'pixi.js';
import type { TweenManager } from '../game/Tween';
import { Easing } from '../game/Tween';
import type { ItemId, FlagId } from '../game/GameState';

export interface NPCConfig {
  id: string;
  name: string;
  texturePath: string;
  width: number;
  height: number;
  /** Position in scene */
  x: number;
  y: number;
  /** Dialogue node IDs */
  dialogueDefault: string;
  dialogueHasItem: string | null;
  dialogueAfter: string | null;
  /** What item this NPC wants */
  wantsItem: ItemId | null;
  /** Flag that marks this NPC as helped */
  helpedFlag: FlagId | null;
}

export class NPC {
  readonly container = new Container();
  private sprite!: Sprite;
  private config: NPCConfig;
  private tweens: TweenManager;
  private idleTweenId: number | null = null;
  private interactRadius = 120;

  get id(): string { return this.config.id; }
  get name(): string { return this.config.name; }

  constructor(config: NPCConfig, tweens: TweenManager) {
    this.config = config;
    this.tweens = tweens;
  }

  async setup(): Promise<void> {
    const texture = await Assets.load(this.config.texturePath);
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.width = this.config.width;
    this.sprite.height = this.config.height;
    this.container.addChild(this.sprite);
    this.container.position.set(this.config.x, this.config.y);

    // Make tappable
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.container.hitArea = this.sprite.getBounds();

    this.startIdle();
  }

  /** Get the right dialogue node based on game state */
  getDialogueId(hasWantedItem: boolean, isHelped: boolean): string {
    if (isHelped && this.config.dialogueAfter) {
      return this.config.dialogueAfter;
    }
    if (hasWantedItem && this.config.dialogueHasItem) {
      return this.config.dialogueHasItem;
    }
    return this.config.dialogueDefault;
  }

  /** Check if player is close enough to interact */
  isInRange(playerX: number, playerY: number): boolean {
    const dx = playerX - this.config.x;
    const dy = playerY - this.config.y;
    return Math.sqrt(dx * dx + dy * dy) < this.interactRadius;
  }

  /** Increase idle animation energy when player is nearby */
  setExcited(excited: boolean): void {
    // Change the idle bounce amplitude
    this.stopIdle();
    this.startIdle(excited ? 8 : 4);
  }

  private startIdle(amplitude = 4): void {
    this.idleTweenId = this.tweens.add({
      target: this.container.position as unknown as Record<string, number>,
      props: { y: this.config.y - amplitude },
      duration: 600 + Math.random() * 200, // slight variation per NPC
      yoyo: true,
      loop: true,
      easing: Easing.easeInOut,
    });
  }

  private stopIdle(): void {
    if (this.idleTweenId !== null) {
      this.tweens.cancel(this.idleTweenId);
      this.idleTweenId = null;
      this.container.y = this.config.y;
    }
  }

  /** Play happy reaction animation */
  playHappy(): Promise<void> {
    return new Promise((resolve) => {
      this.stopIdle();
      this.tweens.add({
        target: this.container.scale as unknown as Record<string, number>,
        props: { x: 1.2, y: 1.2 },
        duration: 200,
        easing: Easing.easeOut,
        onComplete: () => {
          this.tweens.add({
            target: this.container.scale as unknown as Record<string, number>,
            props: { x: 1, y: 1 },
            duration: 300,
            easing: Easing.bounce,
            onComplete: () => {
              this.startIdle();
              resolve();
            },
          });
        },
      });
    });
  }
}
```

**Step 2: Commit**

```bash
git add src/characters/NPC.ts
git commit -m "feat: add NPC base class with dialogue routing and idle animation"
```

---

## Phase 4: Adventure Scenes

### Task 12: InteractiveItem helper class

**Files:**
- Create: `src/game/InteractiveItem.ts`

**Step 1: Implement InteractiveItem**

`src/game/InteractiveItem.ts`:
```typescript
import { Container, Sprite, Assets, Graphics } from 'pixi.js';
import type { TweenManager } from './Tween';
import { Easing } from './Tween';
import type { ItemId } from './GameState';

export interface ItemConfig {
  itemId: ItemId;
  texturePath: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/**
 * A collectible item in a scene.
 * Bounces continuously to signal interactivity (Freddy Fish style).
 * Glow increases when player is nearby.
 */
export class InteractiveItem {
  readonly container = new Container();
  readonly itemId: ItemId;
  private sprite!: Sprite;
  private glow = new Graphics();
  private tweens: TweenManager;
  private config: ItemConfig;
  private bounceTweenId: number | null = null;
  private baseY: number;

  constructor(config: ItemConfig, tweens: TweenManager) {
    this.config = config;
    this.itemId = config.itemId;
    this.tweens = tweens;
    this.baseY = config.y;
  }

  async setup(): Promise<void> {
    const texture = await Assets.load(this.config.texturePath);
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5, 0.5);
    this.sprite.width = this.config.width ?? 48;
    this.sprite.height = this.config.height ?? 48;

    // Glow circle behind item
    this.glow.circle(0, 0, 30);
    this.glow.fill({ color: 0xFFD700, alpha: 0.3 });
    this.container.addChild(this.glow, this.sprite);
    this.container.position.set(this.config.x, this.config.y);

    // Make tappable
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';

    this.startBounce();
  }

  private startBounce(): void {
    this.bounceTweenId = this.tweens.add({
      target: this.container.position as unknown as Record<string, number>,
      props: { y: this.baseY - 6 },
      duration: 800,
      yoyo: true,
      loop: true,
      easing: Easing.easeInOut,
    });
  }

  /** Increase glow when player approaches */
  setProximity(near: boolean): void {
    this.glow.clear();
    this.glow.circle(0, 0, near ? 36 : 30);
    this.glow.fill({ color: 0xFFD700, alpha: near ? 0.5 : 0.3 });
  }

  /** Play collection animation and resolve when done */
  playCollect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.bounceTweenId !== null) {
        this.tweens.cancel(this.bounceTweenId);
      }
      this.tweens.add({
        target: this.container.scale as unknown as Record<string, number>,
        props: { x: 0, y: 0 },
        duration: 300,
        easing: Easing.easeIn,
        onComplete: () => {
          this.container.visible = false;
          resolve();
        },
      });
    });
  }
}
```

**Step 2: Commit**

```bash
git add src/game/InteractiveItem.ts
git commit -m "feat: add InteractiveItem with bounce and collection animations"
```

---

### Task 13: SceneArrow navigation helper

**Files:**
- Create: `src/game/SceneArrow.ts`

**Step 1: Implement SceneArrow**

`src/game/SceneArrow.ts`:
```typescript
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { TweenManager } from './Tween';
import { Easing } from './Tween';
import type { SceneId } from './GameState';

export class SceneArrow {
  readonly container = new Container();
  readonly targetScene: SceneId;
  private arrow = new Graphics();
  private label: Text;

  constructor(
    direction: 'left' | 'right' | 'up' | 'down',
    targetScene: SceneId,
    labelText: string,
    x: number,
    y: number,
    tweens: TweenManager
  ) {
    this.targetScene = targetScene;

    // Draw arrow
    const size = 40;
    this.arrow.moveTo(0, -size / 2);
    switch (direction) {
      case 'right':
        this.arrow.lineTo(size, 0);
        this.arrow.lineTo(0, size / 2);
        break;
      case 'left':
        this.arrow.moveTo(size, -size / 2);
        this.arrow.lineTo(0, 0);
        this.arrow.lineTo(size, size / 2);
        break;
      case 'up':
        this.arrow.moveTo(-size / 2, size);
        this.arrow.lineTo(0, 0);
        this.arrow.lineTo(size / 2, size);
        break;
      case 'down':
        this.arrow.moveTo(-size / 2, 0);
        this.arrow.lineTo(0, size);
        this.arrow.lineTo(size / 2, 0);
        break;
    }
    this.arrow.closePath();
    this.arrow.fill({ color: 0xFFF8DC });
    this.arrow.stroke({ width: 3, color: 0x3E2723 });

    this.label = new Text({
      text: labelText,
      style: new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontSize: 14,
        fill: '#3E2723',
        align: 'center',
      }),
    });
    this.label.anchor.set(0.5, 0);
    this.label.position.set(size / 2, size / 2 + 4);

    this.container.addChild(this.arrow, this.label);
    this.container.position.set(x, y);
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';

    // Pulsing animation
    tweens.add({
      target: this.container.scale as unknown as Record<string, number>,
      props: { x: 1.15, y: 1.15 },
      duration: 600,
      yoyo: true,
      loop: true,
      easing: Easing.easeInOut,
    });
  }
}
```

**Step 2: Commit**

```bash
git add src/game/SceneArrow.ts
git commit -m "feat: add SceneArrow navigation with pulsing animation"
```

---

### Task 14: Scrub Thicket scene (tutorial/start)

**Files:**
- Create: `src/scenes/ScrubThicket.ts`
- Create: `src/assets/backgrounds/scrub-thicket-bg.svg` (if not already created)

**Step 1: Implement the tutorial scene**

`src/scenes/ScrubThicket.ts` should:
- Extend `Scene` base class
- Load scrub thicket background SVG
- Place Scruff at starting position (center-bottom)
- Add saw palmetto fronds item (collectible, bouncing)
- Add rusty lyonia flowers item (collectible, bouncing)
- Add navigation arrow to Tortoise Burrow (up)
- Handle tap-to-move: tap ground = move Scruff, tap item = move then collect, tap arrow = transition
- Show tutorial dialogue on first entry ("Hmm, these invasive plants are everywhere...")
- On item collection: add to GameState inventory, play pickup animation, refresh inventory UI

**Key interactions:**
1. Player taps ground -> Scruff walks there
2. Player taps bouncing saw palmetto fronds -> Scruff walks over, collects item
3. Player taps arrow at top -> scene transitions to Tortoise Burrow

Wire into `main.ts` by registering the scene and switching to it on startup.

**Step 2: Update main.ts to register and load this scene**

Add import and registration:
```typescript
import { ScrubThicket } from './scenes/ScrubThicket';
// In init():
sceneManager.register('scrub_thicket', (app, gs, tw) => new ScrubThicket(app, gs, tw));
await sceneManager.switchTo('scrub_thicket');
```

**Step 3: Manual test - verify scene loads, Scruff moves on tap, items bounce and are collectible**

Run: `npm run dev`
Expected: Scene shows background, Scruff character, bouncing items, navigation arrow. Tap to move works.

**Step 4: Commit**

```bash
git add src/scenes/ScrubThicket.ts src/main.ts
git commit -m "feat: add Scrub Thicket tutorial scene with items and navigation"
```

---

### Task 15: Tortoise Burrow scene + Shelly NPC

**Files:**
- Create: `src/scenes/TortoiseBurrow.ts`
- Create: `src/assets/characters/shelly.svg`
- Create: `src/assets/backgrounds/tortoise-burrow-bg.svg`

**Step 1: Create Shelly SVG placeholder**

Gopher tortoise with huge dome shell, tiny head, big droopy eyes. Thick black outlines.

**Step 2: Implement TortoiseBurrow scene**

- Background: sandy area with burrow entrance, blocked by red/green invasive plants
- Shelly NPC placed near the burrow
- Navigation arrows: down to Scrub Thicket, up to Central Trail
- Dialogue logic:
  - If player hasn't helped and doesn't have palmetto fronds: `shelly_intro`
  - If player has palmetto fronds in inventory: `shelly_has_item` -> remove item, set `shelly_helped` flag, play Shelly happy animation
  - If already helped: `shelly_after`
- When `shelly_helped` is set, visually update the burrow (remove invasive plants overlay, show clean entrance)

**Step 3: Add Shelly's full dialogue to dialogue.json**

Expand the existing placeholder dialogue with proper conversation flow.

**Step 4: Register scene in main.ts**

**Step 5: Manual test - verify full Shelly interaction loop**

**Step 6: Commit**

```bash
git add src/scenes/TortoiseBurrow.ts src/assets/ src/data/dialogue.json src/main.ts
git commit -m "feat: add Tortoise Burrow scene with Shelly NPC interaction"
```

---

### Task 16: Central Trail hub scene

**Files:**
- Create: `src/scenes/CentralTrail.ts`
- Create: `src/assets/characters/sage.svg`
- Create: `src/assets/backgrounds/central-trail-bg.svg`

**Step 1: Create Sage owl SVG placeholder and background**

**Step 2: Implement CentralTrail scene**

- Background: trail with Chapman oaks, signpost
- Sage owl NPC (gives hints about what to do next)
- Chapman oak acorns collectible
- Scrub hickory nuts collectible
- Navigation arrows: down to Tortoise Burrow, left to Pine Clearing, right to Sandy Barrens, up to Owl's Overlook (locked until `sunny_helped`)
- Signpost interactive element: when tapped, shows a simple map overlay for fast-travel to visited scenes (only when `fast_travel_unlocked` flag is set - set on first visit to Central Trail)

**Step 3: Register scene in main.ts**

**Step 4: Manual test**

**Step 5: Commit**

```bash
git add src/scenes/CentralTrail.ts src/assets/ src/main.ts
git commit -m "feat: add Central Trail hub scene with signpost fast-travel"
```

---

### Task 17: Pine Clearing scene + Flicker NPC + Vine Buster mini-game

**Files:**
- Create: `src/scenes/PineClearing.ts`
- Create: `src/minigames/VineBuster.ts`
- Create: `src/assets/characters/flicker.svg`
- Create: `src/assets/backgrounds/pine-clearing-bg.svg`

**Step 1: Create Flicker SVG and background**

Red-bellied woodpecker: tall, lanky, oversized red cap, long beak. Background: sand pine tree with vines.

**Step 2: Implement PineClearing scene**

- Flicker NPC near the vine-covered tree
- Dialogue: asks for help clearing vines, triggers mini-game
- After mini-game complete: Flicker gives `flicker_feather`, sets `flicker_helped`
- Navigation: right arrow back to Central Trail

**Step 3: Implement VineBuster mini-game**

`src/minigames/VineBuster.ts` - extends Scene:
- **Setup:** Sand pine tree in center. Vine spawn points at screen edges.
- **Gameplay loop (per round):**
  1. Vines (green Graphics lines with leaf shapes) grow from edges toward tree center
  2. Tap a vine to cut it (plays a snip animation, vine disappears)
  3. Some vines are native (lighter green, rounder leaves) - cutting them costs points
  4. Round timer: 30 seconds
  5. Score: +10 per invasive vine cut, -5 per native vine cut, -10 per vine that reaches tree
- **3 rounds**, each faster than the last
- **Between rounds:** "Did you know?" fact popup about invasive vs native vines
- **Win condition:** Score > 0 after 3 rounds (very forgiving for kids)
- **On complete:** Set `vine_buster_complete` flag, return to PineClearing scene

**Step 4: Write tests for VineBuster scoring logic**

```typescript
// src/minigames/__tests__/VineBuster.test.ts
describe('VineBuster scoring', () => {
  it('awards points for cutting invasive vines', ...);
  it('penalizes cutting native vines', ...);
  it('penalizes vines reaching the tree', ...);
  it('passes with positive score', ...);
});
```

**Step 5: Register scenes in main.ts**

**Step 6: Manual test full flow: Central Trail -> Pine Clearing -> talk to Flicker -> Vine Buster -> receive feather**

**Step 7: Commit**

```bash
git add src/scenes/PineClearing.ts src/minigames/VineBuster.ts src/minigames/__tests__/ src/assets/ src/main.ts
git commit -m "feat: add Pine Clearing scene with Vine Buster mini-game"
```

---

### Task 18: Tortoise Burrow underground + Pip NPC

**Files:**
- Create: `src/assets/characters/pip.svg`
- Modify: `src/scenes/TortoiseBurrow.ts`

**Step 1: Create Pip SVG**

Florida mouse: tiny body, enormous ears, sparkly eyes, long whiskers.

**Step 2: Add underground sub-area to TortoiseBurrow**

After Shelly is helped, a new area becomes accessible (underground). This can be a second Container within the TortoiseBurrow scene that swaps in when the player taps the burrow entrance:
- Dark brown background with root shapes
- Pip NPC
- Dialogue: Pip wants scrub hickory nuts -> gives `pip_map` item
- Navigation: arrow back up to burrow surface

**Step 3: Commit**

```bash
git add src/scenes/TortoiseBurrow.ts src/assets/characters/pip.svg
git commit -m "feat: add Pip NPC in underground area of Tortoise Burrow"
```

---

### Task 19: Sandy Barrens scene + Sunny NPC + Seed Scatter mini-game

**Files:**
- Create: `src/scenes/SandyBarrens.ts`
- Create: `src/minigames/SeedScatter.ts`
- Create: `src/assets/characters/sunny.svg`
- Create: `src/assets/backgrounds/sandy-barrens-bg.svg`

**Step 1: Create Sunny SVG and background**

Eastern indigo snake: S-curve body, sleepy eyes, blue-black with shimmer. Background: overgrown sandy area.

**Step 2: Implement SandyBarrens scene**

- Sunny NPC coiled up, shivering (cold animation)
- Florida rosemary cuttings collectible nearby
- Dialogue: needs open sandy ground, asks you to plant native ground cover
- When player has rosemary cuttings: triggers Seed Scatter mini-game
- After mini-game: set `sunny_helped`, Sunny uncoils, plays happy animation, clears path to Owl's Overlook

**Step 3: Implement SeedScatter mini-game**

`src/minigames/SeedScatter.ts` - extends Scene:
- **Setup:** Top-down-ish view. Ground below with sandy patches (good targets, tan) and invasive patches (bad, dark green). Scruff flies across the top.
- **Gameplay:**
  1. Seeds appear in Scruff's talons one at a time
  2. Player drags down to aim, releases to drop
  3. Wind indicator shows current gust direction (arrow that changes)
  4. Seed falls with physics: gravity + wind offset
  5. Different seed types: rosemary (straight drop), palmetto (drifts with wind), acorn (heavy, fast)
  6. Landing on sandy patch: +10, plant sprouts animation
  7. Landing on invasive patch: -5
  8. Landing off-screen: -2
- **15 seeds total**, need 80+ points to win (forgiving)
- **On complete:** Set `seed_scatter_complete`, return to SandyBarrens

**Step 4: Write tests for SeedScatter scoring and physics**

**Step 5: Register, manual test, commit**

```bash
git add src/scenes/SandyBarrens.ts src/minigames/SeedScatter.ts src/minigames/__tests__/ src/assets/ src/main.ts
git commit -m "feat: add Sandy Barrens scene with Seed Scatter mini-game"
```

---

### Task 20: Owl's Overlook finale + Night Watch mini-game

**Files:**
- Create: `src/scenes/OwlsOverlook.ts`
- Create: `src/minigames/NightWatch.ts`
- Create: `src/assets/backgrounds/owls-overlook-bg.svg`

**Step 1: Create overlook background**

High vantage point with panoramic view of the preserve below.

**Step 2: Implement OwlsOverlook scene**

- Sage owl NPC at the top
- Only accessible when `sunny_helped` is true
- Dialogue: asks to see proof of restoration (checks for story items: lyonia flowers, acorns, feather, map)
- If player has all proof items: triggers Night Watch mini-game
- After mini-game: set `game_complete`, play celebration sequence

**Step 3: Implement NightWatch mini-game**

`src/minigames/NightWatch.ts` - extends Scene:
- **Setup:** Night sky background (dark blue). The preserve below in silhouette with habitat areas lit up.
- **Gameplay:**
  1. Animals appear briefly in their habitats (Shelly in burrow, Pip underground, Flicker in tree, Sunny on sand)
  2. They flash on screen for 1-2 seconds then hide
  3. Player must tap them in the order they appeared
  4. Round 1: 2 animals. Round 2: 3. Round 3: 4. Round 4: all 5 (including Scruff).
  5. Wrong order = try again (no penalty, just restart the round - very forgiving)
- **On complete:** Set `night_watch_complete`, return to OwlsOverlook for celebration

**Step 4: Implement celebration/ending sequence**

After Night Watch, back in OwlsOverlook:
- Sage gives a short speech about how the preserve is restored
- Camera (stage) slowly zooms out to show the full preserve
- All NPCs appear in their habitats, doing happy animations
- "The End - Thanks for helping Lyonia Preserve!" text
- "Play Again?" button that resets GameState

**Step 5: Write tests for NightWatch sequence logic**

**Step 6: Register, manual test full game end-to-end, commit**

```bash
git add src/scenes/OwlsOverlook.ts src/minigames/NightWatch.ts src/minigames/__tests__/ src/assets/ src/main.ts
git commit -m "feat: add Owl's Overlook finale with Night Watch mini-game and ending"
```

---

## Phase 5: Complete Dialogue & Polish

### Task 21: Complete all NPC dialogue

**Files:**
- Modify: `src/data/dialogue.json`

**Step 1: Write full dialogue trees for all NPCs**

Each NPC needs 3 dialogue states (default, has_item, after_helped). Dialogue should be:
- Age-appropriate for 8-12 year olds
- Educational - weave in real facts about each species and native plant
- Personality-driven - match each character's personality from the design doc
- Concise - 2-4 lines per conversation state

NPCs to complete:
- Shelly (tortoise): worried but grateful
- Pip (mouse): excitable, nervous energy
- Flicker (woodpecker): upbeat, rhythmic speech
- Sunny (snake): sleepy, mellow, grateful for warmth
- Sage (owl): wise, slightly silly, encouraging

Also add:
- Tutorial dialogue for Scruff in Scrub Thicket
- Sage's guidance hints in Central Trail (context-sensitive based on progress)
- "Did you know?" facts for mini-game interludes

**Step 2: Commit**

```bash
git add src/data/dialogue.json
git commit -m "feat: complete all NPC dialogue with educational content"
```

---

### Task 22: Final SVG art pass

**Files:**
- Modify: all files in `src/assets/`

**Step 1: Replace all placeholder SVGs with polished art**

For each character, create detailed Homestar Runner-style SVGs:
- Thick 3-4px black strokes
- Bold flat colors from the design palette
- Exaggerated features as specified in the design doc
- Wobbly hand-drawn line quality (slightly imperfect bezier curves)
- Multiple animation-ready parts where noted

Characters: Scruff, Shelly, Pip, Flicker, Sunny, Sage
Backgrounds: 6 scenes
Items: 8 collectibles
UI: arrows, signpost, dialogue bubble frame

**Step 2: Verify all assets load correctly**

Run: `npm run dev`
Walk through all scenes, verify no missing textures.

**Step 3: Commit**

```bash
git add src/assets/
git commit -m "feat: polish all SVG character, background, and item art"
```

---

### Task 23: Scene transition animations

**Files:**
- Modify: `src/game/SceneManager.ts`

**Step 1: Add fade transition between scenes**

When switching scenes:
1. Fade out current scene (alpha 1 -> 0, 300ms)
2. Swap scenes
3. Fade in new scene (alpha 0 -> 1, 300ms)

Use a black overlay Graphics rectangle and tween its alpha.

**Step 2: Manual test - verify smooth transitions between all scenes**

**Step 3: Commit**

```bash
git add src/game/SceneManager.ts
git commit -m "feat: add fade transitions between scenes"
```

---

### Task 24: Save/load and menu

**Files:**
- Create: `src/game/MenuOverlay.ts`
- Modify: `src/main.ts`

**Step 1: Implement MenuOverlay**

Simple overlay with:
- "Save Game" button (calls `gameState.save()`)
- "Load Game" button (loads from localStorage, switches to saved scene)
- "New Game" button (clears save, resets to Scrub Thicket)
- Semi-transparent dark background
- Triggered by menu button in top-right corner of game HUD

**Step 2: Add auto-save on scene transitions**

In SceneManager.switchTo(), call `gameState.save()` after entering new scene.

**Step 3: Commit**

```bash
git add src/game/MenuOverlay.ts src/main.ts src/game/SceneManager.ts
git commit -m "feat: add save/load system and menu overlay"
```

---

## Phase 6: Deploy

### Task 25: GitHub Pages deployment

**Files:**
- Modify: `package.json`
- Create: `.github/workflows/deploy.yml` (optional - can also use `gh-pages` npm package)

**Step 1: Install gh-pages**

Run: `npm install -D gh-pages`

**Step 2: Verify build works**

Run: `npm run build`
Expected: `dist/` directory created with `index.html` and bundled assets.

**Step 3: Verify the build locally**

Run: `npm run preview`
Expected: Game loads and plays correctly at localhost preview URL.

**Step 4: Deploy to GitHub Pages**

Run: `npm run deploy`
Expected: Site deployed to `https://<username>.github.io/ScruffsDay/`

**Step 5: Test on mobile device**

Open the deployed URL on a phone. Verify:
- Canvas fills screen
- Touch input works (tap to move, tap items, tap dialogue)
- Inventory tray is usable at bottom
- Mini-games are playable with touch
- No horizontal scroll or viewport issues

**Step 6: Commit deploy config**

```bash
git add package.json .github/
git commit -m "feat: configure GitHub Pages deployment"
```

---

### Task 26: Final end-to-end playtest

**No files to create - manual testing task**

Play through the entire game start to finish on both desktop and mobile:

1. Start at Scrub Thicket, collect palmetto fronds and lyonia flowers
2. Go to Tortoise Burrow, give fronds to Shelly
3. Enter underground, give hickory nuts to Pip, receive map
4. Go to Central Trail, collect acorns, talk to Sage
5. Go to Pine Clearing, talk to Flicker, play Vine Buster
6. Receive feather from Flicker
7. Go to Sandy Barrens, collect rosemary, talk to Sunny, play Seed Scatter
8. Sunny clears path to Owl's Overlook
9. Go to Owl's Overlook, present proof to Sage, play Night Watch
10. Watch celebration ending
11. Verify "Play Again" resets correctly

Fix any bugs found during playtest.

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1 | Project scaffolding |
| 2 | 2-8 | Core engine (GameState, Tweens, SceneManager, Input, Dialogue, Inventory, wiring) |
| 3 | 9-11 | Player character, NPC base, placeholder SVGs |
| 4 | 12-20 | All 6 adventure scenes + 3 mini-games |
| 5 | 21-24 | Complete dialogue, art polish, transitions, save/load |
| 6 | 25-26 | Build, deploy, playtest |
