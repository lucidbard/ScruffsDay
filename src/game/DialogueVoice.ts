/**
 * Plays a single dialogue line's voice clip. Gates advance until the clip
 * finishes, with a minimum display time so silent lines remain readable.
 * Missing files (404) resolve as "already ended" so the flow never stalls.
 */
const MIN_DISPLAY_MS = 1500;
// Fallback when audio never successfully plays — generous enough that a child
// could read the bubble text at an unhurried pace.
const FALLBACK_DISPLAY_MS = 6000;

export class DialogueVoice {
  private audio: HTMLAudioElement | null = null;
  private lineStart = 0;
  private audioEnded = true;
  private endedNaturally = false;
  private hadAudioPath = false;
  private onReadyCb: (() => void) | null = null;
  private readyTimeout: number | null = null;

  /** Call when a new line is shown. Resets gate; starts playing audioPath if any. */
  play(audioPath: string | null, onCompleteNaturally?: () => void): void {
    this.stopInternal();
    this.lineStart = performance.now();
    this.audioEnded = false;
    this.endedNaturally = false;
    this.hadAudioPath = !!audioPath;
    console.debug('[DialogueVoice] play', audioPath ?? '(no-audio)');

    if (!audioPath) {
      this.audioEnded = true;
      this.maybeFireReady();
      return;
    }

    const a = new Audio(audioPath);
    a.volume = 0.9;
    a.addEventListener('ended', () => {
      console.debug('[DialogueVoice] ended naturally', audioPath);
      this.audioEnded = true;
      this.endedNaturally = true;
      onCompleteNaturally?.();
      this.maybeFireReady();
    });
    a.addEventListener('error', (e) => {
      console.warn('[DialogueVoice] audio error — fallback wait', audioPath, e);
      this.audioEnded = true;
      this.maybeFireReady();
    });
    a.play().catch((err) => {
      console.warn('[DialogueVoice] play() rejected — fallback wait', audioPath, err);
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
   * 0..1 progress toward canAdvance() being true. Matches the gate in
   * canAdvance(): either audio-completion or a fallback timer.
   */
  getProgress(): number {
    const elapsed = performance.now() - this.lineStart;
    if (!this.hadAudioPath) return Math.min(1, elapsed / MIN_DISPLAY_MS);
    if (this.endedNaturally) return Math.min(1, elapsed / MIN_DISPLAY_MS);
    if (this.audio && this.audio.duration > 0) {
      return Math.min(
        this.audio.currentTime / this.audio.duration,
        elapsed / FALLBACK_DISPLAY_MS,
      );
    }
    return Math.min(1, elapsed / FALLBACK_DISPLAY_MS);
  }

  /**
   * True when the line may be advanced by tap.
   * - If audio was supposed to play and reached its natural 'ended' event →
   *   gate is audio-done + 1.5 s min-display.
   * - If audio had a path but never ended naturally (autoplay blocked, error,
   *   play rejected) → use a generous 6 s fallback so young readers still get
   *   time to read the bubble even when audio is silently broken.
   * - If no audioPath was given at all → 1.5 s is fine.
   */
  canAdvance(): boolean {
    const elapsed = performance.now() - this.lineStart;
    if (!this.hadAudioPath) return elapsed >= MIN_DISPLAY_MS;
    if (this.endedNaturally) return elapsed >= MIN_DISPLAY_MS;
    return elapsed >= FALLBACK_DISPLAY_MS;
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
