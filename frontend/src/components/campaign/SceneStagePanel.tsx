// SmugVTT's fourth pillar: a live *view* of canonical IC Chat messages.
// Staging is stored inside the active, already permission-checked Canvas scene.
// There is no second chat log, chat socket, or separate stage database.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Image as ImageIcon, Plus, Save, Theater, Trash2, Users, X } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { api } from '@/services/api';
import type { SceneBoardState } from '@/types/sceneBoard';
import {
  getSceneHistory,
  subscribeSceneHistory,
  subscribeLiveSceneDialogue,
  type SceneUtterance,
} from './sceneDialogue';

interface StagePerson {
  key: string;
  name: string;
  imageUrl: string | null;
  x: number; // percentage in the stage area
  y: number;
  expression?: string;
}
interface StageState {
  version: 1;
  background: string;
  people: StagePerson[];
}
const DEFAULT_STAGE: StageState = { version: 1, background: '#1c2632', people: [] };
const bounded = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
function normaliseStage(raw: unknown): StageState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_STAGE, people: [] };
  const source = raw as Record<string, unknown>;
  const people = Array.isArray(source.people) ? source.people.slice(0, 40).flatMap((person: unknown) => {
    if (!person || typeof person !== 'object' || Array.isArray(person)) return [];
    const p = person as Record<string, unknown>;
    if (typeof p.key !== 'string' || !/^(character|npc):[^:]+$/.test(p.key)) return [];
    return [{
      key: p.key,
      name: typeof p.name === 'string' ? p.name.slice(0, 120) : 'Character',
      imageUrl: typeof p.imageUrl === 'string' ? p.imageUrl : null,
      x: bounded(typeof p.x === 'number' ? p.x : 50, 8, 92),
      y: bounded(typeof p.y === 'number' ? p.y : 62, 20, 85),
      expression: typeof p.expression === 'string' ? p.expression.slice(0, 24) : 'neutral',
    }];
  }) : [];
  return {
    version: 1,
    background: typeof source.background === 'string' && /^#[0-9a-fA-F]{6}$/.test(source.background)
      ? source.background : DEFAULT_STAGE.background,
    people,
  };
}
export function sceneStateFromBoard(boardState: unknown): StageState {
  if (!boardState || typeof boardState !== 'object' || Array.isArray(boardState)) return normaliseStage(null);
  return normaliseStage((boardState as Record<string, unknown>).smugSceneStage);
}

