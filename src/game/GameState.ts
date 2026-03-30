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
  | 'splash'
  | 'intro'
  | 'scrub_thicket'
  | 'tortoise_burrow'
  | 'central_trail'
  | 'pine_clearing'
  | 'sandy_barrens'
  | 'owls_overlook'
  | 'vine_buster'
  | 'seed_scatter'
  | 'night_watch';

export type SceneDirection = 'left' | 'right' | 'up' | 'down';

export type FlagId =
  | 'intro_seen'
  | 'tutorial_complete'
  | 'knows_saw_palmetto'
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
