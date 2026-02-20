import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { GameState, ItemId } from './GameState';
import type { TweenManager } from './Tween';

const SLOT_SIZE = 64;
const SLOT_PADDING = 8;
const MAX_SLOTS = 6;
const TRAY_PADDING = 12;

export const ITEM_NAMES: Record<ItemId, string> = {
  saw_palmetto_fronds: 'Palmetto Fronds',
  scrub_hickory_nuts: 'Hickory Nuts',
  sand_pine_cones: 'Pine Cones',
  florida_rosemary_cuttings: 'Rosemary Cuttings',
  rusty_lyonia_flowers: 'Lyonia Flowers',
  chapman_oak_acorns: 'Oak Acorns',
  flicker_feather: 'Flicker Feather',
  pip_map: "Pip's Map",
};

// Colors
const COLOR_BG = 0xFFF8DC;
const COLOR_BORDER = 0x3E2723;
const COLOR_SLOT_BORDER = 0xD2B48C;
const COLOR_SELECTED_BG = 0xFFD700;
const COLOR_SELECTED_BORDER = 0x4169E1;
const COLOR_PLACEHOLDER = 0x8FBC8F;

type SelectionCallback = (item: ItemId | null) => void;

interface SlotEntry {
  container: Container;
  bg: Graphics;
  content: Sprite | Graphics | null;
  itemId: ItemId | null;
}

export class InventoryUI {
  readonly container = new Container();
  private bg = new Graphics();
  private slots: SlotEntry[] = [];
  private selectedItem: ItemId | null = null;
  private selectCallbacks: SelectionCallback[] = [];

  constructor(
    private gameState: GameState,
    private tweens: TweenManager,
    private itemTextures: Map<ItemId, Texture>
  ) {
    this.container.addChild(this.bg);
    this.buildSlots();
    this.drawBackground();
    this.refresh();
  }

  private buildSlots(): void {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const slotContainer = new Container();
      const bg = new Graphics();
      slotContainer.addChild(bg);

      const x = TRAY_PADDING + i * (SLOT_SIZE + SLOT_PADDING);
      const y = TRAY_PADDING;
      slotContainer.position.set(x, y);

      slotContainer.eventMode = 'static';
      slotContainer.cursor = 'pointer';

      const slotIndex = i;
      slotContainer.on('pointertap', () => {
        this.onSlotTap(slotIndex);
      });

      this.container.addChild(slotContainer);
      this.slots.push({ container: slotContainer, bg, content: null, itemId: null });
      this.drawSlotBg(i, false);
    }
  }

  private drawBackground(): void {
    const trayWidth =
      TRAY_PADDING * 2 + MAX_SLOTS * SLOT_SIZE + (MAX_SLOTS - 1) * SLOT_PADDING;
    const trayHeight = TRAY_PADDING * 2 + SLOT_SIZE;

    this.bg.clear();
    this.bg.roundRect(0, 0, trayWidth, trayHeight, 12);
    this.bg.fill({ color: COLOR_BG });
    this.bg.stroke({ width: 3, color: COLOR_BORDER });
  }

  private drawSlotBg(index: number, selected: boolean): void {
    const slot = this.slots[index];
    slot.bg.clear();
    slot.bg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 8);

    if (selected) {
      slot.bg.fill({ color: COLOR_SELECTED_BG, alpha: 0.5 });
      slot.bg.stroke({ width: 2, color: COLOR_SELECTED_BORDER });
    } else {
      slot.bg.fill({ color: 0xFFFFFF, alpha: 0.5 });
      slot.bg.stroke({ width: 2, color: COLOR_SLOT_BORDER });
    }
  }

  private onSlotTap(index: number): void {
    const slot = this.slots[index];
    if (!slot.itemId) return;

    if (this.selectedItem === slot.itemId) {
      // Deselect
      this.selectedItem = null;
    } else {
      // Select new item
      this.selectedItem = slot.itemId;
    }

    this.updateSlotHighlights();
    this.fireSelectCallbacks();
  }

  private updateSlotHighlights(): void {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const slot = this.slots[i];
      const isSelected = slot.itemId !== null && slot.itemId === this.selectedItem;
      this.drawSlotBg(i, isSelected);
    }
  }

  private fireSelectCallbacks(): void {
    for (const cb of this.selectCallbacks) {
      cb(this.selectedItem);
    }
  }

  refresh(): void {
    const items = this.gameState.getInventory();

    for (let i = 0; i < MAX_SLOTS; i++) {
      const slot = this.slots[i];

      // Remove old content
      if (slot.content) {
        slot.container.removeChild(slot.content);
        slot.content.destroy();
        slot.content = null;
      }
      slot.itemId = null;

      if (i < items.length) {
        const itemId = items[i];
        slot.itemId = itemId;

        const texture = this.itemTextures.get(itemId);
        if (texture) {
          const sprite = new Sprite(texture);
          sprite.width = SLOT_SIZE - 16;
          sprite.height = SLOT_SIZE - 16;
          sprite.position.set(8, 8);
          slot.container.addChild(sprite);
          slot.content = sprite;
        } else {
          // Placeholder colored circle
          const circle = new Graphics();
          circle.circle(SLOT_SIZE / 2, SLOT_SIZE / 2, (SLOT_SIZE - 16) / 2);
          circle.fill({ color: COLOR_PLACEHOLDER });
          slot.container.addChild(circle);
          slot.content = circle;
        }
      }
    }

    // If selected item is no longer in inventory, clear selection
    if (this.selectedItem && !this.gameState.hasItem(this.selectedItem)) {
      this.selectedItem = null;
      this.fireSelectCallbacks();
    }

    this.updateSlotHighlights();
  }

  layout(gameWidth: number, gameHeight: number): void {
    const trayWidth =
      TRAY_PADDING * 2 + MAX_SLOTS * SLOT_SIZE + (MAX_SLOTS - 1) * SLOT_PADDING;
    const trayHeight = TRAY_PADDING * 2 + SLOT_SIZE;

    this.container.position.set(
      (gameWidth - trayWidth) / 2,
      gameHeight - trayHeight - 16
    );
  }

  onSelect(callback: SelectionCallback): void {
    this.selectCallbacks.push(callback);
  }

  getSelectedItem(): ItemId | null {
    return this.selectedItem;
  }

  clearSelection(): void {
    if (this.selectedItem !== null) {
      this.selectedItem = null;
      this.updateSlotHighlights();
      this.fireSelectCallbacks();
    }
  }
}