/** Same component instance is portaled between left/right/full workspace, never remounted. */
export default function SceneStagePanel() {
  const { campaign, userRole } = useCampaign();
  const campaignId = campaign?.id ?? '';
  const gm = userRole === 'DM';
  const stageArea = useRef<HTMLDivElement>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [sceneTitle, setSceneTitle] = useState('Scene');
  const [sceneShared, setSceneShared] = useState(false);
  const [stage, setStage] = useState<StageState>(DEFAULT_STAGE);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const queuedSave = useRef<StageState | null>(null);
  const dragging = useRef<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [npcOptions, setNpcOptions] = useState<Array<{ key: string; name: string; imageUrl: string | null }>>([]);
  const [addKey, setAddKey] = useState('');
  const [lastSpeaker, setLastSpeaker] = useState<string | null>(null);
  const [clearAt, setClearAt] = useState(0);
  const [sceneStartedAt, setSceneStartedAt] = useState(0);
  useEffect(() => { setClearAt(0); setLastSpeaker(null); }, [sceneId]);
  const [showStageDialogues, setShowStageDialogues] = useState(() => {
    try { return window.localStorage.getItem('smugvtt:scene-dialogue') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('smugvtt:scene-dialogue', String(showStageDialogues)); } catch { /* optional preference */ }
  }, [showStageDialogues]);
  const [showSpeakerFocus, setShowSpeakerFocus] = useState(() => {
    try { return window.localStorage.getItem('smugvtt:scene-speaker-focus') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('smugvtt:scene-speaker-focus', String(showSpeakerFocus)); } catch { /* optional preference */ }
  }, [showSpeakerFocus]);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [editParticipants, setEditParticipants] = useState(false);
  const subscribe = useCallback((notify: () => void) => subscribeSceneHistory(campaignId, notify), [campaignId]);
  const snapshot = useCallback(() => getSceneHistory(campaignId), [campaignId]);
  const dialogue = useSyncExternalStore(subscribe, snapshot, () => getSceneHistory(''));

  const cast = useMemo(() => [
    ...(campaign?.characters ?? []).map((c) => ({ key: `character:${c.id}`, name: c.name, imageUrl: c.tokenImageUrl ?? null })),
    ...npcOptions,
  ], [campaign?.characters, npcOptions]);
  const latest = useMemo(() => {
    const result = new Map<string, SceneUtterance>();
    if (showStageDialogues && sceneId) for (const entry of dialogue) {
      if (Date.parse(entry.createdAt) >= Math.max(sceneStartedAt, clearAt)) result.set(entry.speakerKey, entry);
    }
    return result;
  }, [dialogue, showStageDialogues, sceneId, sceneStartedAt, clearAt]);

  const load = useCallback(async () => {
    if (!campaignId || busyRef.current || dragging.current) return;
    try {
      const result = await api.getActiveSceneBoard(campaignId);
      const active = result.scene;
      setSceneId(active?.id ?? null);
      setSceneStartedAt(active ? Date.parse(active.startedAt ?? active.createdAt) || 0 : 0);
      setSceneTitle(active?.title ?? 'No active scene');
      setSceneShared(!!active?.revealed && active.boardVisibility === 'shared');
      if (active) setStage((prev) => {
        const next = sceneStateFromBoard(active.boardState);
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
    } catch { setMessage('Could not load shared scene.'); }
  }, [campaignId]);
  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 4500);
    return () => window.clearInterval(interval);
  }, [load]);
  useEffect(() => {
    if (!gm || !campaignId) return;
    let alive = true;
    void api.listCampaignNpcs(campaignId).then((result) => {
      if (alive) setNpcOptions(result.npcs.map((npc) => ({ key: `npc:${npc.id}`, name: npc.name, imageUrl: npc.imageUrl ?? null })));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [gm, campaignId]);
  useEffect(() => subscribeLiveSceneDialogue(campaignId, (utterance) => {
    setLastSpeaker(utterance.speakerKey);
  }), [campaignId]);

  const persist = async (next: StageState) => {
    if (!gm || !sceneId) return;
    if (busyRef.current) { queuedSave.current = next; return; }
    busyRef.current = true;
    setBusy(true); setMessage(null);
    try {
      // Fetch latest Canvas content immediately before saving staging. This avoids
      // overwriting unrelated edits made before our own request (not fully atomic).
      const fresh = await api.getActiveSceneBoard(campaignId);
      if (!fresh.scene || fresh.scene.id !== sceneId) throw new Error('Active scene changed; retry on the new scene.');
      const raw = fresh.scene.boardState;
      const boardState = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw as unknown as Record<string, unknown> : {};
      const updated = { ...boardState, smugSceneStage: next } as unknown as SceneBoardState;
      const saved = await api.updateSceneBoard(campaignId, sceneId, { boardState: updated });
      // Do not claim persistence if an older server silently strips extra JSON.
      const savedState = sceneStateFromBoard(saved.scene.boardState);
      if (JSON.stringify(savedState) !== JSON.stringify(next)) throw new Error('Server did not preserve the Scene Stage data.');
      if (!queuedSave.current) setStage(savedState);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save Scene Stage.');
    } finally {
      busyRef.current = false; setBusy(false);
      if (queuedSave.current) {
        const queued = queuedSave.current; queuedSave.current = null;
        void persist(queued);
      } else { void load(); }
    }
  };
  const change = (next: StageState) => {
    stageRef.current = next; setStage(next);
    void persist(next);
  };
  const create = async () => {
    if (!gm || !campaignId || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      await api.createSceneBoard(campaignId, { title: 'Scene Stage', active: true, revealed: true, boardVisibility: 'shared' });
      setMessage(null);
    } catch { setMessage('Could not create a shared scene.'); }
    finally { busyRef.current = false; setBusy(false); await load(); }
  };
  const reveal = async () => {
    if (!gm || !sceneId) return;
    setBusy(true);
    try {
      await api.updateSceneBoard(campaignId, sceneId, { revealed: true, boardVisibility: 'shared' });
      setMessage(null);
    } catch { setMessage('Unable to share scene.'); }
    finally { setBusy(false); await load(); }
  };
  const endScene = async () => {
    if (!gm || !sceneId || busyRef.current) return;
    if (!window.confirm(`End ${sceneTitle}? Its Canvas and staging will be preserved in the scene archive.`)) return;
    busyRef.current = true; setBusy(true);
    try {
      await api.updateSceneBoard(campaignId, sceneId, { active: false });
      setMessage(null);
    } catch { setMessage('Unable to end scene.'); }
    finally { busyRef.current = false; setBusy(false); await load(); }
  };
  const addPerson = () => {
    const option = cast.find((c) => c.key === addKey);
    if (!option || stage.people.some((p) => p.key === option.key)) return;
    const offset = stage.people.length % 5;
    change({ ...stage, people: [...stage.people, { ...option, x: 20 + offset * 15, y: 60, expression: 'neutral' }] });
    setAddKey('');
  };
  const moveOnPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const key = dragging.current;
    const rect = stageArea.current?.getBoundingClientRect();
    if (!gm || !key || !rect?.width || !rect.height) return;
    const x = bounded(((event.clientX - rect.left) / rect.width) * 100, 8, 92);
    const y = bounded(((event.clientY - rect.top) / rect.height) * 100, 20, 86);
    const next = { ...stageRef.current, people: stageRef.current.people.map((p) => p.key === key ? { ...p, x, y } : p) };
    stageRef.current = next; setStage(next);
  };
  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    void persist(stageRef.current);
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-paper/85" aria-label="Scene Stage">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-ink/10 p-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Theater className="h-4 w-4 shrink-0 text-brand-ink" />
          <span className="truncate text-sm font-semibold">{sceneTitle}</span>
          <span className="text-[10px] text-ink-muted">Scene</span>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-[10px]">
          <button type="button" className="rounded border px-1.5 py-1" aria-pressed={showStageDialogues}
            title="Toggle quoted dialogue bubbles on this device" onClick={() => setShowStageDialogues((v) => !v)}>
            {showStageDialogues ? 'Bubbles ✓' : 'Bubbles'}
          </button>
          <button type="button" className="rounded border px-1.5 py-1" aria-pressed={showSpeakerFocus}
            title="Toggle speaker highlighting on this device" onClick={() => setShowSpeakerFocus((v) => !v)}>
            {showSpeakerFocus ? 'Focus ✓' : 'Focus'}
          </button>
        </div>
        {gm && <div className="flex gap-1 text-xs">
          {!sceneId ? <button onClick={() => void create()} disabled={busy} className="rounded-cozy bg-accent px-2 py-1 text-accent-text">Start Scene</button>
            : !sceneShared ? <button onClick={() => void reveal()} disabled={busy} title="Makes the Canvas scene visible to players too" className="rounded-cozy border px-2 py-1">Share Scene</button>
              : <span className="text-ink-muted">Shared</span>}
          {!!sceneId && <button type="button" disabled={busy} onClick={() => void endScene()}
            className="rounded-cozy border border-ink/20 px-2 py-1" title="Archive this scene without deleting it">End</button>}
          {busy && <Save className="h-3.5 w-3.5 animate-pulse" aria-label="Saving" />}
        </div>}
      </header>
      {message && <p role="alert" className="bg-warm-amber/15 p-2 text-xs text-ink-secondary">{message}</p>}
      {gm && sceneId && <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-ink/10 px-2 py-1.5 text-xs">
        <button type="button" aria-pressed={editParticipants} onClick={() => setEditParticipants((value) => !value)}
          className={`rounded border px-2 py-1 ${editParticipants ? 'bg-warning/20/30' : ''}`}>
          {editParticipants ? 'Done editing' : 'Edit cast'}
        </button>
        <label className="sr-only" htmlFor="scene-stage-add">Add a scene participant</label>
        <select id="scene-stage-add" className="min-w-0 flex-1 rounded border bg-paper p-1" value={addKey} onChange={(event) => setAddKey(event.target.value)}>
          <option value="">Add participant…</option>
          {cast.filter((c) => !stage.people.some((p) => p.key === c.key)).map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
        </select>
        <button aria-label="Add participant" disabled={!addKey || busy} onClick={addPerson} className="rounded border p-1"><Plus className="h-4 w-4"/></button>
        <label className="flex items-center gap-1 text-ink-muted">BG <input type="color" aria-label="Scene background color" value={stage.background} onChange={(event) => change({ ...stage, background: event.target.value })} className="h-6 w-7" /></label>
        <button className="rounded border p-1" title="Clear visible dialogue bubbles without deleting chat messages" aria-label="Clear Scene bubbles" onClick={() => setClearAt(Date.now())}><X className="h-4 w-4"/></button>

      </div>}
      {gm && editParticipants && stage.people.length > 0 && <div className="flex max-h-24 shrink-0 flex-wrap gap-1 overflow-y-auto border-b border-ink/10 px-2 py-1" aria-label="Scene Director cast controls">
        {stage.people.map((person) => <button key={person.key} type="button" disabled={busy}
          title={`Remove ${person.name} from Scene`} onClick={() => change({ ...stage, people: stage.people.filter((p) => p.key !== person.key) })}
          className="flex items-center gap-1 rounded border border-danger/30 px-2 py-1 text-[11px]">
          <Trash2 className="h-3 w-3 text-danger-ink" /> Remove {person.name}
        </button>)}
      </div>}
      <div ref={stageArea} className="relative min-h-[160px] flex-1 overflow-hidden" style={{ backgroundColor: stage.background }}
        onPointerMove={moveOnPointer} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
        {!stage.people.length && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-white/70">
          <Users className="h-8 w-8" />{gm ? 'Add characters to stage them here.' : 'No characters are staged yet.'}
        </div>}
        {stage.people.map((person) => {
          const speech = latest.get(person.key);
          const active = showSpeakerFocus && lastSpeaker === person.key;
          return <div key={person.key} className="absolute flex w-[min(38%,180px)] flex-col items-center" style={{ left: `${person.x}%`, top: `${person.y}%`, transform: 'translate(-50%, -50%)', zIndex: active ? 3 : 2 }}>
            {speech && <div className="relative mb-3 w-max max-w-[min(18rem,90vw)]" style={{ width: 'max-content' }}>
              <button type="button" title="Expand or collapse this dialogue" aria-expanded={expandedMessageId === speech.messageId}
                onClick={() => setExpandedMessageId(expandedMessageId === speech.messageId ? null : speech.messageId)}
                className={`block max-h-32 w-full overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-white/40 bg-white/95 px-2.5 py-1.5 text-center text-[11px] text-ink shadow-md ${active ? 'ring-2 ring-warning' : ''}`}>
                {expandedMessageId === speech.messageId ? speech.quotes.map((q) => `“${q}”`).join(' ') : `“${speech.quotes[speech.quotes.length - 1]?.slice(0, 100)}${(speech.quotes[speech.quotes.length - 1]?.length ?? 0) > 100 ? '…' : ''}”`}
              </button>
              <span aria-hidden="true" className="pointer-events-none absolute -bottom-[6px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-white/40 bg-white/95" />
            </div>}
            <div className={`relative flex h-20 w-20 max-w-full items-center justify-center overflow-hidden rounded-xl border border-white/30 bg-ink/90 shadow-lg ${active ? 'ring-2 ring-warning' : ''}`}
              title={gm ? `Drag ${person.name} to arrange the scene` : person.name}
              onPointerDown={(event) => {
                if (!gm || event.button !== 0) return;
                event.stopPropagation(); dragging.current = person.key;
                stageArea.current?.setPointerCapture(event.pointerId);
              }}>
              {person.imageUrl ? <img src={person.imageUrl} alt="" draggable={false} className="h-full w-full object-cover" /> : <ImageIcon aria-hidden="true" className="h-8 w-8 text-white/60" />}
            </div>
            <div className="mt-1 max-w-full rounded bg-black/65 px-1.5 text-center text-xs font-semibold text-white"><span className="block truncate">{person.name}</span></div>

          </div>;
        })}
      </div>
      <footer className="shrink-0 border-t border-ink/10 px-2 py-1.5 text-[11px] text-ink-muted">
        Dialogue comes from quoted IC Chat text. Stage layout is saved with the active Canvas scene.
      </footer>
    </section>
  );
}
