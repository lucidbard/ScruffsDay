# GEMINI.md - Scruff's Day Project Context

## Project Overview
**Scruff's Day** is a point-and-click adventure game with arcade mini-games, starring Scruff, a Florida scrub jay. Set in the Lyonia Preserve in Deltona, FL, the game aims to educate players (ages 8-12) about native plant conservation and ecosystem restoration. The visual style is inspired by *Homestar Runner*, featuring thick black outlines, bold flat colors, and exaggerated character proportions.

### Core Technology Stack
- **Renderer:** PixiJS v8 (WebGL 2D engine)
- **Language:** TypeScript
- **Build Tool:** Vite
- **Testing:** Vitest
- **Deployment:** GitHub Pages (via `gh-pages`)

### Architecture
- **Centralized State:** Managed by `GameState.ts`, which tracks inventory, progress flags, and visited scenes. It supports persistence via `localStorage`.
- **Scene Management:** `SceneManager.ts` handles loading, unloading, and transitions between game scenes.
- **Input System:** `InputManager.ts` manages touch and mouse interactions for movement and object interaction.
- **Dialogue System:** JSON-driven conversation trees located in `src/data/dialogue.json`.
- **Responsive Design:** The game uses a fixed internal resolution (1280x720) and scales uniformly to fit the device viewport.

## Building and Running

### Prerequisites
- Node.js (v18 or newer recommended)
- npm

### Key Commands
- **Development Server:** `npm run dev` (Starts Vite at `http://localhost:5173`)
- **Production Build:** `npm run build` (Type-checks and builds to `dist/`)
- **Preview Build:** `npm run preview` (Serves the production build locally)
- **Testing:** `npm run test` (Runs Vitest test suites)
- **Deployment:** `npm run deploy` (Builds and pushes to `gh-pages` branch)

### Debugging Features
- **Scene Jump:** Append `?scene=scene_id` to the URL to jump directly to a specific scene.
- **Walkable Area Debug:** A debug panel and visual overlay are available for tuning walkable areas (see `src/game/WalkableAreaDebug.ts`).
- **Debug Save Plugin:** A custom Vite plugin (`vite-debug-save-plugin.ts`) enables the browser to save changes back to `src/data/` and `public/assets/perch-data/` during development. This is used by the `DebugSaveClient.ts` to persist adjustments made in the browser (like walkable area points or perch locations).

## Development Conventions

### Code Style
- **TypeScript:** Strict typing is preferred. Use interfaces for state and configuration data.
- **PixiJS Patterns:** 
    - Use `Container` for grouping related display objects.
    - Prefer `eventMode = 'static'` for interactive elements.
    - Use the `TweenManager` (in `src/game/Tween.ts`) for animations.
- **Scene Structure:** Each scene should extend a base pattern (see `src/game/Scene.ts`) and be registered in `src/main.ts`.

### Asset Management
- **Visuals:** Primary assets are located in `public/assets/`.
- **Tools:** The `tools/` directory contains Python and Shell scripts for processing assets (background removal, sprite sheet generation, animation frames).
- **Naming:** Follow kebab-case for asset filenames (e.g., `scrub-jay-idle.png`).

### Workflow
1.  **Reproduction:** Before fixing bugs, use the `?scene=` debug parameter to jump to the affected area.
2.  **Implementation:** Ensure new scenes are registered in `src/main.ts` and their walkable areas are defined in `src/data/walkable-areas.json`.
3.  **Verification:** Test on multiple viewport sizes (mobile simulation in DevTools). Run `npm run test` before committing.

## Key Files
- `src/main.ts`: Application entry point and system initialization.
- `src/game/GameState.ts`: Central source of truth for game progress.
- `src/game/SceneManager.ts`: Logic for switching between gameplay environments.
- `docs/plans/`: Detailed design and implementation specifications.
- `src/data/`: Static game data including dialogue and walkable areas.
