/**
 * Ambient audio with scrub jay call detection.
 * Plays background soundscape and fires callbacks during vocal calls
 * so the character's mouth animation can sync.
 */

interface CallSegment {
  start: number;
  end: number;
}

interface CallData {
  duration: number;
  calls: CallSegment[];
}

export class AmbientAudio {
  private audio: HTMLAudioElement | null = null;
  private callData: CallData | null = null;
  private checkInterval: number | null = null;
  private inCall = false;
  private onCallStart?: () => void;
  private onCallEnd?: () => void;

  /**
   * Load ambient audio and call timing data.
   * @param audioPath Path to the audio file
   * @param callDataPath Path to the call segments JSON
   * @param onCallStart Called when a vocal call begins
   * @param onCallEnd Called when a vocal call ends
   */
  async load(
    audioPath: string,
    callDataPath: string,
    onCallStart?: () => void,
    onCallEnd?: () => void,
  ): Promise<void> {
    this.onCallStart = onCallStart;
    this.onCallEnd = onCallEnd;

    try {
      const resp = await fetch(callDataPath);
      if (resp.ok) {
        this.callData = await resp.json();
      }
    } catch {
      // No call data — audio still plays, just no mouth sync
    }

    this.audio = new Audio(audioPath);
    this.audio.loop = true;
    this.audio.volume = 0.4;
  }

  private playing = false;

  /** Start playing (call after user interaction to satisfy autoplay policy). */
  play(): void {
    if (!this.audio || this.playing) return;
    this.playing = true;
    this.audio.play().catch(() => {
      // Autoplay blocked — will start on next user interaction
    });
    this.startCallDetection();
  }

  /** Pause playback. */
  pause(): void {
    this.playing = false;
    if (this.audio) {
      this.audio.pause();
      // Reset position so the next play() starts cleanly and never overlaps
      // with a lingering tail from the outgoing scene.
      this.audio.currentTime = 0;
    }
    this.stopCallDetection();
    if (this.inCall) {
      this.inCall = false;
      this.onCallEnd?.();
    }
  }

  /** Resume playback. */
  resume(): void {
    if (!this.audio) return;
    this.playing = true;
    this.audio.play().catch(() => {});
    this.startCallDetection();
  }

  private startCallDetection(): void {
    if (!this.callData || this.checkInterval !== null) return;

    this.checkInterval = window.setInterval(() => {
      if (!this.audio || !this.callData) return;
      const t = this.audio.currentTime;

      const isInCall = this.callData.calls.some(
        (c) => t >= c.start && t <= c.end,
      );

      if (isInCall && !this.inCall) {
        this.inCall = true;
        this.onCallStart?.();
      } else if (!isInCall && this.inCall) {
        this.inCall = false;
        this.onCallEnd?.();
      }
    }, 50); // Check every 50ms
  }

  private stopCallDetection(): void {
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}
