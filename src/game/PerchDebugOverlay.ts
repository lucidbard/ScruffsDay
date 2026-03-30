/**
 * Debug overlay for editing perch points.
 * - Shows all perch points as colored circles with labels
 * - Drag to reposition
 * - Double-click empty space to add a new perch
 * - Right-click a perch to delete it
 * - Save button writes updated JSON via debug save endpoint
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { PerchSystem, Perch } from './PerchSystem';
import { DebugSaveClient } from './DebugSaveClient';

const PERCH_COLORS: Record<string, number> = {
  branch: 0xFFFF00,
  ground: 0x00FF00,
  rock: 0xFF8800,
  post: 0xFF00FF,
};

const PERCH_RADIUS = 10;
const PERCH_TYPES: Perch['type'][] = ['branch', 'ground', 'rock', 'post'];

export class PerchDebugOverlay {
  readonly container = new Container();
  private perchSystem: PerchSystem;
  private sceneName: string;
  private perchMarkers: { perch: Perch; graphics: Graphics; label: Text }[] = [];
  private dragging: { marker: { perch: Perch; graphics: Graphics; label: Text }; offsetX: number; offsetY: number } | null = null;
  private addTypeIndex = 0; // cycles through PERCH_TYPES on add
  private deleteMode = false;
  private imageSize: [number, number];

  constructor(perchSystem: PerchSystem, sceneName: string, imageSize: [number, number] = [1280, 720]) {
    this.perchSystem = perchSystem;
    this.sceneName = sceneName;
    this.imageSize = imageSize;
    this.buildUI();
    this.renderPerches();
  }

  private buildUI(): void {
    // Save button
    const saveBtn = new Container();
    const saveBg = new Graphics();
    saveBg.roundRect(0, 0, 100, 32, 6);
    saveBg.fill({ color: 0x2E7D32, alpha: 0.9 });
    saveBg.stroke({ width: 2, color: 0xFFFFFF });
    const saveText = new Text({
      text: 'Save Perches',
      style: new TextStyle({ fontSize: 13, fill: '#FFFFFF', fontWeight: 'bold' }),
    });
    saveText.position.set(8, 7);
    saveBtn.addChild(saveBg, saveText);
    saveBtn.position.set(10, 50);
    saveBtn.eventMode = 'static';
    saveBtn.cursor = 'pointer';
    saveBtn.on('pointertap', (e) => {
      e.stopPropagation();
      this.save();
    });
    this.container.addChild(saveBtn);

    // Add perch button
    const addBtn = new Container();
    const addBg = new Graphics();
    addBg.roundRect(0, 0, 100, 32, 6);
    addBg.fill({ color: 0x1565C0, alpha: 0.9 });
    addBg.stroke({ width: 2, color: 0xFFFFFF });
    const addText = new Text({
      text: '+ Add Perch',
      style: new TextStyle({ fontSize: 13, fill: '#FFFFFF', fontWeight: 'bold' }),
    });
    addText.position.set(8, 7);
    addBtn.addChild(addBg, addText);
    addBtn.position.set(120, 50);
    addBtn.eventMode = 'static';
    addBtn.cursor = 'pointer';
    addBtn.on('pointertap', (e) => {
      e.stopPropagation();
      this.addPerchAtCenter();
    });
    this.container.addChild(addBtn);

    // Type label (shows current add type)
    this.typeLabelBg = new Graphics();
    this.typeLabelBg.roundRect(0, 0, 100, 24, 4);
    this.typeLabelBg.fill({ color: 0x000000, alpha: 0.7 });
    this.typeLabelBg.position.set(230, 54);
    this.container.addChild(this.typeLabelBg);
    this.typeLabel = new Text({
      text: `Type: ${PERCH_TYPES[this.addTypeIndex]}`,
      style: new TextStyle({ fontSize: 13, fill: '#FFFFFF', fontWeight: 'bold' }),
    });
    this.typeLabel.position.set(236, 56);
    this.container.addChild(this.typeLabel);

    // Cycle type button
    const typeBtn = new Container();
    const typeBg = new Graphics();
    typeBg.roundRect(0, 0, 60, 32, 6);
    typeBg.fill({ color: 0x6A1B9A, alpha: 0.9 });
    typeBg.stroke({ width: 2, color: 0xFFFFFF });
    const typeText = new Text({
      text: 'Type >>',
      style: new TextStyle({ fontSize: 12, fill: '#FFFFFF' }),
    });
    typeText.position.set(6, 8);
    typeBtn.addChild(typeBg, typeText);
    typeBtn.position.set(320, 50);
    typeBtn.eventMode = 'static';
    typeBtn.cursor = 'pointer';
    typeBtn.on('pointertap', (e) => {
      e.stopPropagation();
      this.addTypeIndex = (this.addTypeIndex + 1) % PERCH_TYPES.length;
      this.typeLabel.text = `Type: ${PERCH_TYPES[this.addTypeIndex]}`;
    });
    this.container.addChild(typeBtn);

    // Delete mode toggle
    const delBtn = new Container();
    const delBg = new Graphics();
    delBg.roundRect(0, 0, 80, 32, 6);
    delBg.fill({ color: 0xC62828, alpha: 0.9 });
    delBg.stroke({ width: 2, color: 0xFFFFFF });
    this.deleteBtnBg = delBg;
    const delText = new Text({
      text: 'Delete',
      style: new TextStyle({ fontSize: 13, fill: '#FFFFFF', fontWeight: 'bold' }),
    });
    delText.position.set(12, 7);
    delBtn.addChild(delBg, delText);
    delBtn.position.set(390, 50);
    delBtn.eventMode = 'static';
    delBtn.cursor = 'pointer';
    delBtn.on('pointertap', (e) => {
      e.stopPropagation();
      this.deleteMode = !this.deleteMode;
      this.deleteBtnBg.clear();
      this.deleteBtnBg.roundRect(0, 0, 80, 32, 6);
      this.deleteBtnBg.fill({ color: this.deleteMode ? 0xFF1744 : 0xC62828, alpha: 0.9 });
      this.deleteBtnBg.stroke({ width: 2, color: this.deleteMode ? 0xFFFF00 : 0xFFFFFF });
    });
    this.container.addChild(delBtn);
  }

  private typeLabel!: Text;
  private deleteBtnBg!: Graphics;
  private typeLabelBg!: Graphics;

  private renderPerches(): void {
    // Remove old markers
    for (const m of this.perchMarkers) {
      this.container.removeChild(m.graphics);
      this.container.removeChild(m.label);
    }
    this.perchMarkers = [];

    for (const perch of this.perchSystem.getPerches()) {
      const scaled = this.perchSystem.scaleToGame(perch);
      this.createMarker(perch, scaled.x, scaled.y);
    }
  }

  private createMarker(perch: Perch, gameX: number, gameY: number): void {
    const color = PERCH_COLORS[perch.type] ?? 0xFFFFFF;

    const g = new Graphics();
    g.circle(0, 0, PERCH_RADIUS);
    g.fill({ color, alpha: 0.85 });
    g.stroke({ width: 2, color: 0x000000 });
    g.position.set(gameX, gameY);
    g.eventMode = 'static';
    g.cursor = 'grab';

    const label = new Text({
      text: perch.name,
      style: new TextStyle({ fontSize: 11, fill: '#FFFFFF', fontWeight: 'bold' }),
    });
    label.position.set(gameX + PERCH_RADIUS + 4, gameY - 6);

    const marker = { perch, graphics: g, label };
    this.perchMarkers.push(marker);

    // Click: delete if in delete mode, otherwise drag
    g.on('pointerdown', (e) => {
      e.stopPropagation();
      if (this.deleteMode) {
        this.deletePerch(marker);
        return;
      }
      this.dragging = {
        marker,
        offsetX: e.getLocalPosition(g).x,
        offsetY: e.getLocalPosition(g).y,
      };
      g.cursor = 'grabbing';
    });

    // Right-click to delete
    g.on('rightclick', (e) => {
      e.stopPropagation();
      e.preventDefault?.();
      this.deletePerch(marker);
    });

    this.container.addChild(g);
    this.container.addChild(label);

    // Global move/up on the container
    if (!this._hasGlobalListeners) {
      this._hasGlobalListeners = true;
      this.container.eventMode = 'static';
      this.container.on('pointermove', (e) => {
        if (!this.dragging) return;
        const pos = e.getLocalPosition(this.container);
        const newX = pos.x - this.dragging.offsetX;
        const newY = pos.y - this.dragging.offsetY;
        this.dragging.marker.graphics.position.set(newX, newY);
        this.dragging.marker.label.position.set(newX + PERCH_RADIUS + 4, newY - 6);
        // Update perch data (convert back to image coords)
        this.dragging.marker.perch.x = Math.round((newX / 1280) * this.imageSize[0]);
        this.dragging.marker.perch.y = Math.round((newY / 720) * this.imageSize[1]);
      });
      this.container.on('pointerup', () => {
        if (this.dragging) {
          this.dragging.marker.graphics.cursor = 'grab';
          this.dragging = null;
        }
      });
      this.container.on('pointerupoutside', () => {
        if (this.dragging) {
          this.dragging.marker.graphics.cursor = 'grab';
          this.dragging = null;
        }
      });
    }
  }

  private _hasGlobalListeners = false;

  private addPerchAtCenter(): void {
    const type = PERCH_TYPES[this.addTypeIndex];
    const perches = this.perchSystem.getPerches();
    const count = perches.filter((p) => p.type === type).length + 1;
    const newPerch: Perch = {
      name: `${type}_${count}`,
      x: Math.round(this.imageSize[0] / 2),
      y: Math.round(this.imageSize[1] / 2),
      type,
    };
    perches.push(newPerch);
    const scaled = this.perchSystem.scaleToGame(newPerch);
    this.createMarker(newPerch, scaled.x, scaled.y);
  }

  private deletePerch(marker: typeof this.perchMarkers[0]): void {
    const perches = this.perchSystem.getPerches();
    const idx = perches.indexOf(marker.perch);
    if (idx >= 0) perches.splice(idx, 1);
    this.container.removeChild(marker.graphics);
    this.container.removeChild(marker.label);
    this.perchMarkers = this.perchMarkers.filter((m) => m !== marker);
  }

  private async save(): Promise<void> {
    const perches = this.perchSystem.getPerches();
    const slug = this.sceneName.replace(/_/g, '-');
    const data = {
      scene: this.sceneName,
      image_size: this.imageSize,
      perches: perches.map((p) => ({ name: p.name, x: p.x, y: p.y, type: p.type })),
    };
    const json = JSON.stringify(data, null, 2);
    try {
      await DebugSaveClient.instance.save(
        `public/assets/perch-data/${slug}-perches.json`,
        json,
      );
      console.log(`Perch data saved for ${this.sceneName}`);
    } catch (err) {
      console.error('Failed to save perch data:', err);
    }
  }
}
