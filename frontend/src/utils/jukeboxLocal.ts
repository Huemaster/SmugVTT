const KEY = 'smug-jukebox-local-v1';

export interface JukeboxLocalPrefs {
  muted: boolean;
  volume: number;
}

export function getJukeboxLocalPrefs(): JukeboxLocalPrefs {
  if (typeof window === 'undefined') return { muted: false, volume: 1 };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { muted: false, volume: 1 };
    const value = JSON.parse(raw) as Partial<JukeboxLocalPrefs>;
    return {
      muted: value.muted === true,
      volume: typeof value.volume === 'number' ? Math.max(0, Math.min(1, value.volume)) : 1,
    };
  } catch {
    return { muted: false, volume: 1 };
  }
}

export function jukeboxLocalGain(prefs = getJukeboxLocalPrefs()): number {
  return prefs.muted ? 0 : prefs.volume;
}

export function setJukeboxLocalPrefs(prefs: JukeboxLocalPrefs): void {
  if (typeof window === 'undefined') return;
  const clean = { muted: prefs.muted, volume: Math.max(0, Math.min(1, prefs.volume)) };
  window.localStorage.setItem(KEY, JSON.stringify(clean));
  window.dispatchEvent(new CustomEvent('smugvtt:jukebox-local-gain', {
    detail: { gain: jukeboxLocalGain(clean) },
  }));
}
