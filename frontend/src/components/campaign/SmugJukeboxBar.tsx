import { useEffect, useMemo, useState } from 'react';
import { Music, Volume2, VolumeX } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useAuth } from '@/contexts/AuthContext';
import { listEveryAsset } from '@/services/assetPages';
import { settableAudioAssets } from '@/utils/audioAssets';
import { getJukeboxLocalPrefs, setJukeboxLocalPrefs } from '@/utils/jukeboxLocal';

export default function SmugJukeboxBar() {
  const { campaign, activeAtmosphereAudio } = useCampaign();
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(getJukeboxLocalPrefs);
  const [trackName, setTrackName] = useState('Audio Track');

  useEffect(() => {
    if (!activeAtmosphereAudio?.assetId || !campaign) {
      setTrackName('Audio Track');
      return;
    }
    let cancelled = false;
    listEveryAsset({ type: 'AUDIO' })
      .then((assets) => {
        if (cancelled) return;
        const available = settableAudioAssets(assets, user?.id, campaign.id);
        setTrackName(available.find((asset) => asset.id === activeAtmosphereAudio.assetId)?.name ?? 'Audio Track');
      })
      .catch(() => {
        if (!cancelled) setTrackName('Audio Track');
      });
    return () => { cancelled = true; };
  }, [activeAtmosphereAudio?.assetId, campaign, user?.id]);

  const localPercent = useMemo(() => Math.round(prefs.volume * 100), [prefs.volume]);
  if (!activeAtmosphereAudio) return null;

  const update = (next: typeof prefs) => {
    setPrefs(next);
    setJukeboxLocalPrefs(next);
  };

  return (
    <div className="fixed bottom-3 left-1/2 z-[1150] flex max-w-[min(92vw,32rem)] -translate-x-1/2 items-center gap-2 rounded-cozy border border-ink/15 bg-paper/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <Music className="h-4 w-4 shrink-0 text-brand-ink" aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-ink-muted">Now Playing</div>
        <div className="max-w-48 truncate text-sm font-medium text-ink">{trackName}</div>
      </div>
      <button
        type="button"
        className="ml-1 rounded p-1 text-ink-secondary hover:bg-ink/5 hover:text-ink"
        aria-label={prefs.muted ? 'Unmute jukebox locally' : 'Mute jukebox locally'}
        onClick={() => update({ ...prefs, muted: !prefs.muted })}
      >
        {prefs.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={prefs.volume}
        disabled={prefs.muted}
        onChange={(event) => update({ ...prefs, volume: Number(event.target.value) })}
        aria-label={`Local jukebox volume ${localPercent}%`}
        className="w-20"
      />
    </div>
  );
}
