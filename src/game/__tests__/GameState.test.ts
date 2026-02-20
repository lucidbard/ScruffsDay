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
