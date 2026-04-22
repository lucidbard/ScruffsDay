import type { InteractiveItem } from './InteractiveItem';
import type { ItemInspectCard } from './ItemInspectCard';
import type { Scruff } from '../characters/Scruff';
import type { GameState } from './GameState';

/**
 * Wire an item tap so tapping opens the voiced inspect card, Pick Up walks Scruff
 * over and collects, Leave dismisses. Double-tap within 400 ms skips the card.
 * Items without metadata in items.json fall through to the old immediate-collect.
 */
export function wireItemTap(
  item: InteractiveItem,
  card: ItemInspectCard,
  scruff: Scruff,
  gameState: GameState,
  isBusy: () => boolean,
  onRemove: (item: InteractiveItem) => void,
): void {
  let lastTapMs = 0;

  const doCollect = async () => {
    await scruff.moveTo(item.container.x, item.container.y + 30);
    await item.playCollect();
    gameState.addItem(item.itemId);
    await scruff.playPickup();
    onRemove(item);
  };

  item.container.on('pointertap', () => {
    if (isBusy()) return;
    if (card.isVisible()) return;
    const now = performance.now();
    const prev = lastTapMs;
    lastTapMs = now;
    if (now - prev < 400) {
      void doCollect();
      return;
    }
    const cfg = (item as unknown as { config?: { texturePath: string } }).config;
    const tex = cfg?.texturePath ?? `assets/items/${item.itemId.replace(/_/g, '-')}.png`;
    void (async () => {
      const shown = await card.show(item.itemId, tex, () => void doCollect(), () => {});
      if (!shown) await doCollect();
    })();
  });
}
