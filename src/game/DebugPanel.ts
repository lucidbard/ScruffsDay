import dialogueData from '../data/dialogue.json';
import npcConfigs from '../data/npc-configs.json';
import type { SceneId, FlagId, ItemId } from './GameState';
import type { GameState } from './GameState';
import type { SceneManager } from './SceneManager';
import { WalkableAreaDebug } from './WalkableAreaDebug';
import { DebugSaveClient } from './DebugSaveClient';
import { DebugUndoStack } from './DebugUndoStack';

interface DialogueLine {
  text: string;
  condition: string | null;
}

interface DialogueEntry {
  speaker: string;
  lines: DialogueLine[];
  next: string | null;
  action?: string;
  setFlag?: string;
}

/** Which dialogue IDs belong to each scene. */
const SCENE_DIALOGUES: Record<string, string[]> = {
  scrub_thicket: ['tutorial'],
  central_trail: ['sage_intro'],
  tortoise_burrow: [
    'shelly_intro', 'shelly_has_item', 'shelly_after',
    'pip_intro', 'pip_has_item', 'pip_after',
  ],
  pine_clearing: ['flicker_intro', 'flicker_after'],
  sandy_barrens: ['sunny_intro', 'sunny_ready', 'sunny_after'],
  owls_overlook: [
    'sage_finale_intro', 'sage_finale_ready',
    'sage_finale_after', 'sage_finale_celebration',
  ],
};

const SCENE_LABELS: Record<string, string> = {
  scrub_thicket: 'Scrub Thicket',
  central_trail: 'Central Trail',
  tortoise_burrow: 'Tortoise Burrow',
  pine_clearing: 'Pine Clearing',
  sandy_barrens: 'Sandy Barrens',
  owls_overlook: "Owl's Overlook",
};

const ALL_FLAGS: FlagId[] = [
  'intro_seen', 'tutorial_complete', 'shelly_helped', 'pip_helped',
  'flicker_helped', 'sunny_helped', 'vine_buster_complete',
  'seed_scatter_complete', 'night_watch_complete',
  'fast_travel_unlocked', 'game_complete',
];

const ALL_ITEMS: ItemId[] = [
  'saw_palmetto_fronds', 'scrub_hickory_nuts', 'sand_pine_cones',
  'florida_rosemary_cuttings', 'rusty_lyonia_flowers',
  'chapman_oak_acorns', 'flicker_feather', 'pip_map',
];

const SPEAKERS = ['Scruff', 'Shelly', 'Sage', 'Pip', 'Flicker', 'Sunny'];

interface StagePreset {
  flags: FlagId[];
  items: ItemId[];
  scene?: SceneId;
}

const STAGE_PRESETS: Record<string, StagePreset> = {
  'Fresh Start': { flags: [], items: [], scene: 'scrub_thicket' },
  'Post-Tutorial': {
    flags: ['intro_seen', 'tutorial_complete'],
    items: [],
    scene: 'scrub_thicket',
  },
  'Shelly Helped': {
    flags: ['intro_seen', 'tutorial_complete', 'shelly_helped'],
    items: ['scrub_hickory_nuts'],
    scene: 'tortoise_burrow',
  },
  'Mid-Game': {
    flags: ['intro_seen', 'tutorial_complete', 'shelly_helped', 'pip_helped', 'flicker_helped'],
    items: ['flicker_feather', 'pip_map', 'florida_rosemary_cuttings'],
    scene: 'sandy_barrens',
  },
  'Pre-Finale': {
    flags: [
      'intro_seen', 'tutorial_complete', 'shelly_helped', 'pip_helped',
      'flicker_helped', 'sunny_helped', 'vine_buster_complete', 'seed_scatter_complete',
    ],
    items: ['flicker_feather', 'pip_map', 'rusty_lyonia_flowers', 'chapman_oak_acorns'],
    scene: 'owls_overlook',
  },
};

type TabId = 'state' | 'dialogue' | 'npcs' | 'geometry';

