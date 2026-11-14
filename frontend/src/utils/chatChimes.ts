export type ChatChimeId = 'default' | 'bell' | 'soft' | 'spark' | 'wood';

export const CHAT_CHIME_OPTIONS: Array<{ id: ChatChimeId; label: string }> = [
  { id: 'default', label: 'Default' },
  { id: 'bell', label: 'Bell' },
  { id: 'soft', label: 'Soft' },
  { id: 'spark', label: 'Spark' },
  { id: 'wood', label: 'Wood' },
];

const PREF_KEY = 'smug-chat-sound-v1';
let audioContext: AudioContext | null = null;
let unlockInstalled = false;

export interface ChatSoundPrefs {
  enabled: boolean;
  volume: number;
}

export function getChatSoundPrefs(): ChatSoundPrefs {
  if (typeof window === 'undefined') return { enabled: true, volume: 0.35 };
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    if (!raw) return { enabled: true, volume: 0.35 };
    const value = JSON.parse(raw) as Partial<ChatSoundPrefs>;
    return {
      enabled: value.enabled !== false,
      volume: typeof value.volume === 'number' ? Math.max(0, Math.min(1, value.volume)) : 0.35,
    };
  } catch {
    return { enabled: true, volume: 0.35 };
  }
}

export function setChatSoundPrefs(next: ChatSoundPrefs): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PREF_KEY, JSON.stringify({
    enabled: next.enabled,
    volume: Math.max(0, Math.min(1, next.volume)),
  }));
  window.dispatchEvent(new CustomEvent('smugvtt:chat-sound-prefs', { detail: next }));
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  audioContext ??= new AudioContextCtor();
  return audioContext;
}

/**
 * Browsers may refuse Web Audio until the page receives a user gesture.
 * ChatPanel is always mounted at the table, so installing this once means the
 * first click/tap/key press primes the shared chat-audio context for later
 * server-driven message events.
 */
export function installChatAudioUnlock(): () => void {
  if (typeof window === 'undefined' || unlockInstalled) return () => {};
  unlockInstalled = true;

  const unlock = () => {
    const ctx = getContext();
    if (!ctx) return;
    void ctx.resume().catch(() => undefined);
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('touchstart', unlock);
    window.removeEventListener('keydown', unlock);
    unlockInstalled = false;
  };
}

function tone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function renderChime(ctx: AudioContext, id: unknown, volume: number): void {
  const now = ctx.currentTime + 0.015;
  const chime: ChatChimeId =
    id === 'bell' || id === 'soft' || id === 'spark' || id === 'wood' ? id : 'default';

  if (chime === 'bell') {
    tone(ctx, 880, now, 0.28, volume);
    tone(ctx, 1320, now + 0.045, 0.24, volume * 0.72);
  } else if (chime === 'soft') {
    tone(ctx, 440, now, 0.2, volume * 0.72, 'sine');
    tone(ctx, 554, now + 0.05, 0.2, volume * 0.58, 'sine');
  } else if (chime === 'spark') {
    tone(ctx, 784, now, 0.12, volume * 0.75, 'triangle');
    tone(ctx, 1047, now + 0.07, 0.13, volume * 0.8, 'triangle');
    tone(ctx, 1568, now + 0.13, 0.12, volume * 0.55, 'triangle');
  } else if (chime === 'wood') {
    tone(ctx, 260, now, 0.09, volume, 'square');
    tone(ctx, 190, now + 0.075, 0.08, volume * 0.65, 'square');
  } else {
    tone(ctx, 660, now, 0.18, volume, 'sine');
    tone(ctx, 880, now + 0.055, 0.16, volume * 0.7, 'sine');
  }
}

export function playChatChime(id: unknown = 'default', options?: { force?: boolean }): void {
  const prefs = getChatSoundPrefs();
  if (!options?.force && (!prefs.enabled || prefs.volume <= 0)) return;

  const ctx = getContext();
  if (!ctx) return;

  const volume = (options?.force ? Math.max(prefs.volume, 0.25) : prefs.volume) * 0.16;
  const play = () => renderChime(ctx, id, volume);

  if (ctx.state === 'running') {
    play();
    return;
  }

  // Do not schedule oscillators into a suspended context and hope the browser
  // later starts them. Resume first, then synthesize the chime.
  void ctx.resume()
    .then(play)
    .catch(() => undefined);
}

export function chatChimeFromMetadata(metadata: unknown): ChatChimeId {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 'default';
  const speaker = (metadata as Record<string, unknown>).speaker;
  if (!speaker || typeof speaker !== 'object' || Array.isArray(speaker)) return 'default';
  const chime = (speaker as Record<string, unknown>).chatChime;
  return chime === 'bell' || chime === 'soft' || chime === 'spark' || chime === 'wood' ? chime : 'default';
}

export function chatChimeFromCharacterData(data: unknown): ChatChimeId {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'default';
  const chime = (data as Record<string, unknown>).chatChime;
  return chime === 'bell' || chime === 'soft' || chime === 'spark' || chime === 'wood' ? chime : 'default';
}
