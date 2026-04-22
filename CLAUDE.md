# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Scruff's Day** — point-and-click adventure with arcade mini-games starring Scruff, a Florida scrub jay, set in Lyonia Preserve (Deltona, FL). Educates players (ages 8–12) about native plant conservation. Visual style inspired by *Homestar Runner*: thick black outlines, bold flat colors, exaggerated proportions.

Stack: PixiJS v8, TypeScript (strict), Vite, Vitest. Deployed to GitHub Pages under base `/ScruffsDay/`.

## Commands

- `npm run dev` — Vite dev server at `http://localhost:5173/ScruffsDay/`
- `npm run build` — `tsc --noEmit` then `vite build` to `dist/`
- `npm run preview` — serve production build
- `npm run test` — Vitest (watch mode); use `npm run test -- --run` for one-shot, `npm run test -- src/game/__tests__/GameState.test.ts` for a single file
- `npm run deploy` — build and push `dist/` to `gh-pages` branch

## Architecture

Entry point `src/main.ts` builds the PixiJS `Application`, instantiates core systems, registers all scenes, and starts the ticker. The full game is rendered into a single `gameContainer` at a fixed internal resolution of **1280×720**, then uniformly scaled to fit `window` (letterboxed). All UI coords assume that internal space.

### Core systems (singletons, owned by `main.ts`)

- `GameState` (`src/game/GameState.ts`) — single source of truth. Tracks `inventory: Set<ItemId>`, `flags: Set<FlagId>`, `visitedScenes: Set<SceneId>`, and `currentScene`. Persists to `localStorage`. **All gameplay state lives here** — scenes read/write through it. The `ItemId`, `SceneId`, and `FlagId` unions are the canonical lists; new content must extend them.
- `SceneManager` (`src/game/SceneManager.ts`) — registry of `(id) → factory`. `switchTo(id, direction?)` tears down the active scene, calls the factory, runs `setup()` then `enter()`. Every scene must be registered in `main.ts`.
- `InputManager` (`src/game/InputManager.ts`) — single hit-area on top of the scene container; routes pointer events to whichever scene is active.
- `TweenManager` (`src/game/Tween.ts`) — central tween loop ticked from `app.ticker`. Use this for all animation; do not roll your own RAF loops.
- `InventoryUI`, `MenuOverlay`, `FastTravelMapOverlay` — persistent UI layers added on top of `sceneManager.container`.

### Scene contract

`src/game/Scene.ts` defines the abstract base. Every scene implements:
- `setup(): Promise<void>` — async asset loading and graph construction
- `enter(fromScene?, exitDirection?)` — called after `setup`; use this to position the player based on which edge they entered from
- `update(deltaMs)` — per-frame
- `exit()` — cleanup
- Optional `refreshDebugData()` — rebuild after live debug edits

Scenes set `onSceneChange` so `main.ts` can route to `sceneManager.switchTo`. Scenes that need depth sorting assign a `depthContainer` and call `sortDepth()` / `applyDepthScaling()` from the base class.

### Mini-games

Live in `src/minigames/` (`VineBuster`, `SeedScatter`, `NightWatch`). Registered as scenes; expose `onComplete` instead of `onSceneChange`. `main.ts` routes completion back to the originating world scene.

### Data-driven content

- `src/data/dialogue.json` — conversation trees consumed by `DialogueSystem`
- `src/data/walkable-areas.json` — polygon walkable regions per scene, consumed by `WalkableArea` / `WalkableAreaDebug`
- `src/data/npc-configs.json` — NPC placements/configs
- `public/assets/perch-data/` — perch coordinates per scene

The Vite dev plugin `vite-debug-save-plugin.ts` exposes `POST /__debug/save` so the running browser can write back to **only** `src/data/` and `public/assets/perch-data/`. `DebugSaveClient.ts` uses it to persist live edits (walkable-area points, perches). Path traversal is blocked server-side.

## Debugging

- **Jump to a scene:** `?scene=<scene_id>` (sets `intro_seen` and routes directly). Valid IDs are the `SceneId` union in `GameState.ts`.
- **Walkable-area editor:** enabled by `WalkableAreaDebug.isEnabled()`; cog button appears in the top-right when on. Edits flow through `DebugUndoStack` and persist via the debug-save plugin.
- **Perch overlay:** `PerchDebugOverlay` visualizes the perch graph used by `PerchSystem`.

## Conventions

- Strict TypeScript. Path alias `@/*` → `src/*`.
- PixiJS: `Container` for grouping, `eventMode = 'static'` for interactive nodes, prefer `TweenManager` over manual lerping.
- New scene → add to `SceneId` union, register in `main.ts`, add walkable area in `walkable-areas.json`.
- New item → add to `ItemId` union and to `itemTexturePaths` in `main.ts`.
- New gameplay flag → add to `FlagId` union (no string flags).
- Asset filenames: kebab-case. Visual assets in `public/assets/`; processing scripts in `tools/` (Python) and `scripts/`.

## Reference docs

- `GEMINI.md` — overlapping project context (kept in sync with this file)
- `docs/plans/2026-02-20-scruffs-day-design.md` — design spec
- `docs/plans/2026-02-20-scruffs-day-implementation.md` — implementation plan