export class DebugPanel {
  private el: HTMLDivElement;
  private navContainer: HTMLDivElement;
  private tabBar: HTMLDivElement;
  private tabContent: HTMLDivElement;
  private sceneManager: SceneManager;
  private gameState: GameState;
  private activeSceneId: SceneId | null = null;
  private activeTab: TabId = 'state';
  private playMode = false;

  // Dirty tracking — snapshots taken on last save/load
  private dialogueSnapshot = '';
  private npcSnapshot = '';

  // All dialogue IDs for dropdowns
  private allDialogueIds: string[];

  constructor(sceneManager: SceneManager, gameState: GameState) {
    this.sceneManager = sceneManager;
    this.gameState = gameState;
    this.allDialogueIds = Object.keys(dialogueData);

    // Take initial snapshots
    this.dialogueSnapshot = JSON.stringify(dialogueData);
    this.npcSnapshot = JSON.stringify(npcConfigs);

    this.el = document.createElement('div');
    this.el.id = 'debug-panel';
    Object.assign(this.el.style, {
      display: 'none',
      position: 'fixed',
      top: '0',
      right: '0',
      width: '420px',
      maxHeight: '100vh',
      overflowY: 'auto',
      background: 'rgba(26, 26, 46, 0.95)',
      color: '#cccccc',
      fontFamily: 'monospace',
      fontSize: '13px',
      padding: '16px',
      borderLeft: '2px solid #00ff00',
      borderBottom: '2px solid #00ff00',
      zIndex: '9999',
      boxSizing: 'border-box',
    });

    // Top bar: Scene Navigation + global controls
    this.navContainer = document.createElement('div');
    Object.assign(this.navContainer.style, {
      marginBottom: '12px',
      paddingBottom: '12px',
      borderBottom: '1px solid #333',
    });
    this.buildNavHeader();
    this.el.appendChild(this.navContainer);

    // Tab bar
    this.tabBar = document.createElement('div');
    Object.assign(this.tabBar.style, {
      display: 'flex',
      gap: '4px',
      marginBottom: '12px',
    });
    this.el.appendChild(this.tabBar);

    // Tab content area
    this.tabContent = document.createElement('div');
    this.el.appendChild(this.tabContent);

    document.body.appendChild(this.el);

    // Listen for scene switches
    sceneManager.onSceneSwitch = (id) => this.onSceneChange(id);

    // Keyboard shortcut: Ctrl+Z for undo
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'z' && this.el.style.display !== 'none') {
        e.preventDefault();
        this.handleUndo();
      }
    });
  }

  private buildNavHeader(): void {
    this.navContainer.innerHTML = '';

    // Header row
    const navHeader = document.createElement('div');
    Object.assign(navHeader.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px',
    });

    const navTitle = document.createElement('div');
    navTitle.textContent = 'Debug Panel';
    Object.assign(navTitle.style, { color: '#00ff00', fontWeight: 'bold', fontSize: '14px' });
    navHeader.appendChild(navTitle);

    const headerBtns = document.createElement('div');
    Object.assign(headerBtns.style, { display: 'flex', gap: '6px' });

    // Undo button
    const undoBtn = this.makeHeaderBtn('Undo', '#ffaa00', '#ffaa00', () => this.handleUndo());
    headerBtns.appendChild(undoBtn);

    // Save All button
    const saveAllBtn = this.makeHeaderBtn('Save All', '#66ff66', '#66ff66', () => this.handleSaveAll());
    headerBtns.appendChild(saveAllBtn);

    // Play Mode button
    const playBtn = this.makeHeaderBtn('Play Mode', '#66ff66', '#66ff66', () => this.enterPlayMode());
    headerBtns.appendChild(playBtn);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u2715';
    Object.assign(closeBtn.style, {
      background: 'none', color: '#ff6666', border: '1px solid #ff6666',
      borderRadius: '4px', padding: '2px 8px', cursor: 'pointer',
      fontFamily: 'monospace', fontSize: '14px',
    });
    closeBtn.addEventListener('click', () => this.toggle());
    headerBtns.appendChild(closeBtn);

    navHeader.appendChild(headerBtns);
    this.navContainer.appendChild(navHeader);

    // Scene buttons
    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, { display: 'flex', gap: '8px', flexWrap: 'wrap' });
    for (const sceneId of Object.keys(SCENE_LABELS)) {
      const btn = document.createElement('button');
      btn.textContent = SCENE_LABELS[sceneId];
      btn.dataset.scene = sceneId;
      Object.assign(btn.style, {
        background: '#333', color: '#ccc', border: '1px solid #555',
        borderRadius: '4px', padding: '6px 12px', cursor: 'pointer',
        fontFamily: 'monospace', fontSize: '12px',
      });
      btn.addEventListener('click', () => this.sceneManager.switchTo(sceneId as SceneId));
      btnRow.appendChild(btn);
    }
    this.navContainer.appendChild(btnRow);
  }

  private makeHeaderBtn(text: string, color: string, border: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    Object.assign(btn.style, {
      background: 'none', color, fontSize: '12px',
      border: `1px solid ${border}`, borderRadius: '4px',
      padding: '2px 8px', cursor: 'pointer', fontFamily: 'monospace',
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  toggle(): void {
    const visible = this.el.style.display !== 'none';
    if (visible) {
      this.el.style.display = 'none';
    } else {
      if (this.playMode) {
        this.playMode = false;
        WalkableAreaDebug.setAllVisible(true);
      }
      this.el.style.display = 'block';
    }
  }

  private enterPlayMode(): void {
    this.playMode = true;
    this.el.style.display = 'none';
    WalkableAreaDebug.setAllVisible(false);
  }

  onSceneChange(sceneId: SceneId): void {
    this.activeSceneId = sceneId;
    this.updateNav();
    this.renderTabs();
    this.renderActiveTab();
  }

  private updateNav(): void {
    const buttons = this.navContainer.querySelectorAll('button[data-scene]');
    buttons.forEach((btn) => {
      const el = btn as HTMLButtonElement;
      const isActive = el.dataset.scene === this.activeSceneId;
      Object.assign(el.style, {
        background: isActive ? '#00ff00' : '#333',
        color: isActive ? '#000' : '#ccc',
        border: isActive ? '1px solid #00ff00' : '1px solid #555',
        fontWeight: isActive ? 'bold' : 'normal',
      });
    });
  }

  private renderTabs(): void {
    this.tabBar.innerHTML = '';
    const tabs: { id: TabId; label: string }[] = [
      { id: 'state', label: 'State' },
      { id: 'dialogue', label: `Dialogue${this.isDialogueDirty() ? ' *' : ''}` },
      { id: 'npcs', label: `NPCs${this.isNpcDirty() ? ' *' : ''}` },
      { id: 'geometry', label: 'Geometry' },
    ];
    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.textContent = tab.label;
      const isActive = this.activeTab === tab.id;
      Object.assign(btn.style, {
        background: isActive ? '#00ff00' : '#222',
        color: isActive ? '#000' : '#888',
        border: isActive ? '1px solid #00ff00' : '1px solid #444',
        borderRadius: '4px 4px 0 0',
        padding: '6px 14px',
        cursor: 'pointer',
        fontFamily: 'monospace',
        fontSize: '12px',
        fontWeight: isActive ? 'bold' : 'normal',
      });
      btn.addEventListener('click', () => {
        this.activeTab = tab.id;
        this.renderTabs();
        this.renderActiveTab();
      });
      this.tabBar.appendChild(btn);
    }
  }

  private renderActiveTab(): void {
    this.tabContent.innerHTML = '';
    switch (this.activeTab) {
      case 'state': this.renderState(); break;
      case 'dialogue': this.renderDialogue(); break;
      case 'npcs': this.renderNpcs(); break;
      case 'geometry': this.renderGeometry(); break;
    }
  }

  // ─── Dirty tracking ────────────────────────────────

  private isDialogueDirty(): boolean {
    return JSON.stringify(dialogueData) !== this.dialogueSnapshot;
  }

  private isNpcDirty(): boolean {
    return JSON.stringify(npcConfigs) !== this.npcSnapshot;
  }

  // ─── Undo ──────────────────────────────────────────

  private async handleUndo(): Promise<void> {
    const entry = await DebugUndoStack.instance.undo();
    if (!entry) return;

    // If the undone file is dialogue or npc configs, update the in-memory data
    if (entry.path === 'src/data/dialogue.json') {
      const restored = JSON.parse(entry.before);
      Object.keys(dialogueData).forEach(k => delete (dialogueData as Record<string, unknown>)[k]);
      Object.assign(dialogueData, restored);
      this.dialogueSnapshot = entry.before;
    } else if (entry.path === 'src/data/npc-configs.json') {
      const restored = JSON.parse(entry.before);
      Object.keys(npcConfigs).forEach(k => delete (npcConfigs as Record<string, unknown>)[k]);
      Object.assign(npcConfigs, restored);
      this.npcSnapshot = entry.before;
    }

    this.renderTabs();
    this.renderActiveTab();
  }

  // ─── Save All ──────────────────────────────────────

  private async handleSaveAll(): Promise<void> {
    try {
      if (this.isDialogueDirty()) await this.saveDialogue();
      if (this.isNpcDirty()) await this.saveNpcConfigs();
    } catch (err) {
      console.error('[DebugPanel] Save All failed:', err);
    }
    this.renderTabs();
    this.renderActiveTab();
  }

  // ─── State Tab ─────────────────────────────────────

  private renderState(): void {
    const container = document.createElement('div');
    const gs = this.gameState;
    const visited = gs.getVisitedScenes();

    // Header row with title + presets
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px',
    });
    const title = document.createElement('div');
    title.textContent = 'Game State';
    Object.assign(title.style, { color: '#00ff00', fontWeight: 'bold', fontSize: '14px' });
    header.appendChild(title);

    const presetRow = document.createElement('div');
    Object.assign(presetRow.style, { display: 'flex', gap: '6px', flexWrap: 'wrap' });
    for (const [label, preset] of Object.entries(STAGE_PRESETS)) {
      const btn = document.createElement('button');
      btn.textContent = label;
      Object.assign(btn.style, {
        background: '#2a1a3e', color: '#cc88ff', border: '1px solid #8844cc',
        borderRadius: '4px', padding: '3px 8px', cursor: 'pointer',
        fontFamily: 'monospace', fontSize: '11px',
      });
      btn.addEventListener('click', () => this.applyPreset(preset));
      presetRow.appendChild(btn);
    }
    header.appendChild(presetRow);
    container.appendChild(header);

    // Three-column layout
    const columns = document.createElement('div');
    Object.assign(columns.style, { display: 'flex', gap: '24px', flexWrap: 'wrap' });

    // Flags
    const flagsCol = document.createElement('div');
    Object.assign(flagsCol.style, { flex: '1', minWidth: '200px' });
    const flagsTitle = document.createElement('div');
    flagsTitle.textContent = 'Flags (click to toggle)';
    Object.assign(flagsTitle.style, { color: '#4488ff', fontWeight: 'bold', marginBottom: '4px', fontSize: '12px' });
    flagsCol.appendChild(flagsTitle);
    for (const flag of ALL_FLAGS) {
      flagsCol.appendChild(this.createToggleRow(flag, gs.getFlag(flag), '#66ff66', () => {
        if (gs.getFlag(flag)) gs.clearFlag(flag); else gs.setFlag(flag);
        gs.save();
        this.renderActiveTab();
      }));
    }
    columns.appendChild(flagsCol);

    // Inventory
    const itemsCol = document.createElement('div');
    Object.assign(itemsCol.style, { flex: '1', minWidth: '200px' });
    const itemsTitle = document.createElement('div');
    itemsTitle.textContent = 'Inventory (click to toggle)';
    Object.assign(itemsTitle.style, { color: '#4488ff', fontWeight: 'bold', marginBottom: '4px', fontSize: '12px' });
    itemsCol.appendChild(itemsTitle);
    for (const item of ALL_ITEMS) {
      itemsCol.appendChild(this.createToggleRow(item, gs.hasItem(item), '#ffaa00', () => {
        if (gs.hasItem(item)) gs.removeItem(item); else gs.addItem(item);
        gs.save();
        this.renderActiveTab();
      }));
    }
    columns.appendChild(itemsCol);

    // Visited scenes
    const visitedCol = document.createElement('div');
    Object.assign(visitedCol.style, { flex: '1', minWidth: '200px' });
    const visitedTitle = document.createElement('div');
    visitedTitle.textContent = 'Visited Scenes';
    Object.assign(visitedTitle.style, { color: '#4488ff', fontWeight: 'bold', marginBottom: '4px', fontSize: '12px' });
    visitedCol.appendChild(visitedTitle);
    for (const sceneId of Object.keys(SCENE_LABELS)) {
      const been = visited.includes(sceneId as SceneId);
      const row = document.createElement('div');
      row.textContent = `${been ? '●' : '○'} ${SCENE_LABELS[sceneId]}`;
      Object.assign(row.style, { color: been ? '#66ff66' : '#555', fontSize: '12px' });
      visitedCol.appendChild(row);
    }
    columns.appendChild(visitedCol);

    container.appendChild(columns);
    this.tabContent.appendChild(container);
  }

  private createToggleRow(label: string, isOn: boolean, onColor: string, onClick: () => void): HTMLDivElement {
    const row = document.createElement('div');
    row.textContent = `${isOn ? '●' : '○'} ${label}`;
    Object.assign(row.style, {
      color: isOn ? onColor : '#555', fontSize: '12px', cursor: 'pointer', padding: '1px 0',
    });
    row.addEventListener('click', onClick);
    row.addEventListener('mouseenter', () => { row.style.textDecoration = 'underline'; });
    row.addEventListener('mouseleave', () => { row.style.textDecoration = 'none'; });
    return row;
  }

  private applyPreset(preset: StagePreset): void {
    const gs = this.gameState;
    for (const flag of ALL_FLAGS) gs.clearFlag(flag);
    for (const item of ALL_ITEMS) gs.removeItem(item);
    for (const flag of preset.flags) gs.setFlag(flag);
    for (const item of preset.items) gs.addItem(item);
    gs.save();
    this.renderActiveTab();
    if (preset.scene) this.sceneManager.switchTo(preset.scene);
  }

  // ─── Dialogue Tab ──────────────────────────────────

  private renderDialogue(): void {
    const container = document.createElement('div');
    const sceneId = this.activeSceneId;
    if (!sceneId) return;

    const label = SCENE_LABELS[sceneId] ?? sceneId;
    const dialogueIds = SCENE_DIALOGUES[sceneId];

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.textContent = this.isDialogueDirty() ? 'Save Dialogue *' : 'Save Dialogue';
    Object.assign(saveBtn.style, {
      background: '#1a3a1a', color: '#66ff66', border: '1px solid #66ff66',
      borderRadius: '4px', padding: '6px 16px', cursor: 'pointer',
      fontFamily: 'monospace', fontSize: '13px', marginBottom: '12px',
    });
    saveBtn.addEventListener('click', async () => {
      saveBtn.textContent = 'Saving...';
      try {
        await this.saveDialogue();
        saveBtn.textContent = 'Saved!';
        setTimeout(() => { this.renderTabs(); this.renderActiveTab(); }, 1000);
      } catch (err) {
        console.error('[DebugPanel] Dialogue save failed:', err);
        saveBtn.textContent = 'Error!';
      }
    });
    container.appendChild(saveBtn);

    const heading = document.createElement('h2');
    heading.textContent = `Dialogue — ${label}`;
    Object.assign(heading.style, { color: '#00ff00', margin: '0 0 12px 0', fontSize: '16px' });
    container.appendChild(heading);

    if (!dialogueIds || dialogueIds.length === 0) {
      const msg = document.createElement('div');
      msg.textContent = 'No dialogue in this scene.';
      msg.style.color = '#888';
      container.appendChild(msg);
      this.tabContent.appendChild(container);
      return;
    }

    const entries = dialogueData as Record<string, DialogueEntry>;

    for (const id of dialogueIds) {
      const entry = entries[id];
      if (!entry) continue;
      container.appendChild(this.buildDialogueCard(id, entry));
    }

    this.tabContent.appendChild(container);
  }

  private buildDialogueCard(id: string, entry: DialogueEntry): HTMLDivElement {
    const card = document.createElement('div');
    Object.assign(card.style, {
      marginBottom: '12px', padding: '10px', background: '#0f0f1e',
      borderRadius: '4px', borderLeft: '3px solid #4488ff',
    });

    // ID label
    const idLabel = document.createElement('div');
    idLabel.textContent = id;
    Object.assign(idLabel.style, { color: '#ffaa00', fontWeight: 'bold', marginBottom: '6px' });
    card.appendChild(idLabel);

    // Speaker select
    card.appendChild(this.labeledField('Speaker:', this.makeSelect(SPEAKERS, entry.speaker, (v) => { entry.speaker = v; this.renderTabs(); })));

    // Lines
    const linesLabel = document.createElement('div');
    linesLabel.textContent = 'Lines:';
    Object.assign(linesLabel.style, { color: '#aaa', fontSize: '11px', marginTop: '6px', marginBottom: '4px' });
    card.appendChild(linesLabel);

    for (let i = 0; i < entry.lines.length; i++) {
      const line = entry.lines[i];
      const lineRow = document.createElement('div');
      Object.assign(lineRow.style, { marginBottom: '4px', display: 'flex', gap: '4px', alignItems: 'flex-start' });

      const ta = document.createElement('textarea');
      ta.value = line.text;
      Object.assign(ta.style, {
        flex: '1', background: '#1a1a2e', color: '#ddd', border: '1px solid #444',
        borderRadius: '3px', padding: '4px', fontFamily: 'monospace', fontSize: '12px',
        resize: 'vertical', minHeight: '32px',
      });
      ta.addEventListener('input', () => { line.text = ta.value; this.renderTabs(); });
      lineRow.appendChild(ta);

      const condInput = document.createElement('input');
      condInput.type = 'text';
      condInput.value = line.condition ?? '';
      condInput.placeholder = 'condition';
      Object.assign(condInput.style, {
        width: '80px', background: '#1a1a2e', color: '#ff8888', border: '1px solid #444',
        borderRadius: '3px', padding: '4px', fontFamily: 'monospace', fontSize: '11px',
      });
      condInput.addEventListener('input', () => { line.condition = condInput.value || null; this.renderTabs(); });
      lineRow.appendChild(condInput);

      // Remove line button
      const rmBtn = document.createElement('button');
      rmBtn.textContent = '×';
      Object.assign(rmBtn.style, {
        background: 'none', color: '#ff6666', border: '1px solid #ff6666',
        borderRadius: '3px', padding: '2px 6px', cursor: 'pointer', fontFamily: 'monospace',
      });
      rmBtn.addEventListener('click', () => {
        entry.lines.splice(i, 1);
        this.renderTabs();
        this.renderActiveTab();
      });
      lineRow.appendChild(rmBtn);

      card.appendChild(lineRow);
    }

    // Add line button
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Line';
    Object.assign(addBtn.style, {
      background: '#1a2a1a', color: '#66ff66', border: '1px solid #448844',
      borderRadius: '3px', padding: '2px 10px', cursor: 'pointer',
      fontFamily: 'monospace', fontSize: '11px', marginTop: '2px', marginBottom: '6px',
    });
    addBtn.addEventListener('click', () => {
      entry.lines.push({ text: '', condition: null });
      this.renderTabs();
      this.renderActiveTab();
    });
    card.appendChild(addBtn);

    // Action
    card.appendChild(this.labeledField('action:', this.makeTextInput(entry.action ?? '', (v) => {
      entry.action = v || undefined;
      this.renderTabs();
    })));

    // setFlag
    card.appendChild(this.labeledField('setFlag:', this.makeSelect(
      ['', ...ALL_FLAGS],
      entry.setFlag ?? '',
      (v) => { entry.setFlag = v || undefined; this.renderTabs(); },
    )));

    // next
    card.appendChild(this.labeledField('next:', this.makeTextInput(entry.next ?? '', (v) => {
      entry.next = v || null;
      this.renderTabs();
    })));

    return card;
  }

  private async saveDialogue(): Promise<void> {
    const before = this.dialogueSnapshot;
    const after = JSON.stringify(dialogueData, null, 2);
    await DebugSaveClient.instance.save('src/data/dialogue.json', after);
    DebugUndoStack.instance.push('src/data/dialogue.json', before, after);
    this.dialogueSnapshot = after;
  }

  // ─── NPCs Tab ──────────────────────────────────────

  private renderNpcs(): void {
    const container = document.createElement('div');

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.textContent = this.isNpcDirty() ? 'Save NPCs *' : 'Save NPCs';
    Object.assign(saveBtn.style, {
      background: '#1a3a1a', color: '#66ff66', border: '1px solid #66ff66',
      borderRadius: '4px', padding: '6px 16px', cursor: 'pointer',
      fontFamily: 'monospace', fontSize: '13px', marginBottom: '12px',
    });
    saveBtn.addEventListener('click', async () => {
      saveBtn.textContent = 'Saving...';
      try {
        await this.saveNpcConfigs();
        saveBtn.textContent = 'Saved!';
        setTimeout(() => { this.renderTabs(); this.renderActiveTab(); }, 1000);
      } catch (err) {
        console.error('[DebugPanel] NPC save failed:', err);
        saveBtn.textContent = 'Error!';
      }
    });
    container.appendChild(saveBtn);

    const heading = document.createElement('h2');
    heading.textContent = 'NPC Configs';
    Object.assign(heading.style, { color: '#00ff00', margin: '0 0 12px 0', fontSize: '16px' });
    container.appendChild(heading);

    const configs = npcConfigs as Record<string, Record<string, unknown>>;
    for (const [key, cfg] of Object.entries(configs)) {
      container.appendChild(this.buildNpcCard(key, cfg));
    }

    this.tabContent.appendChild(container);
  }

  private buildNpcCard(key: string, cfg: Record<string, unknown>): HTMLDivElement {
    const card = document.createElement('div');
    Object.assign(card.style, {
      marginBottom: '12px', padding: '10px', background: '#0f0f1e',
      borderRadius: '4px', borderLeft: '3px solid #4488ff',
    });

    const title = document.createElement('div');
    title.textContent = `${cfg.name as string} (${key})`;
    Object.assign(title.style, { color: '#ffaa00', fontWeight: 'bold', marginBottom: '6px' });
    card.appendChild(title);

    // Position
    const posRow = document.createElement('div');
    Object.assign(posRow.style, { display: 'flex', gap: '8px', marginBottom: '4px' });
    posRow.appendChild(this.labeledField('x:', this.makeNumberInput(cfg.x as number, (v) => { cfg.x = v; this.renderTabs(); })));
    posRow.appendChild(this.labeledField('y:', this.makeNumberInput(cfg.y as number, (v) => { cfg.y = v; this.renderTabs(); })));
    card.appendChild(posRow);

    // dialogueDefault
    card.appendChild(this.labeledField('dialogueDefault:', this.makeSelect(
      this.allDialogueIds,
      (cfg.dialogueDefault as string) ?? '',
      (v) => { cfg.dialogueDefault = v; this.renderTabs(); },
    )));

    // dialogueHasItem
    card.appendChild(this.labeledField('dialogueHasItem:', this.makeSelect(
      ['', ...this.allDialogueIds],
      (cfg.dialogueHasItem as string) ?? '',
      (v) => { cfg.dialogueHasItem = v || null; this.renderTabs(); },
    )));

    // dialogueAfter
    card.appendChild(this.labeledField('dialogueAfter:', this.makeSelect(
      ['', ...this.allDialogueIds],
      (cfg.dialogueAfter as string) ?? '',
      (v) => { cfg.dialogueAfter = v || null; this.renderTabs(); },
    )));

    // wantsItem
    card.appendChild(this.labeledField('wantsItem:', this.makeSelect(
      ['', ...ALL_ITEMS],
      (cfg.wantsItem as string) ?? '',
      (v) => { cfg.wantsItem = v || null; this.renderTabs(); },
    )));

    // helpedFlag
    card.appendChild(this.labeledField('helpedFlag:', this.makeSelect(
      ['', ...ALL_FLAGS],
      (cfg.helpedFlag as string) ?? '',
      (v) => { cfg.helpedFlag = v || null; this.renderTabs(); },
    )));

    return card;
  }

  private async saveNpcConfigs(): Promise<void> {
    const before = this.npcSnapshot;
    const after = JSON.stringify(npcConfigs, null, 2);
    await DebugSaveClient.instance.save('src/data/npc-configs.json', after);
    DebugUndoStack.instance.push('src/data/npc-configs.json', before, after);
    this.npcSnapshot = after;
  }

  // ─── Geometry Tab ──────────────────────────────────

  private renderGeometry(): void {
    const container = document.createElement('div');

    const heading = document.createElement('h2');
    heading.textContent = 'Geometry';
    Object.assign(heading.style, { color: '#00ff00', margin: '0 0 12px 0', fontSize: '16px' });
    container.appendChild(heading);

    const instructions = document.createElement('div');
    instructions.textContent = 'Drag vertices on canvas. Shift+click to add. Right-click to remove.';
    Object.assign(instructions.style, { color: '#888', fontSize: '12px', marginBottom: '12px' });
    container.appendChild(instructions);

    const info = document.createElement('div');
    info.textContent = `Active scene: ${this.activeSceneId ?? 'none'}`;
    Object.assign(info.style, { color: '#aaa', fontSize: '12px', marginBottom: '8px' });
    container.appendChild(info);

    const note = document.createElement('div');
    note.textContent = 'Use the Save button on the canvas overlay to save geometry and NPC positions for the current scene.';
    Object.assign(note.style, { color: '#888', fontSize: '11px', fontStyle: 'italic' });
    container.appendChild(note);

    this.tabContent.appendChild(container);
  }

  // ─── Form helpers ──────────────────────────────────

  private labeledField(label: string, input: HTMLElement): HTMLDivElement {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' });
    const lbl = document.createElement('span');
    lbl.textContent = label;
    Object.assign(lbl.style, { color: '#888', fontSize: '11px', minWidth: '90px' });
    row.appendChild(lbl);
    row.appendChild(input);
    return row;
  }

  private makeSelect(options: string[], value: string, onChange: (v: string) => void): HTMLSelectElement {
    const sel = document.createElement('select');
    Object.assign(sel.style, {
      background: '#1a1a2e', color: '#ddd', border: '1px solid #444',
      borderRadius: '3px', padding: '3px', fontFamily: 'monospace', fontSize: '11px',
      flex: '1',
    });
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt || '(none)';
      if (opt === value) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  private makeTextInput(value: string, onChange: (v: string) => void): HTMLInputElement {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = value;
    Object.assign(inp.style, {
      background: '#1a1a2e', color: '#ddd', border: '1px solid #444',
      borderRadius: '3px', padding: '3px', fontFamily: 'monospace', fontSize: '11px',
      flex: '1',
    });
    inp.addEventListener('input', () => onChange(inp.value));
    return inp;
  }

  private makeNumberInput(value: number, onChange: (v: number) => void): HTMLInputElement {
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.value = String(value);
    Object.assign(inp.style, {
      width: '70px', background: '#1a1a2e', color: '#ddd', border: '1px solid #444',
      borderRadius: '3px', padding: '3px', fontFamily: 'monospace', fontSize: '11px',
    });
    inp.addEventListener('input', () => {
      const n = parseFloat(inp.value);
      if (!isNaN(n)) onChange(n);
    });
    return inp;
  }
}
