export class DebugSaveClient {
  private static _instance: DebugSaveClient;

  static get instance(): DebugSaveClient {
    if (!DebugSaveClient._instance) {
      DebugSaveClient._instance = new DebugSaveClient();
    }
    return DebugSaveClient._instance;
  }

  async save(relativePath: string, content: string): Promise<void> {
    const res = await fetch('/__debug/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: relativePath, content }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Debug save failed: ${err.error}`);
    }
  }
}
