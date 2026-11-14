function newFodderClientId(): string { return `fodder-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

import { useEffect, useMemo, useState } from 'react';
import { Shield, Swords, X } from 'lucide-react';
import { api } from '@/services/api';
import { useGameStore, useTokenList } from '@/stores/gameStore';
import type { Token, CharacterData } from '@/types';
import type { SquadCommandCharacterData } from '@/types/game-systems/squadCommand';
import { useToast } from '@/contexts/ToastContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { MessageType } from '@/types';
import {
  normalizeSquadCommandData,
  EMPTY_BATTLE_STATE,
  startBattle,
  startActivation,
  refreshUnit,
  useRally as performRally,
  endBattle,
} from '@/components/character-sheets/squadCommand/battleState';
import {
  gmAdjust,
  reloadWeapon,
  armOverwatch,
  cancelOverwatch,
  nextActionMode,
  weaponUnavailableReason,
  resolveWeaponAction,
  activateAbility,
  abilityUnavailableReason,
  isSquadSpecialAbility,
  formatCombatResult,
  setBattlefieldState,
} from '@/components/character-sheets/squadCommand/combatEngine';
import { isSheetlessSquadFodder, readSheetlessSquadFodder, snapshotForToken, tokenHpFor } from './squadSheetlessFodder';
import { effectsForToken } from './map/zoneMechanics';
import type { Drawing } from '@/types/drawings';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed; no change was confirmed';
}

/**
 * Sheetless Squad Command combat HUD. All state persists in the map token.
 * Mounted by Squad Command Units so no Character / Journal record is ever created.
 * GM permission is enforced by the backend token update route.
 */
export default function SquadSheetlessFodderHUD({ token, campaignId, mapId, onClose, zones, gridSize, mapHeight }: {
  token: Token;
  campaignId: string;
  mapId: string;
  onClose: () => void;
  zones: readonly Drawing[];
  gridSize: number;
  mapHeight: number;
}) {
  const { showToast } = useToast();
  const { socket } = useWebSocket();
  const tokens = useTokenList();
  const [busy, setBusy] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [distance, setDistance] = useState(3);
  const [lastResult, setLastResult] = useState('');
  const [notice, setNotice] = useState('');
  const data = useMemo(() => readSheetlessSquadFodder(token), [token]);
  const validTargets = tokens.filter((candidate) => candidate.id !== token.id && candidate.visible);

  useEffect(() => { setTargetId(''); setNotice(''); setLastResult(''); }, [token.id, mapId]);
  if (!data || !isSheetlessSquadFodder(token)) return null;

  const stats = data.stats;
  const field = data.battle?.battlefield;
  // Use the current spatial geometry at action time, not a stale field saved
  // onto the unit. Hiding an overlay does not disable the cover underneath.
  const activeZones = zones.filter(z => !!z.zoneType);
  const zoneCover = activeZones.some(z => z.zoneType === 'light-cover' || z.zoneType === 'heavy-cover');
  const zoneObscuration = activeZones.some(z => z.zoneType === 'smoke' || z.zoneType === 'obscured');
  const zoneElevation = activeZones.some(z => z.zoneType === 'high-ground' || z.zoneType === 'low-ground');
  const zoneDriven = zoneCover || zoneObscuration || zoneElevation;
  const atSource = effectsForToken(activeZones, token, gridSize, mapHeight);
  const makeBattlefield = (base: SquadCommandCharacterData, state: typeof atSource): SquadCommandCharacterData => {
    const original = base.battle?.battlefield ?? EMPTY_BATTLE_STATE.battlefield;
    return {
      ...base,
      battle: { ...(base.battle ?? EMPTY_BATTLE_STATE), battlefield: {
        ...original,
        cover: zoneCover ? state.cover : original.cover,
        obscured: zoneObscuration ? state.obscured : original.obscured,
        highGround: zoneElevation ? (state.highGround && !state.lowGround) : original.highGround,
      } },
    };
  };

  // Existing map API updates metadata under a map lock and broadcasts to all
  // campaign viewers. Keep snapshots small enough for its 8 KB safety limit.
  const saveTokenData = async (currentToken: Token, nextData: SquadCommandCharacterData) => {
    const clean = normalizeSquadCommandData({ ...nextData, isPlayerCharacter: false });
    const metadata = snapshotForToken(clean, currentToken.metadata ?? {});
    const update = await api.updateToken(campaignId, mapId, currentToken.id, {
      metadata,
      hp: tokenHpFor(clean),
    });
    if (!update.token) throw new Error('The map server did not return the updated token.');
    useGameStore.getState().patchToken(currentToken.id, update.token, mapId);
    return update.token;
  };

  const change = async (run: (current: SquadCommandCharacterData) => SquadCommandCharacterData) => {
    if (busy || !data) return;
    setBusy(true); setNotice('');
    try { await saveTokenData(token, run(data)); }
    catch (error) { setNotice(messageOf(error)); }
    finally { setBusy(false); }
  };

  const announce = async (title: string, text: string) => {
    if (!socket) return;
    try {
      const answer = await socket.sendChatMessage({
        content: `***${title}***\n${text}`,
        type: MessageType.DM,
        clientId: newFodderClientId(),
        speakerType: 'self',
        mode: 'ooc',
      });
      if (!answer.ok) showToast(answer.error || 'Combat result could not be posted to Chat', 'error');
    } catch { showToast('Combat result could not be posted to Chat', 'error'); }
  };

  const fireWeapon = async (weaponId: string) => {
    if (busy || !data) return;
    const target = validTargets.find((entry) => entry.id === targetId);
    if (!target) { setNotice('Select a target token first.'); return; }
    setBusy(true); setNotice(''); setLastResult('');
    try {
      const targetCharacterId = target.characterId;
      const isTokenTarget = isSheetlessSquadFodder(target);
      const targetSheet = !isTokenTarget && targetCharacterId ? await api.getCharacter(targetCharacterId) : null;
      const targetData = isTokenTarget
        ? readSheetlessSquadFodder(target)
        : targetSheet?.character.gameSystem === 'SQUAD_COMMAND'
          ? normalizeSquadCommandData(targetSheet.character.data as SquadCommandCharacterData)
          : null;
      if (!targetData) throw new Error('The selected token does not have a Squad Command combat profile.');
      const actionMode = nextActionMode(data);
      if (!actionMode) throw new Error('No remaining action. Start an activation or refresh the unit.');
      // CP is still campaign-scoped and tracked by the GM's turn system, not
      // a token snapshot. Never silently spend or create shared Command Points.
      if (actionMode === 'push' && !window.confirm('This Push action requires one available shared Command Point. Confirm you have recorded its expenditure.')) return;
      const atTarget = effectsForToken(activeZones, target, gridSize, mapHeight);
      const effectiveSource = zoneDriven ? makeBattlefield(data, atSource) : data;
      const effectiveTarget = zoneDriven ? makeBattlefield(targetData, atTarget) : targetData;
      const result = resolveWeaponAction(effectiveSource, effectiveTarget, weaponId, {
        distance, actionMode,
        ...(zoneCover ? { targetCover: atTarget.cover } : {}),
        ...(zoneObscuration ? { targetObscured: atTarget.obscured } : {}),
      });
      if (!result.ok) { setNotice(result.summary); return; }

      // Save source first; if target save fails, rollback the source. These
      // existing independent APIs are not an atomic multi-token transaction.
      let sourceSaved: Token | null = null;
      try {
        if (result.sourceChanged) sourceSaved = await saveTokenData(token, result.source);
        if (result.targetChanged) {
          if (isTokenTarget) await saveTokenData(target, result.target);
          else if (targetSheet) await api.updateCharacter(targetSheet.character.id, {
            data: result.target as CharacterData,
            updatedAt: targetSheet.character.updatedAt,
          });
        }
      } catch (error) {
        if (sourceSaved) {
          try { await saveTokenData(sourceSaved, data); }
          catch { throw new Error('Source and target may have diverged; reopening the map and checking both units is required.'); }
        }
        throw error;
      }
      const summary = `${result.title}\n${result.rows.map((entry) => `${entry.label}: ${entry.value}`).join(' • ')}`;
      setLastResult(summary);
      await announce(result.title, formatCombatResult(result));
    } catch (error) { setNotice(messageOf(error)); }
    finally { setBusy(false); }
  };

  return (
    <aside className="pointer-events-auto fixed bottom-4 left-4 z-[70] flex max-h-[min(80vh,730px)] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-cozy border border-ink/20 bg-paper/95 text-ink shadow-2xl backdrop-blur-sm" aria-label={`Squad Command Units token controls: ${token.name}`}>
      <header className="flex items-center gap-2 border-b border-ink/10 px-3 py-2">
        <Swords className="h-4 w-4" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{token.name}</p>
          <p className="text-[10px] text-ink-muted">Map-only Squad Command unit · No Journal sheet</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close Fodder HUD" title="Close Fodder HUD"><X className="h-4 w-4" /></button>
      </header>
      <div className="space-y-2 overflow-y-auto p-3 text-xs">
        {notice && <div role="alert" className="rounded border border-red-400/40 bg-red-200/10 p-2 text-red-700">{notice}</div>}
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ['HP', stats?.hpCurrent ?? 0, stats?.hpMax ?? 0, 'hpCurrent'],
            ['Shields', stats?.shieldCurrent ?? 0, stats?.shieldMax ?? 0, 'shieldCurrent'],
            ['Suppression', stats?.suppression ?? 0, 3, 'suppression'],
          ] as const).map(([label, value, max, field]) => (
            <div key={field} className="rounded border border-ink/10 p-2 text-center">
              <div className="text-[10px] text-ink-muted">{label}</div>
              <div className="font-semibold">{value} / {max}</div>
              <div className="mt-1 flex justify-center gap-2">
                <button type="button" disabled={busy} onClick={() => void change((current) => gmAdjust(current, field === 'hpCurrent' ? { hpCurrent: value - 1 } : field === 'shieldCurrent' ? { shieldCurrent: value - 1 } : { suppression: value - 1 }))} aria-label={`Decrease ${label}`}>−</button>
                <button type="button" disabled={busy} onClick={() => void change((current) => gmAdjust(current, field === 'hpCurrent' ? { hpCurrent: value + 1 } : field === 'shieldCurrent' ? { shieldCurrent: value + 1 } : { suppression: value + 1 }))} aria-label={`Increase ${label}`}>+</button>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded border border-ink/10 p-2 text-[11px]">
          <p>DEF {stats?.defense ?? '—'} · AV {stats?.av ?? '—'} · Move {stats?.move ?? '—'}</p>
          {activeZones.length > 0 && <p aria-label="Automatic battlefield effects">Zone: {atSource.cover ? `Cover +${atSource.cover} AV` : 'No cover'}{atSource.obscured ? ' · Obscured' : ''}{atSource.highGround ? ' · High Ground' : ''}{atSource.lowGround ? ' · Low Ground' : ''}{atSource.inHealing ? ' · Healing AoE available (GM)' : ''}{atSource.inHazard ? ' · Hazard present' : ''}</p>}
          <p>Round {data.battle?.round ?? 0} · Actions {data.battle?.actionsThisActivation ?? 0}/3 · Rally {data.battle?.rallyUsed ? 'Used' : 'Available'}</p>
          <p>{data.battle?.downed ? 'Downed' : field?.wrecked ? 'Wrecked' : field?.overwatch.active ? 'Overwatch' : (stats?.suppression ?? 0) >= 3 ? 'Pinned' : 'Active'}{field?.stabilized ? ' · Stabilized' : ''}</p>
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button type="button" className="rounded border p-1.5" disabled={busy} onClick={() => void change(startBattle)}>Start Battle</button>
          <button type="button" className="rounded border p-1.5" disabled={busy} onClick={() => void change(startActivation)}>Activate</button>
          <button type="button" className="rounded border p-1.5" disabled={busy} onClick={() => void change(refreshUnit)}>Refresh</button>
          <button type="button" className="rounded border p-1.5" disabled={busy || data.battle?.rallyUsed} onClick={() => void change((current) => performRally(current))}>Rally</button>
          <button type="button" className="rounded border p-1.5" disabled={busy} onClick={() => void change(endBattle)}>End Battle</button>
          <button type="button" className="rounded border p-1.5" disabled={busy || !field?.overwatch.active} onClick={() => void change(cancelOverwatch)}>Cancel OW</button>
        </div>
        {activeZones.length > 0 && <p className="text-[10px] text-ink-muted">Cover, obscuration and elevation follow existing corresponding zone types. Manual fields remain available for zone types not in use. GM-controlled AoEs require confirmation.</p>}
        <div className="rounded border border-ink/10 p-2">
          <div className="mb-1 flex gap-2"><Shield className="h-3.5 w-3.5" /><span className="font-semibold">Battlefield</span></div>
          <div className="flex items-center gap-2">
            <label htmlFor="squadFodderCover">Cover</label>
            <select id="squadFodderCover" value={zoneCover ? atSource.cover : (field?.cover ?? 0)} disabled={busy || zoneCover} className="rounded border p-1" onChange={(event) => void change((current) => setBattlefieldState(current, { cover: Number(event.target.value) as 0 | 1 | 2 }))}>
              <option value={0}>None</option><option value={1}>Light</option><option value={2}>Heavy</option>
            </select>
            <label className="flex items-center gap-1"><input type="checkbox" checked={zoneElevation ? (atSource.highGround && !atSource.lowGround) : (field?.highGround ?? false)} disabled={busy || zoneElevation} onChange={(event) => void change((current) => setBattlefieldState(current, { highGround: event.target.checked }))} /> High</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={zoneObscuration ? atSource.obscured : (field?.obscured ?? false)} disabled={busy || zoneObscuration} onChange={(event) => void change((current) => setBattlefieldState(current, { obscured: event.target.checked }))} /> Smoke</label>
          </div>
        </div>
        <div className="rounded border border-ink/10 p-2">
          <p className="mb-1 font-semibold">Target and weapons</p>
          <label className="mb-1 block">Target token
            <select className="mt-1 w-full rounded border p-1" value={targetId} disabled={busy} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">Choose target…</option>
              {validTargets.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>
          <label className="mb-1 flex items-center gap-2">Range (squares)
            <input className="w-16 rounded border p-1" type="number" min={0} max={999} value={distance} disabled={busy} onChange={(event) => setDistance(Math.max(0, Math.min(999, Number(event.target.value) || 0)))} />
          </label>
          {(data.weapons ?? []).map((weapon) => {
            const mode = nextActionMode(data);
            const reason = weaponUnavailableReason(data, weapon, { distance, actionMode: mode ?? 'none' });
            return <div key={weapon.id} className="mb-1 flex items-center gap-2 rounded bg-ink/5 p-1.5">
              <span className="min-w-0 flex-1 truncate" title={weapon.traits}>{weapon.name} · {weapon.damage} · AP {weapon.ap}{weapon.ammoMax ? ` · ${weapon.ammoCurrent ?? 0}/${weapon.ammoMax}` : ''}</span>
              <button type="button" title={reason ?? 'Resolve against chosen target'} className="rounded border bg-paper px-2 py-1 disabled:opacity-40" disabled={busy || !targetId || !!reason} onClick={() => void fireWeapon(weapon.id)}>Use</button>
              {weapon.ammoMax && <button type="button" className="rounded border bg-paper px-1.5 py-1" disabled={busy} onClick={() => void change((current) => reloadWeapon(current, weapon.id))}>Reload</button>}
              {weapon.canOverwatch && <button type="button" className="rounded border bg-paper px-1.5 py-1" disabled={busy} onClick={() => void change((current) => armOverwatch(current, weapon.id))}>OW</button>}
            </div>;
          })}
        </div>
        {(data.abilities ?? []).filter((entry) => !isSquadSpecialAbility(entry.id)).length > 0 && <div className="rounded border border-ink/10 p-2">
          <p className="mb-1 font-semibold">Unit abilities</p>
          {(data.abilities ?? []).filter((entry) => !isSquadSpecialAbility(entry.id)).map((ability) => <div key={ability.id} className="flex items-center gap-2 py-0.5">
            <span className="min-w-0 flex-1 truncate" title={ability.rules}>{ability.name}</span>
            <button type="button" disabled={busy || !!abilityUnavailableReason(data, ability.id)} title={abilityUnavailableReason(data, ability.id) ?? 'Activate ability'} className="rounded border px-2 py-1 disabled:opacity-40" onClick={() => void change((current) => activateAbility(current, ability.id))}>Use</button>
          </div>)}
        </div>}
        {lastResult && <div role="status" className="whitespace-pre-wrap rounded border border-moss-green/30 bg-moss-green/10 p-2 text-[11px]">{lastResult}</div>}
      </div>
    </aside>
  );
}
