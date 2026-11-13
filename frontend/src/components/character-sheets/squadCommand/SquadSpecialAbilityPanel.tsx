import { useEffect, useState } from 'react';
import { Crosshair, RadioTower } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import type { Character, CharacterData } from '@/types';
import type { SquadCommandCharacterData } from '@/types/game-systems/squadCommand';
import {
  canUseSquadSpecialAbilities,
  formatCombatResult,
  nextActionMode,
  resolveSquadSpecialAbility,
  specialUnavailableReason,
  TW_SPECIAL_ABILITIES,
} from './combatEngine';
import { normalizeSquadCommandData } from './battleState';

// The standalone sheet can render outside CampaignProvider.  The campaign HUD
// supplies an optional, scoped bridge when one is mounted; no provider hook here.
interface TwAbilityCharacterLabel {
  id: string;
  name: string;
  gameSystem?: string | null;
}
interface TwAbilityCampaignBridge {
  isDm: boolean;
  characters: TwAbilityCharacterLabel[];
  report?: (title: string, body: string) => Promise<void>;
}

interface Props {
  character: Character;
  data: SquadCommandCharacterData;
  canControl: boolean;
  targetId?: string;
  distance?: number;
  onCommitted?: (next: Character) => void;
  onNotice?: (message: string) => void;
  onReport?: (title: string, body: string) => Promise<void>;
  onChooseTarget?: () => void;
  availableCp?: number;
  onSpendCp?: () => void;
  /** Injected from Quick Access; sheet can also acquire it from a mounted HUD. */
  isDm?: boolean;
  campaignCharacters?: TwAbilityCharacterLabel[];
  /** From the campaign HUD only; standalone sheets never gain map token write access. */
  onResolveSheetlessTarget?: (abilityId: string, tokenId: string, distance: number) => Promise<string>;
}

