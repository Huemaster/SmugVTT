import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import {
  getChatSoundPrefs,
  installChatAudioUnlock,
  playChatChime,
  setChatSoundPrefs,
} from '@/utils/chatChimes';

export default function ChatSoundControl() {
  const [prefs, setPrefs] = useState(getChatSoundPrefs);

  useEffect(() => {
    const onPrefs = () => setPrefs(getChatSoundPrefs());
    const uninstallUnlock = installChatAudioUnlock();
    window.addEventListener('smugvtt:chat-sound-prefs', onPrefs);
    return () => {
      window.removeEventListener('smugvtt:chat-sound-prefs', onPrefs);
      uninstallUnlock();
    };
  }, []);

  const update = (next: typeof prefs) => {
    setPrefs(next);
    setChatSoundPrefs(next);
  };

  return (
    <div className="flex items-center gap-1" title="Local chat sound">
      <button
        type="button"
        className="rounded p-1 text-ink-secondary hover:bg-ink/5 hover:text-ink"
        aria-label={prefs.enabled ? 'Mute chat chimes' : 'Enable chat chimes'}
        onClick={() => update({ ...prefs, enabled: !prefs.enabled })}
      >
        {prefs.enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={prefs.volume}
        disabled={!prefs.enabled}
        onChange={(event) => update({ ...prefs, volume: Number(event.target.value) })}
        aria-label="Chat chime volume"
        className="w-14"
      />
      <button
        type="button"
        className="rounded-cozy border border-ink/10 bg-paper px-1.5 py-1 text-[10px] font-medium text-ink-secondary hover:bg-ink/5 hover:text-ink"
        onClick={() => playChatChime('default', { force: true })}
        title="Test the local chat sound"
      >
        Test
      </button>
    </div>
  );
}
