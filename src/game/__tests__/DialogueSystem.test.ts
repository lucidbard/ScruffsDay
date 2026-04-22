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
    expect(line).toEqual({
      speaker: 'Shelly',
      text: 'Line one',
      audioPath: 'assets/sounds/dialogue/test_convo__00.wav',
    });
  });

  it('advances through lines', () => {
    runner.start('test_convo');
    expect(runner.next()).toEqual({
      speaker: 'Shelly',
      text: 'Line two',
      audioPath: 'assets/sounds/dialogue/test_convo__01.wav',
    });
    expect(runner.next()).toEqual({
      speaker: 'Shelly',
      text: 'Line three',
      audioPath: 'assets/sounds/dialogue/test_convo__02.wav',
    });
  });

  it('returns null when conversation ends', () => {
    runner.start('test_convo');
    runner.next();
    runner.next();
    expect(runner.next()).toBeNull();
  });

  it('skips lines whose condition is not met', () => {
    const line = runner.start('conditional_convo');
    expect(line).toEqual({
      speaker: 'Pip',
      text: 'Before help',
      audioPath: 'assets/sounds/dialogue/conditional_convo__00.wav',
    });
    expect(runner.next()).toBeNull();
  });

  it('shows conditional lines when flag is set', () => {
    flags.add('shelly_helped');
    runner.start('conditional_convo');
    const line2 = runner.next();
    expect(line2).toEqual({
      speaker: 'Pip',
      text: 'After help too',
      audioPath: 'assets/sounds/dialogue/conditional_convo__01.wav',
    });
  });

  it('reports whether conversation is active', () => {
    expect(runner.isActive()).toBe(false);
    runner.start('test_convo');
    expect(runner.isActive()).toBe(true);
    runner.next();
    runner.next();
    runner.next();
    expect(runner.isActive()).toBe(false);
  });
});
