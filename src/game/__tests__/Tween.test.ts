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
