import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ChevronDown,
  ChevronRight,
  Crosshair,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UsersRound,
  X,
  ShieldCheck,
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useToast } from '@/contexts/ToastContext';
import { useGameStore, useTokenList, useSelectedTokenId } from '@/stores/gameStore';
import api from '@/services/api';
import { TokenDisposition, TokenType, type CharacterTemplate, type Token } from '@/types';
import type { SquadCommandCharacterData, SquadCommandFaction } from '@/types/game-systems/squadCommand';
import { apiErrorMessage } from '@/utils/errors';
import { freshSquadCommandFodderData, nextFodderName } from './squadFodder';
import { classifyActiveLegacyFodder, classifyLegacyFodder, templateFromNumberedName } from './squadFodderLegacyCleanup';
import { snapshotForToken, tokenHpFor, isSheetlessSquadFodder } from './squadSheetlessFodder';
import SquadSheetlessFodderHUD from './SquadSheetlessFodderHUD';
import type { Character } from '@/types';

const TW_SYSTEM = 'SQUAD_COMMAND';
const FACTIONS: Array<{ value: SquadCommandFaction; label: string }> = [
  { value: 'astora', label: 'Faction 1' },
  { value: 'westphal', label: 'Faction 2' },
  { value: 'albion', label: 'Faction 3' },
  { value: 'gaulia', label: 'Faction 4' },
];

type Placement = {
  template: CharacterTemplate;
  remaining: number;
};

type LegacyScan = {
  verified: Character[];
  convertible: Array<{ character: Character; references: Array<{ mapId: string; token: Token }> }>;
  preserved: Array<{ name: string; reason: string }>;
  checkedMaps: number;
  checkedCharacters: number;
};

async function inBatches<T, R>(items: readonly T[], work: (item: T) => Promise<R>, concurrency = 4): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const at = cursor++;
      results[at] = await work(items[at]);
    }
  });
  await Promise.all(workers);
  return results;
}

