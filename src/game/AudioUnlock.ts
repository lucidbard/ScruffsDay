/**
 * iOS/Safari blocks HTMLAudioElement.play() until a user gesture. Call
 * unlock() from inside a real tap event handler (e.g. the splash-screen
 * tap) to prime the audio subsystem. Subsequent .play() calls then work
 * without gesture throughout the session.
 *
 * Also pokes the WebAudio context if available, belt-and-suspenders.
 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

let unlocked = false;

export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  try {
    const a = new Audio(SILENT_WAV);
    a.volume = 0;
    void a.play().catch(() => {});
  } catch {}
  try {
    const AC =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      const ctx = new AC();
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    }
  } catch {}
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}