/** Sheet and Quick Access both commit through this component and one shared combat resolver. */
export default function SquadSpecialAbilityPanel({
  character, data, canControl, targetId, distance, onCommitted, onNotice, onReport, onChooseTarget, availableCp, onSpendCp,
  isDm, campaignCharacters, onResolveSheetlessTarget,
}: Props) {
  const { user } = useAuth();
  const [bridge, setBridge] = useState<TwAbilityCampaignBridge | null>(null);
  useEffect(() => {
    // Dashboard / standalone sheet pages have no CampaignProvider.  If a
    // campaign HUD exists, it can answer this single synchronous request.
    if (isDm !== undefined) return;
    let mounted = true;
    window.dispatchEvent(new CustomEvent('smugvtt:tw-ability-context-request', {
      detail: {
        characterId: character.id,
        respond: (context: TwAbilityCampaignBridge) => {
          if (mounted && typeof context?.isDm === 'boolean') setBridge(context);
        },
      },
    }));
    return () => { mounted = false; };
  }, [character.id, isDm]);
  const gmAuthority = isDm ?? bridge?.isDm ?? false;
  const knownCharacters = campaignCharacters ?? bridge?.characters ?? [];
  const reportAction = onReport ?? bridge?.report;
  const [chosenTarget, setChosenTarget] = useState(targetId ?? '');
  const [range, setRange] = useState(distance ?? 1);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [orbitalAiming, setOrbitalAiming] = useState(false);
  const [orbitalConfirmTarget, setOrbitalConfirmTarget] = useState<string | null>(null);
  const eligible = canUseSquadSpecialAbilities(data);
  const abilities = (data.abilities ?? []).filter((entry) => TW_SPECIAL_ABILITIES.some((special) => special.id === entry.id));

  useEffect(() => { if (targetId !== undefined) setChosenTarget(targetId); }, [targetId]);
  useEffect(() => { if (distance !== undefined) setRange(distance); }, [distance]);
  useEffect(() => {
    const onSelected = (evt: Event) => {
      if (!picking) return;
      const detail = (evt as CustomEvent<{ characterId?: string; tokenId?: string }>).detail;
      const id = detail?.characterId ?? (detail?.tokenId ? `token:${detail.tokenId}` : '');
      if (!id) return;
      setChosenTarget(id); setPicking(false);
      window.dispatchEvent(new CustomEvent('smugvtt:tw-targeting', { detail: { active: false } }));
      if (orbitalAiming) {
        setOrbitalConfirmTarget(id);
        setOrbitalAiming(false);
        window.dispatchEvent(new CustomEvent('smugvtt:tw-orbital-aim', { detail: { active: false } }));
      }
      window.dispatchEvent(new CustomEvent('smugvtt:tw-distance-request', {
        detail: { sourceCharacterId: character.id,
          ...(id.startsWith('token:') ? { targetTokenId: id.slice(6) } : { targetCharacterId: id }) },
      }));
    };
    const onMeasured = (evt: Event) => {
      const detail = (evt as CustomEvent<{ sourceCharacterId?: string; targetCharacterId?: string; distance?: number }>).detail;
      if (detail?.sourceCharacterId === character.id && Number.isFinite(detail?.distance)) {
        setRange(Math.max(0, detail?.distance ?? 0));
      }
    };
    window.addEventListener('smugvtt:map-character-selected', onSelected);
    window.addEventListener('smugvtt:tw-distance-resolved', onMeasured);
    return () => {
      window.removeEventListener('smugvtt:map-character-selected', onSelected);
      window.removeEventListener('smugvtt:tw-distance-resolved', onMeasured);
    };
  }, [character.id, picking, orbitalAiming]);
  useEffect(() => {
    if (!orbitalConfirmTarget) return;
    const id = orbitalConfirmTarget;
    setOrbitalConfirmTarget(null);
    void apply('orbital_rail_cannon', id);
  // Rebinds on target confirmation. The map click is the explicit strike confirmation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orbitalConfirmTarget]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (!picking && !orbitalAiming)) return;
      setPicking(false); setOrbitalAiming(false); setOrbitalConfirmTarget(null);
      window.dispatchEvent(new CustomEvent('smugvtt:tw-orbital-aim', { detail: { active: false } }));
      window.dispatchEvent(new CustomEvent('smugvtt:tw-targeting', { detail: { active: false } }));
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [picking, orbitalAiming]);

  if (!eligible || !abilities.length) return null;
  const notify = (text: string) => { setMessage(text); onNotice?.(text); };
  const apply = async (abilityId: string, selectedId?: string) => {
    if (busy || !canControl) return;
    const destId = selectedId || chosenTarget || character.id;
    if (!destId) { notify('Select a target token first.'); return; }
    if (abilityId === 'orbital_rail_cannon' && destId === character.id) { notify('Orbital Rail Cannon requires a different target.'); return; }
    const reason = specialUnavailableReason(data, abilityId);
    if (reason) { notify(reason); return; }
    if (!gmAuthority) {
      const title = TW_SPECIAL_ABILITIES.find((entry) => entry.id === abilityId)?.name ?? abilityId;
      if (reportAction) {
        try {
          await reportAction(`Request: ${title}`, `**${character.name}** requests ${title} on **${knownCharacters.find((entry) => entry.id === destId)?.name ?? 'selected unit'}**. GM resolution required.`);
          notify('Ability request posted for the GM. No combat state was changed.');
        } catch (error) {
          notify(error instanceof Error ? `Ability request was not posted: ${error.message}` : 'Ability request was not posted.');
        }
      } else notify('Open the campaign Map/Quick Access to resolve or request abilities; no campaign authority is available on this standalone sheet.');
      return;
    }
    setBusy(true); setMessage(null);
    try {
      if (destId.startsWith('token:')) {
        if (!onResolveSheetlessTarget) throw new Error('Open this character in the campaign Quick Access panel to target sheetless Fodder.');
        const title = await onResolveSheetlessTarget(abilityId, destId.slice(6), range);
        notify(`${title} resolved against sheetless Fodder.`);
        return;
      }
      const same = destId === character.id;
      const targetCharacter = same ? character : (await api.getCharacter(destId)).character;
      if (targetCharacter.gameSystem !== 'SQUAD_COMMAND') throw new Error('Target must use Squad Command.');
      const target = normalizeSquadCommandData(targetCharacter.data as SquadCommandCharacterData);
      const actionMode = nextActionMode(data);
      if (!actionMode) throw new Error('No eligible Free/Push action remains.');
      if (actionMode === 'push' && availableCp !== undefined && availableCp <= 0) {
        throw new Error('No Command Points remain.');
      }
      const result = resolveSquadSpecialAbility(data, target, abilityId, { distance: range, actionMode }, same);
      if (!result.ok) throw new Error(result.summary);
      let updatedSource: Character | null = null;
      try {
        const sourceAnswer = await api.updateCharacter(character.id, {
          data: (same ? result.target : result.source) as CharacterData,
          updatedAt: character.updatedAt,
        });
        updatedSource = sourceAnswer.character;
        if (!same) {
          await api.updateCharacter(targetCharacter.id, {
            data: result.target as CharacterData, updatedAt: targetCharacter.updatedAt,
          });
        }
      } catch (e) {
        if (updatedSource && !same) {
          try {
            await api.updateCharacter(character.id, {
              data: data as CharacterData, updatedAt: updatedSource.updatedAt,
            });
          } catch { throw new Error('Target save failed and source rollback failed. Check both sheets.'); }
        }
        throw e;
      }
      if (updatedSource) onCommitted?.(updatedSource);
      if (actionMode === 'push') onSpendCp?.();
      let chatFailed = false;
      if (reportAction) {
        try { await reportAction(result.title, formatCombatResult(result)); }
        catch { chatFailed = true; }
      }
      // Local-only special-effect animation. Other users receive the combat chat card when posting succeeds.
      if (abilityId === 'orbital_rail_cannon') {
        window.dispatchEvent(new CustomEvent('smugvtt:tw-orbital-fire', {
          detail: { targetCharacterId: destId, sourceCharacterId: character.id },
        }));
      }
      if (abilityId === 'medic') {
        window.dispatchEvent(new CustomEvent('smugvtt:tw-medic-withdraw', { detail: { targetCharacterId: destId } }));
      }
      notify(chatFailed ? `${result.title} resolved, but the chat report failed. Do not fire again; check the updated sheets.` : `${result.title} resolved.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Special ability could not be committed.');
    } finally { setBusy(false); }
  };

  const targetLabel = chosenTarget.startsWith('token:') ? 'Fodder token'
    : knownCharacters.find((entry) => entry.id === chosenTarget)?.name;
  return (
    <section className="space-y-2 rounded-cozy border border-amber-500/30 bg-amber-500/5 p-3" aria-label="Commander and PC special abilities">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="flex items-center gap-1.5 text-sm"><RadioTower className="h-4 w-4" /> Special Abilities</strong>
<span className="text-[10px] text-ink-muted">Uses chat/SFX volume</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_64px] gap-1.5">
        <button type="button" className="input-cozy flex items-center gap-1.5 truncate text-left text-xs" onClick={() => {
          const next = !picking;
          setPicking(next);
          window.dispatchEvent(new CustomEvent('smugvtt:tw-targeting', { detail: { active: next } }));
          onChooseTarget?.();
        }} title="Choose a target by clicking a token on the map">
          <Crosshair className="h-3.5 w-3.5" /> {picking ? 'Click map target…' : targetLabel ? `Target: ${targetLabel}` : 'Select Target / self'}
        </button>
        <input aria-label="Special attack distance" className="input-cozy text-center text-xs" type="number" min={0} value={range} onChange={(e) => setRange(Math.max(0, Number(e.target.value) || 0))} />
      </div>
      {!targetId && <select aria-label="Sheet target fallback" className="input-cozy w-full text-xs" value={chosenTarget} onChange={(e) => setChosenTarget(e.target.value)}>
        <option value="">Self (buffs only)</option>
        {knownCharacters.filter((entry) => entry.gameSystem === 'SQUAD_COMMAND').map((entry) =>
          <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select>}
      {!gmAuthority && !reportAction && <p className="text-[11px] text-ink-muted">Open the campaign Map to resolve or request abilities. This standalone sheet has no live campaign session.</p>}
      <div className="grid grid-cols-2 gap-1.5">
        {abilities.map((ability) => {
          const reason = specialUnavailableReason(data, ability.id)
            ?? (!nextActionMode(data) ? 'No actions available' : null)
            ?? (nextActionMode(data) === 'push' && availableCp !== undefined && availableCp <= 0 ? 'No Command Points' : null);
          return <button key={ability.id} type="button" disabled={busy || !canControl || !!reason || (!!onReport && !user)}
            onClick={() => {
              if (ability.id !== 'orbital_rail_cannon') { void apply(ability.id); return; }
              if (orbitalAiming) {
                setOrbitalAiming(false); setPicking(false);
                window.dispatchEvent(new CustomEvent('smugvtt:tw-orbital-aim', { detail: { active: false } }));
                window.dispatchEvent(new CustomEvent('smugvtt:tw-targeting', { detail: { active: false } }));
                if (chosenTarget) void apply(ability.id);
                else notify('Choose a target token first.');
                return;
              }
              setOrbitalAiming(true); setPicking(true);
              window.dispatchEvent(new CustomEvent('smugvtt:tw-orbital-aim', {
                detail: { active: true, sourceCharacterId: character.id },
              }));
              window.dispatchEvent(new CustomEvent('smugvtt:tw-targeting', { detail: { active: true } }));
              notify('Orbital laser armed: click a target token to confirm, or press Esc to cancel.');
            }}
            title={reason ?? ability.rules ?? ''}
            className="rounded border border-amber-500/20 bg-paper px-2 py-2 text-left text-xs font-semibold hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40">
            {ability.id === 'orbital_rail_cannon' && orbitalAiming ? 'Confirm Orbital Strike' : ability.name}{reason && <span className="mt-0.5 block text-[10px] font-normal text-danger-ink">{reason}</span>}
          </button>;
        })}
      </div>
      {message && <p role="status" className="text-[11px] text-ink-muted">{message}</p>}
    </section>
  );
}
