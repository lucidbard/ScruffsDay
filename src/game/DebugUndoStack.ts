import { DebugSaveClient } from './DebugSaveClient';

interface UndoEntry {
  path: string;
  before: string;
  after: string;
}

const MAX_ENTRIES = 50;

export class DebugUndoStack {
  private static _instance: DebugUndoStack;
  private stack: UndoEntry[] = [];

  static get instance(): DebugUndoStack {
    if (!DebugUndoStack._instance) {
      DebugUndoStack._instance = new DebugUndoStack();
    }
    return DebugUndoStack._instance;
  }

  push(path: string, before: string, after: string): void {
    this.stack.push({ path, before, after });
    if (this.stack.length > MAX_ENTRIES) {
      this.stack.shift();
    }
  }

  /** Undo the last save. Returns the entry that was undone, or null if empty. */
  async undo(): Promise<UndoEntry | null> {
    const entry = this.stack.pop();
    if (!entry) return null;
    await DebugSaveClient.instance.save(entry.path, entry.before);
    return entry;
  }

  get length(): number {
    return this.stack.length;
  }
}