function downloadBackup(campaignName: string, scan: LegacyScan): void {
  const json = JSON.stringify({
    format: 'smugvtt-legacy-fodder-backup-v1',
    campaign: campaignName,
    createdAt: new Date().toISOString(),
    records: [...scan.verified, ...scan.convertible.map((entry) => entry.character)],
    activeTokenSnapshots: scan.convertible.flatMap((entry) => entry.references.map((ref) => ({ mapId: ref.mapId, token: ref.token, characterId: entry.character.id }))),
  }, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `SmugVTT_Fodder_Backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

type FodderMetadata = {
  smugSquadFodder?: boolean;
  sourceTemplateId?: string;
  sourceTemplateName?: string;
};

function twData(template: CharacterTemplate): SquadCommandCharacterData {
  return (template.data ?? {}) as SquadCommandCharacterData;
}

function titleCase(value: string | undefined): string {
  if (!value) return 'Unassigned';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function SquadFodderSpawnOverlay() {
  const navigate = useNavigate();
  const { campaign, viewedMap, userRole } = useCampaign();
  const { showToast } = useToast();
  const tokens = useTokenList();
  const allMapDrawings = useGameStore(state => state.drawings);
  const drawingsMapId = useGameStore(state => state.drawingsMapId);
  const zoneDrawings = useMemo(() => drawingsMapId === viewedMap?.id ? allMapDrawings.filter(d => !!d.zoneType) : [], [drawingsMapId, viewedMap?.id, allMapDrawings]);
  const selectedTokenId = useSelectedTokenId();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<CharacterTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [spawningId, setSpawningId] = useState<string | null>(null);
  const [spawnedNames, setSpawnedNames] = useState<string[]>([]);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [quantity, setQuantity] = useState<1 | 3 | 5>(1);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all' | SquadCommandFaction | 'vehicle'>('all');
  const [cleaning, setCleaning] = useState(false);
  const [scanningLegacy, setScanningLegacy] = useState(false);
  const [legacyScan, setLegacyScan] = useState<LegacyScan | null>(null);


  const isTwGm = userRole === 'DM' && campaign?.gameSystem === TW_SYSTEM;

  const load = useCallback(async () => {
    if (!isTwGm) return;
    setLoading(true);
    try {
      const result = await api.listCharacterTemplates({ gameSystem: TW_SYSTEM, mine: true, limit: 100 });
      const full = await Promise.all(result.templates.map((template) => api.getCharacterTemplate(template.id)));
      setTemplates(full);
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not load Squad Command unit templates', 'error');
    } finally {
      setLoading(false);
    }
  }, [isTwGm, showToast]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const cancelPlacement = useCallback(() => {
    setPlacement(null);
    window.dispatchEvent(new CustomEvent('smugvtt:tw-fodder-placement-cancel'));
  }, []);

  useEffect(() => {
    setSpawnedNames([]);
    cancelPlacement();
  }, [campaign?.id, viewedMap?.id, cancelPlacement]);

  useEffect(() => {
    if (!placement) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      cancelPlacement();
      showToast('Fodder placement cancelled', 'info');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelPlacement, placement, showToast]);

  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent('smugvtt:tw-fodder-placement-cancel'));
  }, []);

  const existingNames = useMemo(
    () => [
      ...(campaign?.characters ?? []).map((character) => character.name),
      ...tokens.map((token) => token.name),
      ...spawnedNames,
    ],
    [campaign?.characters, spawnedNames, tokens],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return templates.filter((template) => {
      const data = twData(template);
      if (groupFilter === 'vehicle') {
        if (data.profile !== 'vehicle') return false;
      } else if (groupFilter !== 'all' && data.faction !== groupFilter) {
        return false;
      }
      if (!needle) return true;
      return `${template.name} ${data.faction ?? ''} ${data.profile ?? ''} ${data.unitId ?? ''}`.toLowerCase().includes(needle);
    });
  }, [groupFilter, search, templates]);

  const fodderTokens = useMemo(
    () => tokens.filter((token) => (token.metadata as FodderMetadata | null | undefined)?.smugSquadFodder === true),
    [tokens],
  );

  const selectedSheetless = tokens.find((token) =>
    token.id === selectedTokenId && isSheetlessSquadFodder(token)) ?? null;

  const spawnAt = useCallback(async (template: CharacterTemplate, position: { x: number; y: number }) => {
    if (!campaign || !viewedMap || spawningId) return false;
    setSpawningId(template.id);
    try {
      // Re-fetch immediately before spawn so sheet/art/defaults edited in another tab are respected.
      const latest = await api.getCharacterTemplate(template.id);
      const spawnName = nextFodderName(latest.name, existingNames);
      const data = freshSquadCommandFodderData(latest.data, spawnName);
      const tw = twData(latest);
      const tokenSize = Math.max(1, Math.min(6, Math.round(tw.fodder?.tokenSize ?? 1)));
      const disposition = tw.fodder?.disposition;

      // A spawned Fodder unit is a map-only NPC: its independent squad state
      // lives with the token, never in a permanent Character / Journal sheet.
      const metadata = snapshotForToken(data, {
        smugSquadFodder: true,
        sourceTemplateId: latest.id,
        sourceTemplateName: latest.name,
      });
      const result = await api.addToken(campaign.id, viewedMap.id, {
        characterId: null,
        name: spawnName,
        imageUrl: latest.tokenImageUrl ?? '',
        displayMode: 'full-art',
        position,
        size: { width: tokenSize, height: tokenSize },
        type: TokenType.NPC,
        ...(disposition ? { disposition: disposition as TokenDisposition } : {}),
        visible: true,
        controlledBy: null,
        conditions: [],
        hp: tokenHpFor(data),
        showHpBar: false,
        metadata,
      });
      useGameStore.getState().addToken(result.token, viewedMap.id);

      setSpawnedNames((current) => [...current, spawnName]);
      window.dispatchEvent(new CustomEvent('smugvtt:tw-fodder-spawned', {
        detail: { tokenId: result.token.id, name: spawnName, templateId: latest.id },
      }));
      return true;
    } catch (error) {
      showToast(apiErrorMessage(error) || `Could not spawn ${template.name}`, 'error');
      return false;
    } finally {
      setSpawningId(null);
    }
  }, [campaign, existingNames, showToast, spawningId, viewedMap]);

  useEffect(() => {
    if (!placement) return;
    const onPosition = (event: Event) => {
      if (spawningId) return;
      const detail = (event as CustomEvent<{ mapId?: string; position?: { x: number; y: number } }>).detail;
      if (!detail?.position || detail.mapId !== viewedMap?.id) return;
      void (async () => {
        const ok = await spawnAt(placement.template, detail.position!);
        if (!ok) return;
        setPlacement((current) => {
          if (!current || current.template.id !== placement.template.id) return current;
          if (current.remaining <= 1) {
            window.dispatchEvent(new CustomEvent('smugvtt:tw-fodder-placement-cancel'));
            showToast(`${current.template.name} placement complete`, 'success');
            return null;
          }
          return { ...current, remaining: current.remaining - 1 };
        });
      })();
    };
    window.addEventListener('smugvtt:tw-fodder-map-position', onPosition as EventListener);
    return () => window.removeEventListener('smugvtt:tw-fodder-map-position', onPosition as EventListener);
  }, [placement, showToast, spawnAt, spawningId, viewedMap?.id]);

  const armPlacement = (template: CharacterTemplate) => {
    setPlacement({ template, remaining: quantity });
    window.dispatchEvent(new CustomEvent('smugvtt:tw-fodder-placement-arm'));
  };

  const scanLegacySheets = async (): Promise<LegacyScan | null> => {
    if (!isTwGm || !campaign || scanningLegacy || cleaning || !templates.length) return null;
    if (!Array.isArray(campaign.maps) || !Array.isArray(campaign.characters)) {
      showToast('The campaign map/character inventory is incomplete. Cleanup aborted.', 'error');
      return null;
    }
    setScanningLegacy(true);
    setLegacyScan(null);
    try {
      // Campaign maps list is metadata only. Every full map MUST be read before
      // considering permanent deletion. If any map fails, abort completely.
      const fullMaps = await inBatches(campaign.maps ?? [], async (map) => {
        const response = await api.getMap(campaign.id, map.id);
        return response.map;
      });
      const referenced = new Set(fullMaps.flatMap((map) => map.tokens.map((token) => token.characterId).filter((id): id is string => !!id)));
      const protectedIds = new Set((campaign.memberships ?? []).flatMap((member) => member.characterIds ?? []));
      const candidates = (campaign.characters ?? []).filter((character) =>
        templateFromNumberedName(character.name, templates.map((template) => template.name)) !== null);
      const decisions = await inBatches(candidates, async (candidate) => {
        try {
          const { character } = await api.getCharacter(candidate.id);
          const decision = classifyLegacyFodder(character, templates, referenced, protectedIds);
          return { character, decision };
        } catch {
          return { character: candidate as Character, decision: { verified: false, reason: 'Could not read full sheet; skipped', matchedTemplate: null } };
        }
      });
      const referencedTokens = new Map<string, Array<{ mapId: string; token: Token }>>();
      for (const map of fullMaps) for (const token of map.tokens) if (token.characterId) {
        const list = referencedTokens.get(token.characterId) ?? [];
        list.push({ mapId: map.id, token });
        referencedTokens.set(token.characterId, list);
      }
      // The original v0.6.x Fodder spawner flagged the TOKEN, not the sheet.
      // Only convert sheets where ALL references prove old Fodder provenance.
      const convertible = decisions.flatMap((entry) => {
        if (entry.decision.verified) return [];
        const refs = referencedTokens.get(entry.character.id) ?? [];
        const check = classifyActiveLegacyFodder(entry.character, templates, refs, protectedIds);
        return check.verified ? [{ character: entry.character, references: refs }] : [];
      });
      const convertibleIds = new Set(convertible.map((entry) => entry.character.id));
      const result: LegacyScan = {
        verified: decisions.filter((entry) => entry.decision.verified).map((entry) => entry.character),
        convertible,
        preserved: decisions.filter((entry) => !entry.decision.verified && !convertibleIds.has(entry.character.id))
          .map((entry) => {
            const refs = referencedTokens.get(entry.character.id) ?? [];
            const reason = refs.length
              ? classifyActiveLegacyFodder(entry.character, templates, refs, protectedIds).reason
              : entry.decision.reason;
            return { name: entry.character.name, reason };
          }),
        checkedMaps: fullMaps.length,
        checkedCharacters: candidates.length,
      };
      setLegacyScan(result);
      showToast(`Found ${result.verified.length} orphan sheets, ${result.convertible.length} safely eligible for map-token migration, ${result.preserved.length} skipped.`, 'info');
      return result;
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Fodder scan failed; nothing will be deleted', 'error');
      return null;
    } finally {
      setScanningLegacy(false);
    }
  };

  const deleteVerifiedLegacySheets = async () => {
    if (!isTwGm || !campaign || !legacyScan || scanningLegacy || cleaning || !Array.isArray(campaign.maps)) return;
    if (!legacyScan.verified.length && !legacyScan.convertible.length) return;
    // BACKUP MUST BE DOWNLOADED before any map token is unlinked or sheet deleted.
    try { downloadBackup(campaign.name, legacyScan); }
    catch { showToast('Backup could not be prepared. No records were changed.', 'error'); return; }
    if (!window.confirm(`A JSON backup was prepared for download. Verify it was saved!\n\n${legacyScan.convertible.length} active legacy sheet(s) will be copied into map-only Fodder tokens first; ${legacyScan.verified.length} already orphaned sheet(s) may be deleted.\n\nAll maps are rechecked. An incomplete migration preserves its original sheet. Proceed?`)) return;
    setCleaning(true);
    let migratedTokens = 0, removed = 0, failed = 0, skipped = 0;
    try {
      if (!Array.isArray(campaign.maps)) throw new Error('Cannot verify all campaign maps');
      const protectedIds = new Set((campaign.memberships ?? []).flatMap((member) => member.characterIds ?? []));
      // Re-read sheets and maps after confirmation, before first mutation.
      const verifiedMaps = await inBatches(campaign.maps, async (map) => (await api.getMap(campaign.id, map.id)).map);
      const tokensByCharacter = new Map<string, Array<{ mapId: string; token: Token }>>();
      for (const map of verifiedMaps) for (const token of map.tokens) if (token.characterId) {
        const refs = tokensByCharacter.get(token.characterId) ?? [];
        refs.push({ mapId: map.id, token });
        tokensByCharacter.set(token.characterId, refs);
      }
      const convertibleById = new Map(legacyScan.convertible.map((entry) => [entry.character.id, entry]));
      const candidates = [...legacyScan.verified, ...legacyScan.convertible.map((entry) => entry.character)];
      for (const archived of candidates) {
        try {
          const { character } = await api.getCharacter(archived.id);
          const refs = tokensByCharacter.get(character.id) ?? [];
          const conversion = convertibleById.get(character.id);
          if (conversion) {
            // Reject new / missing map links since Scan. No silent broadening of scope.
            const scannedKeys = conversion.references.map((ref) => `${ref.mapId}:${ref.token.id}`).sort();
            const currentKeys = refs.map((ref) => `${ref.mapId}:${ref.token.id}`).sort();
            if (JSON.stringify(scannedKeys) !== JSON.stringify(currentKeys) ||
                !classifyActiveLegacyFodder(character, templates, refs, protectedIds).verified) {
              skipped++; continue;
            }
          } else {
            // Unlinked sheets remain eligible only with the ORIGINAL sheet flag.
            const currentIds = refs.length ? new Set([character.id]) : new Set<string>();
            if (!classifyLegacyFodder(character, templates, currentIds, protectedIds).verified) {
              skipped++; continue;
            }
          }
          let migrationFailed = false;
          for (const ref of refs) {
            try {
              const existing = ref.token;
              const sheetData = character.data as SquadCommandCharacterData;
              const metadata = snapshotForToken(sheetData, {
                ...(existing.metadata ?? {}),
                sourceTemplateName: templateFromNumberedName(character.name, templates.map((template) => template.name)) ?? '',
              });
              const result = await api.updateToken(campaign.id, ref.mapId, existing.id, {
                characterId: null,
                metadata,
                hp: tokenHpFor(sheetData),
                showHpBar: existing.showHpBar ?? false,
              });
              if (!result.token || result.token.characterId !== null) throw new Error('Server did not unlink the legacy sheet');
              useGameStore.getState().patchToken(existing.id, result.token, ref.mapId);
              migratedTokens++;
            } catch { migrationFailed = true; failed++; }
          }
          if (migrationFailed) continue;
          // Re-read every map; the original token objects MUST still exist and
          // be fully unlinked, with their provenance intact, before deletion.
          const refreshed = await inBatches(campaign.maps, async (map) => (await api.getMap(campaign.id, map.id)).map);
          const stillReferenced = refreshed.some((map) => map.tokens.some((token) => token.characterId === character.id));
          if (stillReferenced) { skipped++; continue; }
          if (conversion && !refs.every((ref) => {
            const current = refreshed.find((map) => map.id === ref.mapId)?.tokens.find((token) => token.id === ref.token.id);
            const meta = current?.metadata as FodderMetadata | undefined;
            return current?.characterId === null && meta?.smugSquadFodder === true &&
              current.name === ref.token.name && meta.sourceTemplateId === (ref.token.metadata as FodderMetadata).sourceTemplateId;
          })) { skipped++; continue; }
          const latest = await api.getCharacter(character.id);
          if (conversion) {
            // Verify the original proven token evidence against the sheet once
            // more; it cannot be re-classified using live links after unlinking.
            if (!classifyActiveLegacyFodder(latest.character, templates, refs, protectedIds).verified) {
              skipped++; continue;
            }
          } else if (!classifyLegacyFodder(latest.character, templates, new Set(), protectedIds).verified) {
            skipped++; continue;
          }
          await api.deleteCharacter(character.id);
          removed++;
        } catch { failed++; }
      }
      setLegacyScan(null);
      const summary = `Migrated ${migratedTokens} existing Fodder token(s), deleted ${removed} obsolete sheets; ${failed} failed, ${skipped} preserved. Keep the downloaded backup.`;
      showToast(summary, failed ? 'error' : 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Map migration failed; remaining sheets were preserved', 'error');
    } finally { setCleaning(false); }
  };

  const cleanupFodder = async () => {
    if (!campaign || !viewedMap || fodderTokens.length === 0 || cleaning) return;
    if (!window.confirm(`Remove ${fodderTokens.length} spawned Squad Command unit${fodderTokens.length === 1 ? '' : 's'} from this map? Legacy generated sheets are deleted only if verified unused; master templates are kept.`)) return;
    cancelPlacement();
    setCleaning(true);
    let removed = 0;
    let failed = 0;
    try {
      // A spawned sheet can be referenced by copies on other maps. Never
      // delete one when another token still needs it, even during map clear.
      if (!Array.isArray(campaign.maps)) throw new Error('Incomplete campaign map list; clear cancelled.');
      const maps = await inBatches(campaign.maps, async (map) => (await api.getMap(campaign.id, map.id)).map);
      const elsewhere = new Set(maps.flatMap((map) => map.tokens.filter((token) =>
        map.id !== viewedMap.id || !fodderTokens.some((removedToken) => removedToken.id === token.id))
        .map((token) => token.characterId).filter((value): value is string => Boolean(value))));
      for (const token of fodderTokens) {
        try {
          await api.deleteToken(campaign.id, viewedMap.id, token.id);
          useGameStore.getState().removeToken(token.id, viewedMap.id);
          if (token.characterId && !elsewhere.has(token.characterId)) {
            try {
              const { character } = await api.getCharacter(token.characterId);
              const metadata = character.data as SquadCommandCharacterData;
              if (metadata.fodder?.isSpawned === true && metadata.isPlayerCharacter !== true) {
                await api.deleteCharacter(token.characterId);
              }
            } catch { /* preserve the sheet when verification or deletion fails */ }
          }
          removed += 1;
        } catch { failed += 1; }
      }
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Map inventory failed; nothing cleared', 'error');
      setCleaning(false);
      return;
    }
    setCleaning(false);
    setSpawnedNames([]);
    if (failed > 0) showToast(`Removed ${removed}; ${failed} fodder token${failed === 1 ? '' : 's'} could not be removed`, 'error');
    else showToast(`Removed ${removed} spawned fodder unit${removed === 1 ? '' : 's'}`, 'success');
  };

  if (!isTwGm || !viewedMap) return null;

  return (
    <>
    <div className="pointer-events-none fixed bottom-0 right-[24rem] z-50 max-w-[min(26rem,calc(100%-1.5rem))] max-[1100px]:right-3">
      <div className="pointer-events-auto overflow-hidden rounded-cozy border border-ink/15 bg-paper/95 shadow-lg backdrop-blur-sm">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink hover:bg-ink/5"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <UsersRound className="h-4 w-4" />
          <span className="flex-1">Squad Command Units</span>
          {fodderTokens.length > 0 && <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[9px]">{fodderTokens.length}</span>}
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {open && (
          <div className="max-h-[28rem] min-w-[19rem] overflow-y-auto border-t border-ink/10 p-2">
            {placement && (
              <div className="mb-2 rounded-cozy border border-moss-green/30 bg-moss-green/10 p-2">
                <div className="flex items-start gap-2">
                  <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-ink">Place {placement.template.name}</p>
                    <p className="text-[10px] text-ink-muted">Click the map · {placement.remaining} remaining · Esc cancels</p>
                  </div>
                  <button type="button" onClick={cancelPlacement} className="rounded p-0.5 text-ink-muted hover:bg-ink/10 hover:text-ink" title="Cancel placement">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-ink-muted">Owned Squad Command templates</span>
              <div className="flex items-center gap-1">
                <button type="button" className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-semibold text-ink hover:bg-ink/5" onClick={() => navigate('/character-templates?gameSystem=SQUAD_COMMAND&mine=1&fodder=1&create=1')}>
                  <Plus className="h-3.5 w-3.5" /> Create
                </button>
                <button type="button" className="rounded p-1 text-ink-muted hover:bg-ink/5 hover:text-ink" onClick={() => void load()} disabled={loading} title="Refresh fodder templates">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {templates.length > 0 && (
              <div className="mb-2 grid grid-cols-[1fr_auto] gap-1.5">
                <label className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search…" className="w-full rounded border border-ink/15 bg-paper py-1.5 pl-7 pr-2 text-[11px] text-ink outline-none" />
                </label>
                <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value as typeof groupFilter)} className="rounded border border-ink/15 bg-paper px-1.5 py-1 text-[10px] text-ink" aria-label="Filter fodder">
                  <option value="all">All</option>
                  {FACTIONS.map((faction) => <option key={faction.value} value={faction.value}>{faction.label}</option>)}
                  <option value="vehicle">Vehicles</option>
                </select>
              </div>
            )}

            <div className="mb-2 flex items-center justify-between rounded bg-ink/5 px-2 py-1.5">
              <span className="text-[10px] text-ink-muted">Place quantity</span>
              <div className="flex gap-1">
                {([1, 3, 5] as const).map((count) => (
                  <button key={count} type="button" onClick={() => setQuantity(count)} className={`rounded px-2 py-1 text-[10px] font-semibold ${quantity === count ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-ink/10'}`}>×{count}</button>
                ))}
              </div>
            </div>

            {!loading && templates.length === 0 && (
              <div className="px-1 py-3 text-center">
                <p className="mb-2 text-xs text-ink-muted">No owned Squad Command fodder templates yet.</p>
                <button type="button" className="inline-flex items-center gap-1.5 rounded-cozy border border-ink/15 bg-paper px-2 py-1.5 text-xs font-semibold text-ink hover:bg-ink/5" onClick={() => navigate('/character-templates?gameSystem=SQUAD_COMMAND&mine=1&fodder=1&create=1')}>
                  <Plus className="h-4 w-4" /> Create Fodder
                </button>
              </div>
            )}

            <div className="grid gap-1">
              {filtered.map((template) => {
                const data = twData(template);
                const stats = data.stats;
                const active = placement?.template.id === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    className={`flex items-center gap-2 rounded-cozy border px-2 py-1.5 text-left disabled:opacity-60 ${active ? 'border-moss-green/60 bg-moss-green/10' : 'border-ink/10 bg-paper hover:bg-ink/5'}`}
                    disabled={Boolean(spawningId)}
                    onClick={() => armPlacement(template)}
                    title={`Place ${quantity} numbered ${template.name}${quantity === 1 ? '' : ' units'}`}
                  >
                    <span className="h-9 w-9 shrink-0 overflow-hidden rounded bg-ink/5">
                      {template.tokenImageUrl ? <img src={template.tokenImageUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-ink-muted">{template.name.charAt(0)}</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-ink">{template.name}</span>
                      <span className="block truncate text-[9px] text-ink-muted">
                        {titleCase(data.faction)}{stats ? ` · HP ${stats.hpMax} · SH ${stats.shieldMax}` : ''} · {data.fodder?.tokenSize ?? 1}×{data.fodder?.tokenSize ?? 1}
                      </span>
                    </span>
                    {spawningId === template.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 rounded-cozy border border-warning/30 bg-warning/5 p-2 text-xs">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 font-semibold text-ink"><ShieldCheck className="h-4 w-4"/> GM · Legacy Fodder Sheets</span>
                <button type="button" disabled={scanningLegacy || cleaning || templates.length === 0}
                  onClick={() => void scanLegacySheets()}
                  className="rounded border border-ink/20 bg-paper px-2 py-1 font-semibold disabled:opacity-40">
                  {scanningLegacy ? 'Scanning…' : 'Scan Sheets'}
                </button>
              </div>
              <p className="text-[10px] text-ink-muted">Active sheets must have numbered master-template names and matching old Fodder token markers on every map. Orphans require the old sheet flag. Ambiguous entries are never deleted.</p>
              {legacyScan && <div className="mt-2 flex flex-col gap-1">
                <span className="font-semibold">{legacyScan.verified.length} orphan sheets · {legacyScan.convertible.length} active sheets to migrate · {legacyScan.preserved.length} protected/ambiguous · {legacyScan.checkedMaps} maps checked</span>
                {legacyScan.convertible.length > 0 && <div className="text-[10px] text-ink">Eligible active: {legacyScan.convertible.map((entry) => entry.character.name).join(', ')}</div>}
                {legacyScan.verified.length > 0 && <div className="text-[10px] text-ink">Eligible orphan: {legacyScan.verified.map((item) => item.name).join(', ')}</div>}
                {legacyScan.preserved.length > 0 && <details className="rounded border border-ink/15 p-1.5 text-[10px] text-ink-muted">
                  <summary className="cursor-pointer font-semibold">Review {legacyScan.preserved.length} protected / ambiguous record(s) and exact reasons</summary>
                  <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
                    {legacyScan.preserved.map((entry, index) => <li key={`${entry.name}-${index}`}><span className="font-semibold">{entry.name}</span> — {entry.reason}</li>)}
                  </ul>
                </details>}
                <button type="button" disabled={(!legacyScan.verified.length && !legacyScan.convertible.length) || cleaning} onClick={() => void deleteVerifiedLegacySheets()}
                  className="self-start rounded border border-danger/40 bg-paper px-2 py-1 font-semibold text-danger-ink disabled:opacity-40">
                  Backup, Convert & Clean ({legacyScan.verified.length + legacyScan.convertible.length})
                </button>
              </div>}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-ink/10 pt-2">
              <button type="button" className="text-[10px] font-semibold text-ink-muted hover:text-ink" onClick={() => navigate('/character-templates?gameSystem=SQUAD_COMMAND&mine=1&fodder=1')}>Manage templates</button>
              <button
                type="button"
                disabled={fodderTokens.length === 0 || cleaning}
                onClick={() => void cleanupFodder()}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-semibold text-danger-ink hover:bg-danger-fill/10 disabled:opacity-40"
                title="Remove only units spawned through Squad Command Units; master templates are kept"
              >
                {cleaning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Clear spawned ({fodderTokens.length})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
      {selectedSheetless && campaign && <SquadSheetlessFodderHUD
        token={selectedSheetless}
        campaignId={campaign.id}
        mapId={viewedMap.id}
        zones={zoneDrawings}
        gridSize={viewedMap.gridSize}
        mapHeight={viewedMap.height}
        onClose={() => useGameStore.getState().selectToken(null)}
      />}
    </>
  );
}
