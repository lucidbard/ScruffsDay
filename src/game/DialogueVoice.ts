/**
 * Plays a single dialogue line's voice clip. Gates advance until the clip
 * finishes, with a minimum display time so silent lines remain readable.
 * Missing files (404) resolve as "already ended" so the flow never stalls.
 */
const MIN_DISPLAY_MS = 1500;

export class DialogueVoice {
  private audio: HTMLAudioElement | null = null;
  private lineStart = 0;
  private audioEnded = true;
  private onReadyCb: (() => void) | null = null;
  private readyTimeout: number | null = null;

  /** Call when a new line is shown. Resets gate; starts playing audioPath if any. */
  play(audioPath: string | null, onCompleteNaturally?: () => void): void {
    this.stopInternal();
    this.lineStart = performance.now();
    this.audioEnded = false;

    if (!audioPath) {
      this.audioEnded = true;
      // No audio = no natural completion (don't mark as "played through")
      this.maybeFireReady();
      return;
    }

    const a = new Audio(audioPath);
    a.volume = 0.9;
    a.addEventListener('ended', () => {
      this.audioEnded = true;
      onCompleteNaturally?.();
      this.maybeFireReady();
    });
    a.addEventListener('error', () => {
      // Missing or broken wav: treat as ended so the min-display timer gates advance
      this.audioEnded = true;
      this.maybeFireReady();
    });
    a.play().catch(() => {
      this.audioEnded = true;
      this.maybeFireReady();
    });
    this.audio = a;
  }

  /** Cuts current audio (skip button). Still respects min-display timer. */
  cut(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    this.audioEnded = true;
    this.maybeFireReady();
  }

  /**
   * Returns a 0..1 progress ratio combining audio completion and min-display timer.
   * 1.0 means canAdvance() is (or will be) true.
   */
  getProgress(): number {
    if (!this.audio && this.audioEnded) {
      const elapsed = performance.now() - this.lineStart;
      return Math.min(1, elapsed / MIN_DISPLAY_MS);
    }
    if (this.audio && this.audio.duration > 0) {
      const audioRatio = Math.min(1, this.audio.currentTime / this.audio.duration);
      const timerRatio = Math.min(1, (performance.now() - this.lineStart) / MIN_DISPLAY_MS);
      return Math.min(audioRatio, timerRatio);
    }
    const elapsed = performance.now() - this.lineStart;
    return Math.min(1, elapsed / MIN_DISPLAY_MS);
  }

  /** True when the line may be advanced (audio done AND min time elapsed). */
  canAdvance(): boolean {
    return this.audioEnded && performance.now() - this.lineStart >= MIN_DISPLAY_MS;
  }

  /** Fires once when canAdvance() flips to true. Cleared on next play(). */
  onReady(cb: () => void): void {
    this.onReadyCb = cb;
    if (this.canAdvance()) this.maybeFireReady();
  }

  /** Stop playback and clear callback. Call when dialogue fully ends. */
  stop(): void {
    this.stopInternal();
    this.onReadyCb = null;
  }

  private stopInternal(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    if (this.readyTimeout !== null) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }
  }

  private maybeFireReady(): void {
    if (!this.canAdvance()) {
      // Schedule a check at the min-display boundary; track id so stop() can cancel
      const wait = MIN_DISPLAY_MS - (performance.now() - this.lineStart);
      if (wait > 0) {
        if (this.readyTimeout !== null) clearTimeout(this.readyTimeout);
        this.readyTimeout = window.setTimeout(() => {
          this.readyTimeout = null;
          this.maybeFireReady();
        }, wait);
        return;
      }
    }
    const cb = this.onReadyCb;
    this.onReadyCb = null;
    cb?.();
  }
}
