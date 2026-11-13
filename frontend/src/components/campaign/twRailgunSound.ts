import { getChatSoundPrefs } from '@/utils/chatChimes';

let context: AudioContext | null = null;
/** Original synthesized low rail-cannon 'thoom'; obeys the existing local chat/SFX mute and volume. */
export function playTwRailgunSound(): void {
  const prefs = getChatSoundPrefs();
  if (!prefs.enabled || prefs.volume <= 0 || typeof window === 'undefined') return;
  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) return;
  context ??= new AudioContextCtor();
  const ctx = context;
  const play = () => {
    const now = ctx.currentTime + 0.015;
    const v = Math.max(0.0001, Math.min(0.22, prefs.volume * 0.20));
    for (const [frequency, duration, type, volume] of [
      [92, 0.72, 'sawtooth', 0.63],
      [57, 0.95, 'sine', 1],
      [230, 0.16, 'triangle', 0.28],
    ] as const) {
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency * 1.35, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(15, frequency * 0.55), now + duration);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, v * volume), now + 0.016);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(envelope); envelope.connect(ctx.destination);
      oscillator.start(now); oscillator.stop(now + duration + 0.03);
    }
  };
  if (ctx.state === 'running') play();
  else void ctx.resume().then(play).catch(() => undefined);
}
