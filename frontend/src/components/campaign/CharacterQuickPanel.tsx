import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Edit3,
  Lock,
  MessageCircle,
  Pin,
  PinOff,
  ScrollText,
  Shield,
  ShieldAlert,
  Swords,
  UserRound,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { api } from '@/services/api';
import { MessageType } from '@/types';
import { useGameStore, useTokenList, useDrawings } from '@/stores/gameStore';
import { isSheetlessSquadFodder, readSheetlessSquadFodder, snapshotForToken, tokenHpFor } from './squadSheetlessFodder';
import { effectsForToken } from './map/zoneMechanics';
import type { Character, CharacterData } from '@/types';
import Button from '@/components/ui/Button';
import CharacterSheetViewerModal from '@/components/character/CharacterSheetViewerModal';
import CharacterSheetEditorModal from '@/components/character/CharacterSheetEditorModal';
import SquadSpecialAbilityPanel from '@/components/character-sheets/squadCommand/SquadSpecialAbilityPanel';
import { chatChimeFromCharacterData, playChatChime } from '@/utils/chatChimes';
import { speakerThemeStyle } from '@/utils/speakerTheme';
import type { SquadCommandCharacterData } from '@/types/game-systems/squadCommand';
import {
  battleReset,
  endBattle,
  nextRound,
  normalizeSquadCommandData,
  recordAction,
  refreshUnit,
  startActivation,
  startBattle,
  useRally as performRally,
} from '@/components/character-sheets/squadCommand/battleState';
import {
  abilityUnavailableReason,
  activateAbility,
  armOverwatch,
  cancelOverwatch,
  formatCombatResult,
  gmAdjust,
  isTargetedAbility,
  nextActionMode,
  reloadWeapon,
  resolveTargetedAbility,
  resolveWeaponAction,
  resolveSquadSpecialAbility,
  setBattlefieldState,
  validateCombatProfile,
  weaponUnavailableReason,
  isSquadSpecialAbility,
} from '@/components/character-sheets/squadCommand/combatEngine';

interface SpeakAsDetail {
  key?: string;
  type: 'self' | 'character' | 'npc' | 'narrator';
  id?: string;
  label: string;
  imageUrl?: string | null;
  chatChime?: string;
}

type HudSection = 'overview' | 'bio' | 'stats' | 'notes';
type ActionGroup = 'battle' | 'weapons' | 'abilities' | 'support';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstText(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function displayLabel(value: unknown, fallback = '—'): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value
    .trim()
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word)
    .join(' ');
}

function systemLabel(value: unknown): string {
  return displayLabel(value, 'Character');
}

function shortClientId(): string {
  return `hud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function CharacterQuickPanel() {
  const { campaign, userRole } = useCampaign();
  const { user } = useAuth();
  const { socket } = useWebSocket();
  const tokens = useTokenList();
  const tokenMapId = useGameStore(s => s.tokensMapId);
  const mapDrawings = useDrawings();

  const storageKey = campaign?.id ? `smug-character-hud:${campaign.id}` : '';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [battleMode, setBattleMode] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<ActionGroup>>(new Set());
  const [section, setSection] = useState<HudSection>('overview');
  const [speakAs, setSpeakAs] = useState<SpeakAsDetail>({
    type: 'self',
    label: user?.displayName ?? 'You',
    imageUrl: user?.avatarUrl ?? null,
  });
  const [character, setCharacter] = useState<Character | null>(null);
  const [loadingCharacter, setLoadingCharacter] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [twTargetId, setTwTargetId] = useState('');
  const [twTargetPicking, setTwTargetPicking] = useState(false);
  const [twDistance, setTwDistance] = useState(3);
  const [twCpMax, setTwCpMax] = useState(1);
  const [twCpCurrent, setTwCpCurrent] = useState(1);
  const [twRosterCollapsed, setTwRosterCollapsed] = useState(false);

  const membership = campaign?.memberships?.find((entry) => entry.userId === user?.id);
  const characters = campaign?.characters ?? [];

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}') as {
        selectedId?: unknown;
        pinned?: unknown;
        battleMode?: unknown;
        collapsedGroups?: unknown;
        twTargetId?: unknown;
        twDistance?: unknown;
        twCpMax?: unknown;
        twCpCurrent?: unknown;
        twRosterCollapsed?: unknown;
      };
      if (typeof saved.selectedId === 'string') setSelectedId(saved.selectedId);
      setPinned(saved.pinned === true);
      setBattleMode(saved.battleMode === true);
      if (typeof saved.twTargetId === 'string') setTwTargetId(saved.twTargetId);
      if (typeof saved.twDistance === 'number' && Number.isFinite(saved.twDistance)) setTwDistance(Math.max(0, saved.twDistance));
      if (typeof saved.twCpMax === 'number' && Number.isFinite(saved.twCpMax)) setTwCpMax(Math.max(0, saved.twCpMax));
      if (typeof saved.twCpCurrent === 'number' && Number.isFinite(saved.twCpCurrent)) setTwCpCurrent(Math.max(0, saved.twCpCurrent));
      setTwRosterCollapsed(saved.twRosterCollapsed === true);
      if (Array.isArray(saved.collapsedGroups)) {
        setCollapsedGroups(new Set(
          saved.collapsedGroups.filter(
            (value): value is ActionGroup =>
              value === 'battle' || value === 'weapons' || value === 'abilities' || value === 'support',
          ),
        ));
      }
    } catch {
      // A broken local preference should never block the table.
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify({
      selectedId,
      pinned,
      battleMode,
      collapsedGroups: [...collapsedGroups],
      twTargetId,
      twDistance,
      twCpMax,
      twCpCurrent,
      twRosterCollapsed,
    }));
  }, [battleMode, collapsedGroups, pinned, selectedId, storageKey, twCpCurrent, twCpMax, twDistance, twRosterCollapsed, twTargetId]);

  useEffect(() => {
    const onRosterSelection = (event: Event) => {
      const characterId = (event as CustomEvent<{ characterId?: string }>).detail?.characterId;
      if (!characterId) return;
      setPinned(true);
      setSelectedId(characterId);
      setSection('overview');
    };
    window.addEventListener('smugvtt:character-selected', onRosterSelection);
    return () => window.removeEventListener('smugvtt:character-selected', onRosterSelection);
  }, []);

  useEffect(() => {
    const onMapCharacterSelection = (event: Event) => {
      const detail = (event as CustomEvent<{ characterId?: string; tokenId?: string; name?: string }>).detail;
      const characterId = detail?.characterId;
      const tokenId = detail?.tokenId;
      const sheetless = !characterId && !!tokenId && tokens.some(t => t.id === tokenId && isSheetlessSquadFodder(t));
      if (!characterId && !sheetless) return;

      // Target selection must not replace the acting sheet, including when
      // the target is an independent sheetless Fodder token.
      if (twTargetPicking) {
        if (characterId && characterId === selectedId) {
          setNotice('The acting unit cannot target itself here. Click another token.');
          return;
        }
        const nextTarget = sheetless ? `token:${tokenId}` : characterId!;
        setTwTargetId(nextTarget);
        setTwTargetPicking(false);
        window.dispatchEvent(new CustomEvent('smugvtt:tw-targeting', { detail: { active: false } }));
        window.dispatchEvent(new CustomEvent('smugvtt:tw-distance-request', {
          detail: { sourceCharacterId: selectedId, targetCharacterId: characterId, targetTokenId: tokenId },
        }));
        setNotice(detail?.name ? `Target selected: ${detail.name}` : 'Target selected from the map.');
        return;
      }

      if (pinned || !characterId) return;
      setSelectedId(characterId);
      setSection('overview');
    };
    window.addEventListener('smugvtt:map-character-selected', onMapCharacterSelection);
    return () => window.removeEventListener('smugvtt:map-character-selected', onMapCharacterSelection);
  }, [pinned, selectedId, twTargetPicking, tokens]);

  useEffect(() => {
    const onSpeakAs = (event: Event) => {
      const detail = (event as CustomEvent<SpeakAsDetail>).detail;
      if (!detail?.type || !detail.label) return;
      setSpeakAs(detail);
      if (!pinned) {
        setSelectedId(detail.type === 'character' && detail.id ? detail.id : null);
      }
    };

    window.addEventListener('smugvtt:speak-as-changed', onSpeakAs);
    window.dispatchEvent(new CustomEvent('smugvtt:speak-as-request'));
    return () => window.removeEventListener('smugvtt:speak-as-changed', onSpeakAs);
  }, [pinned]);

  useEffect(() => {
    const onRange = (event: Event) => {
      const detail = (event as CustomEvent<{ sourceCharacterId?: string; distance?: number }>).detail;
      if (detail?.sourceCharacterId !== selectedId || !Number.isFinite(detail?.distance)) return;
      setTwDistance(Math.max(0, detail?.distance ?? 0));
    };
    window.addEventListener('smugvtt:tw-distance-resolved', onRange);
    return () => window.removeEventListener('smugvtt:tw-distance-resolved', onRange);
  }, [selectedId]);

  const loadCharacter = useCallback(async (id: string | null) => {
    if (!id) {
      setCharacter(null);
      return;
    }
    setLoadingCharacter(true);
    setNotice(null);
    try {
      const result = await api.getCharacter(id);
      setCharacter(result.character);
    } catch {
      setCharacter(null);
      setNotice('Could not load that character.');
    } finally {
      setLoadingCharacter(false);
    }
  }, []);

  useEffect(() => {
    void loadCharacter(selectedId);
  }, [loadCharacter, selectedId]);

  useEffect(() => {
    if (!socket || !selectedId) return;
    const onCharacterUpdated = (data: { characterId?: string; character?: Character }) => {
      if (data.characterId !== selectedId) return;
      if (data.character) setCharacter((previous) => ({ ...data.character!, user: data.character!.user ?? previous?.user }));
      else void loadCharacter(selectedId);
    };
    socket.on('character.updated', onCharacterUpdated);
    socket.on('character.hp.updated', onCharacterUpdated);
    return () => {
      socket.off('character.updated', onCharacterUpdated);
      socket.off('character.hp.updated', onCharacterUpdated);
    };
  }, [loadCharacter, selectedId, socket]);

  const canControl = !!character && !!user && (
    userRole === 'DM' ||
    character.userId === user.id ||
    membership?.characterIds?.includes(character.id) === true
  );

  const characterData = asRecord(character?.data);
  const isSquadCommand = character?.gameSystem === 'SQUAD_COMMAND';
  const twData = useMemo(
    () => isSquadCommand && character
      ? normalizeSquadCommandData(character.data as SquadCommandCharacterData)
      : null,
    [character, isSquadCommand],
  );
  const theme = speakerThemeStyle(
    typeof characterData.themeColor === 'string' ? characterData.themeColor : undefined,
  );

  const selectedLabel = character?.name ?? speakAs.label;
  const selectedImage = character?.tokenImageUrl ?? (selectedId ? null : speakAs.imageUrl) ?? user?.avatarUrl ?? null;

  const manualSelect = (id: string) => {
    if (id && twTargetId && twTargetId !== id) {
      window.dispatchEvent(new CustomEvent('smugvtt:tw-distance-request', {
        detail: { sourceCharacterId: id,
          ...(twTargetId.startsWith('token:') ? { targetTokenId: twTargetId.slice(6) } : { targetCharacterId: twTargetId }) },
      }));
    }
    setPinned(true);
    setSelectedId(id || null);
    setSection('overview');
  };

  const togglePinned = () => {
    if (pinned) {
      setPinned(false);
      setSelectedId(speakAs.type === 'character' && speakAs.id ? speakAs.id : null);
    } else {
      setPinned(true);
    }
  };

  const toggleActionGroup = (group: ActionGroup) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const selectAsSpeaker = () => {
    if (!character) return;
    window.dispatchEvent(new CustomEvent('smugvtt:set-speak-as', {
      detail: { key: `character:${character.id}` },
    }));
  };

  const whisperOwner = () => {
    if (!character || !user || character.userId === user.id) return;
    window.dispatchEvent(new CustomEvent('smugvtt:whisper', {
      detail: { userId: character.userId },
    }));
  };

  const postMacro = async (title: string, body: string) => {
    if (!character || !socket || !user) return;
    setNotice(null);
    const answer = await socket.sendChatMessage({
      content: `***${title}***\n${body}`,
      type: userRole === 'DM' ? MessageType.DM : MessageType.PLAYER,
      clientId: shortClientId(),
      speakerType: 'character',
      speakerId: character.id,
      mode: 'ic',
    });
    if (answer.ok) {
      playChatChime(chatChimeFromCharacterData(character.data));
    } else {
      setNotice(answer.error || 'Could not post that macro.');
    }
  };

  // A character sheet can be displayed in a global modal outside CampaignProvider.
  // Answer a request only for a character in *this* campaign, and let backend
  // permissions remain authoritative for all subsequent character updates.
  useEffect(() => {
    const onContextRequest = (event: Event) => {
      const detail = (event as CustomEvent<{
        characterId?: string;
        respond?: (snapshot: {
          isDm: boolean;
          characters: { id: string; name: string; gameSystem?: string | null }[];
          report?: (title: string, body: string) => Promise<void>;
        }) => void;
      }>).detail;
      const requestedId = detail?.characterId;
      if (!requestedId || typeof detail.respond !== 'function' ||
        !campaign?.characters?.some((entry) => entry.id === requestedId)) return;
      const reply = detail.respond;
      reply({
        isDm: userRole === 'DM',
        characters: campaign.characters.map((entry) => ({
          id: entry.id, name: entry.name, gameSystem: entry.gameSystem,
        })),
        report: async (title: string, body: string) => {
          if (!socket || !user) throw new Error('Campaign chat is unavailable.');
          const answer = await socket.sendChatMessage({
            content: `***${title}***\n${body}`,
            type: userRole === 'DM' ? MessageType.DM : MessageType.PLAYER,
            clientId: shortClientId(),
            speakerType: 'character',
            speakerId: requestedId,
            mode: 'ic',
          });
          if (!answer.ok) throw new Error(answer.error || 'Could not post special ability to chat.');
        },
      });
    };
    window.addEventListener('smugvtt:tw-ability-context-request', onContextRequest);
    return () => window.removeEventListener('smugvtt:tw-ability-context-request', onContextRequest);
  }, [campaign, userRole, socket, user]);

  const saveTwBattle = async (
    transform: (data: SquadCommandCharacterData) => SquadCommandCharacterData,
  ): Promise<boolean> => {
    if (!character || !canControl || !twData) return false;
    setWorking(true);
    setNotice(null);
    try {
      const next = normalizeSquadCommandData(transform(twData));
      const result = await api.updateCharacter(character.id, {
        data: next as CharacterData,
        updatedAt: character.updatedAt,
      });
      setCharacter(result.character);
      return true;
    } catch {
      setNotice('The battle action could not be saved. Reopen the character if it changed elsewhere.');
      return false;
    } finally {
      setWorking(false);
    }
  };


  const commitTwPair = async (
    sourceBefore: SquadCommandCharacterData,
    target: Character,
    result: ReturnType<typeof resolveWeaponAction>,
  ) => {
    if (!character) throw new Error('No source character selected.');
    let sourceSaved: Awaited<ReturnType<typeof api.updateCharacter>> | null = null;
    try {
      sourceSaved = await api.updateCharacter(character.id, { data: result.source as CharacterData, updatedAt: character.updatedAt });
      await api.updateCharacter(target.id, { data: result.target as CharacterData, updatedAt: target.updatedAt });
      setCharacter(sourceSaved.character);
      return sourceSaved.character;
    } catch (error) {
      if (sourceSaved) {
        try {
          const rolledBack = await api.updateCharacter(character.id, { data: sourceBefore as CharacterData, updatedAt: sourceSaved.character.updatedAt });
          setCharacter(rolledBack.character);
        } catch {
          throw new Error('TW_PAIR_ROLLBACK_FAILED');
        }
      }
      throw error;
    }
  };

  type LiveTwTarget =
    | { kind: 'sheet'; character: Character; data: SquadCommandCharacterData }
    | { kind: 'token'; token: import('@/types').Token; data: SquadCommandCharacterData };

  const loadLiveTwTarget = async (id: string): Promise<LiveTwTarget> => {
    if (id.startsWith('token:')) {
      const token = tokens.find(t => t.id === id.slice(6));
      if (!token || !isSheetlessSquadFodder(token)) throw new Error('Target Fodder token is missing or unavailable. Select it again.');
      const data = readSheetlessSquadFodder(token);
      if (!data) throw new Error('Target Fodder combat state is unavailable.');
      if (!campaign?.id || !tokenMapId) throw new Error('The active campaign map is unavailable.');
      return { kind: 'token', token, data };
    }
    const target = (await api.getCharacter(id)).character;
    if (target.gameSystem !== 'SQUAD_COMMAND') throw new Error('Target has no compatible combat profile.');
    return { kind: 'sheet', character: target, data: normalizeSquadCommandData(target.data as SquadCommandCharacterData) };
  };

  const commitTwLiveTarget = async (
    sourceBefore: SquadCommandCharacterData,
    target: LiveTwTarget,
    result: ReturnType<typeof resolveWeaponAction>,
  ) => {
    if (target.kind === 'sheet') return commitTwPair(sourceBefore, target.character, result);
    if (!character || !campaign?.id || !tokenMapId) throw new Error('The active map or source character is unavailable.');
    let updatedSource: Character | null = null;
    try {
      const response = await api.updateCharacter(character.id, {
        data: result.source as CharacterData, updatedAt: character.updatedAt,
      });
      updatedSource = response.character;
      const tokenAnswer = await api.updateToken(campaign.id, tokenMapId, target.token.id, {
        metadata: snapshotForToken(result.target, target.token.metadata ?? {}),
        hp: tokenHpFor(result.target),
      });
      if (!tokenAnswer.token) throw new Error('Target token update was not returned.');
      useGameStore.getState().patchToken(target.token.id, tokenAnswer.token, tokenMapId);
      setCharacter(updatedSource);
      return updatedSource;
    } catch (error) {
      if (updatedSource) {
        try {
          const rolledBack = await api.updateCharacter(character.id, {
            data: sourceBefore as CharacterData, updatedAt: updatedSource.updatedAt,
          });
          setCharacter(rolledBack.character);
        } catch { throw new Error('TW_PAIR_ROLLBACK_FAILED'); }
      }
      throw error;
    }
  };

  const battlefieldContextFor = (target: LiveTwTarget) => {
    if (target.kind !== 'token') return {};
    const map = campaign?.maps?.find(entry => entry.id === tokenMapId);
    if (!map) return {};
    const zones = mapDrawings.filter(d => !!d.zoneType);
    const at = effectsForToken(zones, target.token, map.gridSize, map.height);
    return { targetCover: at.cover, targetObscured: at.obscured };
  };

  const resolveTwWeaponLive = async (weapon: NonNullable<SquadCommandCharacterData['weapons']>[number]) => {
    if (!character || !twData || !canControl) return;
    const body = [
      `Damage **${weapon.damage}** • Acc **${weapon.accuracy >= 0 ? '+' : ''}${weapon.accuracy}** • AP **${weapon.ap}**`,
      `Range ${weapon.range}`,
      weapon.traits ?? weapon.special ?? '',
    ].filter(Boolean).join('\n');

    if (userRole !== 'DM') {
      await postMacro(weapon.name, `${body}\n\n*Player action posted; live target mutation is GM-authoritative in this build.*`);
      return;
    }
    if (!twTargetId) { setNotice('Choose a Squad Command target before resolving the action.'); return; }
    if (twTargetId === character.id) { setNotice('Choose a different target for live resolution.'); return; }

    setWorking(true); setNotice(null);
    try {
      const target = await loadLiveTwTarget(twTargetId);
      const targetData = target.data;
      const actionMode = nextActionMode(twData);
      if (!actionMode) { setNotice('No action remains in this activation. Start a new activation or correct the action state.'); return; }
      if (actionMode === 'push' && twCpCurrent <= 0) { setNotice('No Command Points remain in the local GM CP tracker.'); return; }

      const result = resolveWeaponAction(twData, targetData, weapon.id, {
        distance: twDistance, actionMode, ...battlefieldContextFor(target),
      });
      if (!result.ok) { setNotice(result.summary || 'Action was not legal.'); return; }

      await commitTwLiveTarget(twData, target, result);
      if (actionMode === 'push') setTwCpCurrent((value) => Math.max(0, value - 1));
      await postMacro(result.title, formatCombatResult(result));
    } catch (error) {
      setNotice(error instanceof Error && error.message === 'TW_PAIR_ROLLBACK_FAILED'
        ? 'Target save failed and automatic source rollback also failed. Reopen both characters and verify resources before continuing.'
        : 'Live combat resolution could not be committed. The source was rolled back when possible; reopen source/target if either changed elsewhere.');
    } finally {
      setWorking(false);
    }
  };

  const activateTwAbilityLive = async (abilityId: string) => {
    if (!twData || !canControl || !character) return;
    const ability = (twData.abilities ?? []).find((entry) => entry.id === abilityId);
    if (!ability) return;
    if (!isTargetedAbility(abilityId)) {
      await saveTwBattle((data) => activateAbility(data, abilityId));
      return;
    }
    if (userRole !== 'DM') {
      await postMacro(ability.name, `${ability.rules ?? 'Targeted ability.'}\n\n*Targeted live mutation is GM-authoritative in this build.*`);
      return;
    }
    if (!twTargetId) { setNotice(`Choose a Squad Command target before using ${ability.name}.`); return; }
    setWorking(true); setNotice(null);
    try {
      const target = await loadLiveTwTarget(twTargetId);
      const targetData = target.data;
      const result = resolveTargetedAbility(twData, targetData, abilityId, twDistance);
      if (!result.ok) { setNotice(result.summary || 'Targeted ability was not legal.'); return; }
      await commitTwLiveTarget(twData, target, result);
      await postMacro(result.title, formatCombatResult(result));
    } catch (error) {
      setNotice(error instanceof Error && error.message === 'TW_PAIR_ROLLBACK_FAILED'
        ? 'Target save failed and automatic source rollback also failed. Reopen both characters and verify resources before continuing.'
        : 'Targeted ability could not be committed. The source was rolled back when possible; reopen source/target if either changed elsewhere.');
    } finally {
      setWorking(false);
    }
  };

  const resolveSpecialAgainstToken = async (abilityId: string, tokenId: string, range: number) => {
    if (!character || !twData || userRole !== 'DM') throw new Error('GM control is required.');
    const target = await loadLiveTwTarget(`token:${tokenId}`);
    if (target.kind !== 'token') throw new Error('Target is not sheetless Fodder.');
    const actionMode = nextActionMode(twData);
    if (!actionMode) throw new Error('No eligible combat action remains.');
    if (actionMode === 'push' && twCpCurrent <= 0) throw new Error('No Command Points remain.');
    const result = resolveSquadSpecialAbility(twData, target.data, abilityId, { distance: range, actionMode }, false);
    if (!result.ok) throw new Error(result.summary);
    await commitTwLiveTarget(twData, target, result);
    if (actionMode === 'push') setTwCpCurrent(v => Math.max(0, v - 1));
    await postMacro(result.title, formatCombatResult(result));
    if (abilityId === 'orbital_rail_cannon') {
      window.dispatchEvent(new CustomEvent('smugvtt:tw-orbital-fire', {
        detail: { targetTokenId: tokenId, sourceCharacterId: character.id },
      }));
    }
    if (abilityId === 'medic') {
      window.dispatchEvent(new CustomEvent('smugvtt:tw-medic-withdraw', { detail: { targetTokenId: tokenId } }));
    }
    return result.title;
  };

  const updateTwField = async (patch: Parameters<typeof setBattlefieldState>[1]) => {
    await saveTwBattle((data) => setBattlefieldState(data, patch));
  };

  const renderTwQuickActions = () => {
    if (!twData) return (
      <div className="rounded-cozy border border-ink/10 bg-ink/5 p-3 text-xs text-ink-muted">
        This sheet does not expose SmugVTT quick actions yet.
      </div>
    );

    const battle = twData.battle!;
    const weapons = twData.weapons ?? [];
    const attackWeapons = weapons.filter((weapon) => !weapon.kind || weapon.kind === 'attack');
    const supportWeapons = weapons.filter((weapon) => weapon.kind && weapon.kind !== 'attack');
    const abilities = (twData.abilities ?? []).filter((entry) => !isSquadSpecialAbility(entry.id));

    const groupHeader = (group: ActionGroup, label: string, count?: number) => {
      const collapsed = collapsedGroups.has(group);
      return (
        <button
          type="button"
          className="mb-1.5 flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted hover:bg-ink/5 hover:text-ink"
          onClick={() => toggleActionGroup(group)}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          <span>{label}</span>
          {typeof count === 'number' && <span className="ml-auto rounded-full bg-ink/5 px-1.5 py-0.5 text-[10px]">{count}</span>}
        </button>
      );
    };

    const liveActionMode = nextActionMode(twData);
    const profileIssues = validateCombatProfile(twData);

    const renderWeapon = (weapon: (typeof weapons)[number]) => {
      const unavailableReason = weaponUnavailableReason(twData, weapon, { distance: twDistance, actionMode: liveActionMode ?? 'none' });
      const resource = [
        weapon.ammoMax ? `Ammo ${weapon.ammoCurrent ?? 0}/${weapon.ammoMax}` : '',
        weapon.cooldownMax ? `CD ${weapon.cooldownCurrent ?? 0}/${weapon.cooldownMax}` : '',
      ].filter(Boolean).join(' • ');
      const overwatchArmed = battle.battlefield.overwatch.active && battle.battlefield.overwatch.weaponId === weapon.id;
      return (
        <div key={weapon.id} className="rounded-cozy border border-ink/10 bg-paper px-2.5 py-2 text-sm text-ink">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-semibold">{weapon.name}</span>
            {unavailableReason && <span className="shrink-0 text-[10px] text-danger-ink">{unavailableReason}</span>}
          </div>
          <span className="block truncate text-[11px] text-ink-muted">{weapon.damage} • {weapon.range}{resource ? ` • ${resource}` : ''}</span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Button size="sm" disabled={working || Boolean(unavailableReason)} onClick={() => void resolveTwWeaponLive(weapon)}>
              {userRole === 'DM' ? (liveActionMode === 'push' ? 'Resolve (Push)' : 'Resolve') : 'Post Action'}
            </Button>
            {weapon.canOverwatch && canControl && (
              <Button size="sm" variant="secondary" disabled={working || Boolean(unavailableReason)} onClick={() => void saveTwBattle((data) => overwatchArmed ? cancelOverwatch(data) : armOverwatch(data, weapon.id))}>
                {overwatchArmed ? 'Cancel OW' : 'Arm OW'}
              </Button>
            )}
            {weapon.ammoMax && canControl && (
              <Button size="sm" variant="secondary" disabled={working || weapon.ammoCurrent === weapon.ammoMax || weapon.id === 'seeker' || weapon.id === 'frag_grenade'} onClick={() => void saveTwBattle((data) => reloadWeapon(data, weapon.id))}>
                Reload
              </Button>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-2.5">
        {canControl && (
          <div>
            {groupHeader('battle', 'Battle')}
            {!collapsedGroups.has('battle') && (
              <div className="space-y-2">
                {userRole === 'DM' && (
                  <div className="grid grid-cols-[1fr_72px] gap-1.5">
                    <div className="flex min-w-0 gap-1">
                      <button
                        type="button"
                        className={`input-cozy flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-xs ${twTargetPicking ? 'ring-2 ring-accent/40' : ''}`}
                        onClick={() => {
                          if (!twTargetPicking) setPinned(true);
                          setTwTargetPicking((value) => {
                            window.dispatchEvent(new CustomEvent('smugvtt:tw-targeting', { detail: { active: !value } }));
                            return !value;
                          });
                          setNotice(null);
                        }}
                        aria-pressed={twTargetPicking}
                        title="Choose any compatible character or sheetless Fodder token on the map"
                      >
                        <Crosshair className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {twTargetPicking
                            ? 'Click target on map…'
                            : twTargetId
                              ? `Target: ${twTargetId.startsWith('token:')
                                ? tokens.find((entry) => entry.id === twTargetId.slice(6))?.name ?? 'Fodder token'
                                : characters.find((entry) => entry.id === twTargetId)?.name ?? 'Map unit'}`
                              : 'Select Target'}
                        </span>
                      </button>
                      {twTargetId && (
                        <button
                          type="button"
                          className="rounded-cozy border border-ink/10 bg-paper px-2 text-[10px] text-ink-muted hover:bg-ink/5 hover:text-ink"
                          onClick={() => { setTwTargetId(''); setTwTargetPicking(false); }}
                          title="Clear target"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <input className="input-cozy py-1 text-center text-xs" type="number" min={0} max={99} value={twDistance} onChange={(e) => setTwDistance(Math.max(0, Number(e.target.value) || 0))} title="Target distance in spaces" aria-label="Target distance" />
                  </div>
                )}
                {userRole === 'DM' && (
                  <div className="flex items-center gap-1.5 rounded bg-ink/5 px-2 py-1 text-[11px] text-ink-secondary">
                    <span className="font-semibold">CP</span>
                    <button type="button" className="rounded bg-paper px-1.5 py-0.5" onClick={() => setTwCpCurrent((v) => Math.max(0, v - 1))}>−</button>
                    <span>{twCpCurrent}/{twCpMax}</span>
                    <button type="button" className="rounded bg-paper px-1.5 py-0.5" onClick={() => setTwCpCurrent((v) => Math.min(twCpMax, v + 1))}>+</button>
                    <button type="button" className="ml-auto rounded bg-paper px-1.5 py-0.5" onClick={() => { const next = Math.max(0, twCpMax + 1); setTwCpMax(next); setTwCpCurrent(next); }}>Max +</button>
                    <button type="button" className="rounded bg-paper px-1.5 py-0.5" onClick={() => { const next = Math.max(0, twCpMax - 1); setTwCpMax(next); setTwCpCurrent(Math.min(twCpCurrent, next)); }}>Max −</button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  {!battle.active ? (
                    <Button size="sm" disabled={working} onClick={() => void saveTwBattle(startBattle)}>Start Battle</Button>
                  ) : (
                    <>
                      <Button size="sm" variant="secondary" disabled={working} onClick={() => void saveTwBattle(startActivation)}>Activation</Button>
                      <Button size="sm" variant="secondary" disabled={working} onClick={() => void (async () => { if (await saveTwBattle(nextRound)) setTwCpCurrent(twCpMax); })()}>Next Round</Button>
                      <Button size="sm" variant="secondary" disabled={working || battle.actionsThisActivation > battle.pushesThisActivation || battle.actionsThisActivation >= 3} onClick={() => void saveTwBattle((data) => recordAction(data, false))}>Free Action</Button>
                      <Button size="sm" variant="secondary" disabled={working || battle.pushesThisActivation >= 2 || battle.actionsThisActivation >= 3 || (userRole === 'DM' && twCpCurrent <= 0)} onClick={() => void (async () => { const ok = await saveTwBattle((data) => recordAction(data, true)); if (ok && userRole === 'DM') setTwCpCurrent((v) => Math.max(0, v - 1)); })()}>Push</Button>
                      <Button size="sm" variant="secondary" disabled={working} onClick={() => void saveTwBattle(refreshUnit)}>Refresh</Button>
                      <Button size="sm" variant="secondary" disabled={working || battle.rallyUsed || (twData.stats?.suppression ?? 0) === 0} onClick={() => void saveTwBattle((data) => performRally(data, false))}>Rally</Button>
                      <Button size="sm" variant="secondary" disabled={working} onClick={() => { if (window.confirm('Reset per-battle uses and cooldowns? HP, Shield and ammo are preserved.')) void saveTwBattle(battleReset); }}>Battle Reset</Button>
                      <Button size="sm" variant="danger" disabled={working} onClick={() => void saveTwBattle(endBattle)}>End Battle</Button>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <button type="button" className={`rounded px-1.5 py-1 ${battle.battlefield.cover === 1 ? 'bg-accent text-accent-text' : 'bg-ink/5 text-ink-secondary'}`} onClick={() => void updateTwField({ cover: battle.battlefield.cover === 1 ? 0 : 1 })}>Light Cover</button>
                  <button type="button" className={`rounded px-1.5 py-1 ${battle.battlefield.cover === 2 ? 'bg-accent text-accent-text' : 'bg-ink/5 text-ink-secondary'}`} onClick={() => void updateTwField({ cover: battle.battlefield.cover === 2 ? 0 : 2 })}>Heavy Cover</button>
                  <button type="button" className={`rounded px-1.5 py-1 ${battle.battlefield.prone ? 'bg-accent text-accent-text' : 'bg-ink/5 text-ink-secondary'}`} onClick={() => void updateTwField({ prone: !battle.battlefield.prone })}>Prone</button>
                  <button type="button" className={`rounded px-1.5 py-1 ${battle.battlefield.highGround ? 'bg-accent text-accent-text' : 'bg-ink/5 text-ink-secondary'}`} onClick={() => void updateTwField({ highGround: !battle.battlefield.highGround })}>High Ground</button>
                  <button type="button" className={`rounded px-1.5 py-1 ${battle.battlefield.obscured ? 'bg-accent text-accent-text' : 'bg-ink/5 text-ink-secondary'}`} onClick={() => void updateTwField({ obscured: !battle.battlefield.obscured })}>Obscured</button>
                  <button type="button" className={`rounded px-1.5 py-1 ${battle.battlefield.poorVisibility ? 'bg-accent text-accent-text' : 'bg-ink/5 text-ink-secondary'}`} onClick={() => void updateTwField({ poorVisibility: !battle.battlefield.poorVisibility })}>Poor Vis.</button>
                </div>
                {userRole === 'DM' && twData.stats && (
                  <div className="rounded border border-ink/10 bg-ink/5 p-1.5">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">GM Override</div>
                    <div className="grid grid-cols-3 gap-1 text-[10px]">
                      <button type="button" className="rounded bg-paper px-1.5 py-1" onClick={() => void saveTwBattle((d) => gmAdjust(d, { hpCurrent: (d.stats?.hpCurrent ?? 0) - 1 }, 'GM HP -1'))}>HP −1</button>
                      <button type="button" className="rounded bg-paper px-1.5 py-1" onClick={() => void saveTwBattle((d) => gmAdjust(d, { hpCurrent: (d.stats?.hpCurrent ?? 0) + 1 }, 'GM HP +1'))}>HP +1</button>
                      <button type="button" className="rounded bg-paper px-1.5 py-1" onClick={() => void saveTwBattle((d) => gmAdjust(d, { suppression: Math.min(3, (d.stats?.suppression ?? 0) + 1) }, 'GM Suppression +1'))}>Supp +1</button>
                      <button type="button" className="rounded bg-paper px-1.5 py-1" onClick={() => void saveTwBattle((d) => gmAdjust(d, { suppression: Math.max(0, (d.stats?.suppression ?? 0) - 1) }, 'GM Suppression -1'))}>Supp −1</button>
                      <button type="button" className="rounded bg-paper px-1.5 py-1" disabled={(twData.stats.shieldMax ?? 0) <= 0} onClick={() => void saveTwBattle((d) => gmAdjust(d, { shieldCurrent: (d.stats?.shieldCurrent ?? 0) - 1 }, 'GM Shield -1'))}>SH −1</button>
                      <button type="button" className="rounded bg-paper px-1.5 py-1" disabled={(twData.stats.shieldMax ?? 0) <= 0} onClick={() => void saveTwBattle((d) => gmAdjust(d, { shieldCurrent: (d.stats?.shieldCurrent ?? 0) + 1 }, 'GM Shield +1'))}>SH +1</button>
                    </div>
                  </div>
                )}
                {profileIssues.length > 0 && <div className="rounded bg-warning/10 px-2 py-1 text-[10px] text-warning-ink">Profile: {profileIssues[0].message}{profileIssues.length > 1 ? ` (+${profileIssues.length - 1})` : ''}</div>}
              </div>
            )}
          </div>
        )}

        {attackWeapons.length > 0 && (
          <div>
            {groupHeader('weapons', 'Weapons', attackWeapons.length)}
            {!collapsedGroups.has('weapons') && <div className="grid gap-1.5">{attackWeapons.map(renderWeapon)}</div>}
          </div>
        )}

        {character && canControl && <SquadSpecialAbilityPanel
          character={character}
          data={twData}
          canControl={canControl}
          targetId={twTargetId}
          distance={twDistance}
          onResolveSheetlessTarget={resolveSpecialAgainstToken}
          onCommitted={(updated) => setCharacter(updated)}
          onReport={postMacro}
          onNotice={setNotice}
          onChooseTarget={() => setPinned(true)}
          availableCp={twCpCurrent}
          onSpendCp={() => setTwCpCurrent((value) => Math.max(0, value - 1))}
          isDm={userRole === 'DM'}
          campaignCharacters={characters}
        />}

        {abilities.length > 0 && (
          <div>
            {groupHeader('abilities', 'Abilities', abilities.length)}
            {!collapsedGroups.has('abilities') && (
              <div className="grid gap-1.5">
                {abilities.map((ability) => {
                  const unavailableReason = abilityUnavailableReason(twData, ability.id);
                  const resource = [
                    ability.usesMax ? `Uses ${ability.usesCurrent ?? 0}/${ability.usesMax}` : '',
                    ability.cooldownMax ? `CD ${ability.cooldownCurrent ?? 0}/${ability.cooldownMax}` : '',
                  ].filter(Boolean).join(' • ');
                  return (
                    <button
                      key={ability.id}
                      type="button"
                      disabled={!!unavailableReason}
                      title={unavailableReason ?? `Use / reference ${ability.name}`}
                      onClick={() => void activateTwAbilityLive(ability.id)}
                      className="rounded-cozy border border-ink/10 bg-paper px-2.5 py-2 text-left text-sm text-ink transition-colors hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-semibold">{ability.name}</span>
                        {unavailableReason && <span className="shrink-0 text-[10px] text-danger-ink">{unavailableReason}</span>}
                      </span>
                      {resource && <span className="block truncate text-[11px] text-ink-muted">{resource}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {supportWeapons.length > 0 && (
          <div>
            {groupHeader('support', 'Support', supportWeapons.length)}
            {!collapsedGroups.has('support') && <div className="grid gap-1.5">{supportWeapons.map(renderWeapon)}</div>}
          </div>
        )}
      </div>
    );
  };

  const bio = firstText(characterData, ['bio', 'backstory', 'background', 'description', 'personality']);
  const notes = typeof characterData.notes === 'string' ? characterData.notes.trim() : '';
  const statsObject = asRecord(characterData.stats);
  const statEntries = Object.entries(statsObject)
    .filter(([, value]) => typeof value === 'number' || typeof value === 'string')
    .slice(0, 12);

  const shortcuts = character && (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => setShowSheet(true)}
        className="inline-flex items-center gap-1.5 rounded-cozy border border-ink/15 bg-paper px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink/5 hover:text-ink"
      >
        <BookOpen className="h-3.5 w-3.5" /> Sheet / Stats
      </button>
      {canControl && (
        <button
          type="button"
          onClick={() => setShowEditor(true)}
          className="inline-flex items-center gap-1.5 rounded-cozy border border-ink/15 bg-paper px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink/5 hover:text-ink"
        >
          <Edit3 className="h-3.5 w-3.5" /> Edit
        </button>
      )}
      <button
        type="button"
        onClick={() => setSection('bio')}
        className="inline-flex items-center gap-1.5 rounded-cozy border border-ink/15 bg-paper px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink/5 hover:text-ink"
      >
        <UserRound className="h-3.5 w-3.5" /> Bio
      </button>
      <button
        type="button"
        onClick={() => setSection('notes')}
        className="inline-flex items-center gap-1.5 rounded-cozy border border-ink/15 bg-paper px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink/5 hover:text-ink"
      >
        <ScrollText className="h-3.5 w-3.5" /> Notes
      </button>
      {canControl && (
        <button
          type="button"
          onClick={selectAsSpeaker}
          className="inline-flex items-center gap-1.5 rounded-cozy border border-ink/15 bg-paper px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink/5 hover:text-ink"
        >
          <MessageCircle className="h-3.5 w-3.5" /> Speak As
        </button>
      )}
      {character.userId !== user?.id && (
        <button
          type="button"
          onClick={whisperOwner}
          className="inline-flex items-center gap-1.5 rounded-cozy border border-ink/15 bg-paper px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-ink/5 hover:text-ink"
        >
          <MessageCircle className="h-3.5 w-3.5" /> Whisper
        </button>
      )}
    </div>
  );

  const statusStrip = isSquadCommand && twData?.stats ? (
    <div className={`mt-2 flex flex-wrap gap-1 ${battleMode ? 'text-xs' : 'text-[11px]'}`}>
      <span className={`rounded-full px-2 py-0.5 font-semibold ${
        twData.battle?.downed ? 'bg-danger/15 text-danger-ink' : 'bg-ink/5 text-ink-secondary'
      }`}>
        HP {twData.stats.hpCurrent}/{twData.stats.hpMax}
      </span>
      {twData.stats.shieldMax > 0 && (
        <span className="rounded-full bg-accent/10 px-2 py-0.5 font-semibold text-accent-ink">
          Shield {twData.stats.shieldCurrent}/{twData.stats.shieldMax}
        </span>
      )}
      <span className={`rounded-full px-2 py-0.5 font-semibold ${
        twData.stats.suppression >= 3 ? 'bg-danger/15 text-danger-ink' : twData.stats.suppression > 0 ? 'bg-warning/15 text-warning-ink' : 'bg-ink/5 text-ink-secondary'
      }`}>
        Supp {twData.stats.suppression}
      </span>
      {twData.battle?.downed && (
        <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 font-bold text-danger-ink">
          <ShieldAlert className="h-3 w-3" /> Downed
        </span>
      )}
      {twData.battle?.active && (
        <span className="rounded-full bg-brand-ink/10 px-2 py-0.5 font-semibold text-brand-ink">
          R{twData.battle.round} • A{twData.battle.activation}
        </span>
      )}
    </div>
  ) : null;

  const infoPanel = character && (
    <div className="rounded-cozy border border-ink/10 bg-ink/5 p-3 text-sm">
      {section === 'overview' && (
        <div className="space-y-1 text-ink-secondary">
          <div><span className="font-medium text-ink">System:</span> {systemLabel(character.gameSystem)}</div>
          {character.user?.displayName && <div><span className="font-medium text-ink">Player:</span> {character.user.displayName}</div>}
          {isSquadCommand && twData && (
            <>
              <div><span className="font-medium text-ink">Faction:</span> {displayLabel(twData.faction)}</div>
              <div><span className="font-medium text-ink">Profile:</span> {displayLabel(twData.profile)}{twData.branch ? ` • ${displayLabel(twData.branch)}` : ''}</div>
              <div><span className="font-medium text-ink">Source:</span> {twData.profileSource?.status === 'source-locked' ? 'Source locked' : twData.profileSource?.status === 'custom' ? 'Custom' : 'Canonical'} • Rev {twData.profileRevision ?? '—'}</div>
            </>
          )}
        </div>
      )}
      {section === 'bio' && <p className="whitespace-pre-wrap text-ink-secondary">{bio || 'No public bio field is recorded on this sheet yet.'}</p>}
      {section === 'notes' && (
        canControl
          ? <p className="whitespace-pre-wrap text-ink-secondary">{notes || 'No character notes recorded.'}</p>
          : <div className="flex items-center gap-2 text-ink-muted"><Lock className="h-4 w-4" /> Notes are only shown to a controller or GM.</div>
      )}
      {section === 'stats' && (
        statEntries.length > 0
          ? <div className="grid grid-cols-2 gap-1.5">
              {statEntries.map(([key, value]) => (
                <div key={key} className="rounded bg-paper px-2 py-1">
                  <div className="text-[10px] uppercase tracking-wide text-ink-muted">{displayLabel(key)}</div>
                  <div className="font-semibold text-ink">{String(value)}</div>
                </div>
              ))}
            </div>
          : <p className="text-ink-muted">No compact stats are exposed by this sheet.</p>
      )}
    </div>
  );

  const gmTwRoster = userRole === 'DM' && battleMode ? (
    <section className="rounded-cozy border border-ink/10 bg-paper p-3">
      <div className={twRosterCollapsed ? 'flex items-center justify-between' : 'mb-2 flex items-center justify-between'}>
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 text-left text-sm font-bold text-ink hover:text-accent-ink"
          onClick={() => setTwRosterCollapsed((value) => !value)}
          aria-expanded={!twRosterCollapsed}
        >
          {twRosterCollapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          <span className="truncate">Squad Command Combat Roster</span>
        </button>
        <span className="text-[10px] text-ink-muted">GM compact view</span>
      </div>
      {!twRosterCollapsed && (
        <div className="grid gap-1">
          {characters.map((entry) => {
            const rosterCharacter = entry as Character;
            if (rosterCharacter.gameSystem !== 'SQUAD_COMMAND') return null;
            const data = normalizeSquadCommandData(rosterCharacter.data as SquadCommandCharacterData);
            const stats = data.stats;
            return (
              <button key={entry.id} type="button" onClick={() => manualSelect(entry.id)} className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] ${selectedId === entry.id ? 'bg-accent/15 text-ink' : 'bg-ink/5 text-ink-secondary hover:bg-ink/10'}`}>
                <span className="min-w-0 flex-1 truncate font-semibold">{entry.name}</span>
                {stats && <><span>HP {stats.hpCurrent}/{stats.hpMax}</span>{stats.shieldMax > 0 && <span>SH {stats.shieldCurrent}</span>}<span className={stats.suppression >= 3 ? 'font-bold text-danger-ink' : ''}>S{stats.suppression}</span></>}
                {data.battle?.battlefield.overwatch.active && <span className="text-info-ink">OW</span>}
                {data.battle?.battlefield.wrecked && <span className="font-bold text-danger-ink">WRECK</span>}
                {data.battle?.downed && <span className="font-bold text-danger-ink">DOWN</span>}
              </button>
            );
          })}
        </div>
      )}
    </section>
  ) : null;

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-cozy border border-ink/10 bg-paper shadow-sm">
        <div
          className="h-1.5"
          style={{ backgroundColor: character ? theme.backgroundColor : '#466f9f' }}
        />
        <div className="p-3">
          <div className="mb-2 flex items-center gap-2">
            <select
              className="input-cozy min-w-0 flex-1 py-1.5 text-sm"
              value={selectedId ?? ''}
              onChange={(event) => manualSelect(event.target.value)}
              aria-label="Selected character"
            >
              <option value="">Current Speak As / Self</option>
              {characters.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={togglePinned}
              className="rounded-cozy border border-ink/10 bg-paper p-2 text-ink-secondary hover:bg-ink/5 hover:text-ink"
              title={pinned ? 'Unpin and follow Speak As' : 'Pin this selection'}
              aria-label={pinned ? 'Unpin selected character' : 'Pin selected character'}
            >
              {pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
            </button>
          </div>

          {battleMode ? (
            <div className="flex items-start gap-3">
              <button
                type="button"
                disabled={!character}
                onClick={() => character && setShowSheet(true)}
                className={`h-24 w-20 shrink-0 overflow-hidden rounded-cozy border border-ink/10 bg-ink/5 text-left transition-all ${
                  character ? 'cursor-pointer hover:ring-2 hover:ring-accent/30' : 'cursor-default'
                }`}
                title={character ? 'Open full character sheet' : undefined}
                aria-label={character ? `Open ${character.name} sheet` : undefined}
              >
                {selectedImage ? (
                  <img src={selectedImage} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-ink-muted">
                    {selectedLabel.trim().charAt(0).toUpperCase() || '?'}
                  </div>
                )}
              </button>

              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold text-ink">{selectedLabel}</h2>
                <p className="truncate text-xs text-ink-muted">
                  {character ? systemLabel(character.gameSystem) : speakAs.type === 'self' ? 'Standard / default identity' : displayLabel(speakAs.type)}
                </p>
                {character && (
                  <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    canControl ? 'bg-success/10 text-success-ink' : 'bg-ink/5 text-ink-muted'
                  }`}>
                    {canControl ? 'You control this' : 'Read only'}
                  </span>
                )}
                {statusStrip}
                {loadingCharacter && <p className="mt-1 text-xs text-ink-muted">Loading…</p>}
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger-ink transition-colors"
                  onClick={() => setBattleMode(false)}
                  aria-pressed="true"
                >
                  <Swords className="h-3.5 w-3.5" />
                  Battle HUD
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button
                type="button"
                disabled={!character}
                onClick={() => character && setShowSheet(true)}
                className={`mx-auto block h-72 w-full overflow-hidden rounded-cozy border border-ink/10 bg-ink/5 text-left transition-all ${
                  character ? 'cursor-pointer hover:ring-2 hover:ring-accent/30' : 'cursor-default'
                }`}
                title={character ? 'Open full character sheet' : undefined}
                aria-label={character ? `Open ${character.name} sheet` : undefined}
              >
                {selectedImage ? (
                  <img src={selectedImage} alt="" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-5xl font-semibold text-ink-muted">
                    {selectedLabel.trim().charAt(0).toUpperCase() || '?'}
                  </div>
                )}
              </button>

              <div className="mt-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold text-ink">{selectedLabel}</h2>
                    <p className="truncate text-xs text-ink-muted">
                      {character ? systemLabel(character.gameSystem) : speakAs.type === 'self' ? 'Standard / default identity' : displayLabel(speakAs.type)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ink/10 bg-ink/5 px-2.5 py-1 text-xs font-semibold text-ink-secondary transition-colors hover:bg-ink/10"
                    onClick={() => setBattleMode(true)}
                    aria-pressed="false"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Normal
                  </button>
                </div>
                {character && (
                  <span className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    canControl ? 'bg-success/10 text-success-ink' : 'bg-ink/5 text-ink-muted'
                  }`}>
                    {canControl ? 'You control this' : 'Read only'}
                  </span>
                )}
                {statusStrip}
                {loadingCharacter && <p className="mt-1 text-xs text-ink-muted">Loading…</p>}
              </div>
            </div>
          )}

          {notice && <div className="mt-2 rounded-cozy bg-warning/10 px-2 py-1.5 text-xs text-warning-ink">{notice}</div>}
        </div>
      </section>

      {character ? (
        <>
          {battleMode && (
            <section className="rounded-cozy border border-danger/20 bg-danger/5 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Crosshair className="h-4 w-4 text-danger-ink" />
                <h3 className="text-sm font-bold text-ink">Quick Actions / Macros</h3>
              </div>
              {renderTwQuickActions()}
            </section>
          )}
          {gmTwRoster}

          <section className="rounded-cozy border border-ink/10 bg-paper p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-ink">Character</h3>
              <div className="flex gap-1">
                <button type="button" className={`rounded px-2 py-1 text-[11px] ${section === 'overview' ? 'bg-accent text-accent-text' : 'bg-ink/5 text-ink-secondary'}`} onClick={() => setSection('overview')}>Overview</button>
                <button type="button" className={`rounded px-2 py-1 text-[11px] ${section === 'stats' ? 'bg-accent text-accent-text' : 'bg-ink/5 text-ink-secondary'}`} onClick={() => setSection('stats')}>Stats</button>
              </div>
            </div>
            {shortcuts}
            <div className="mt-2">{infoPanel}</div>
          </section>

          {!battleMode && (
            <section className="rounded-cozy border border-ink/10 bg-paper p-3">
              <div className="mb-2 flex items-center gap-2">
                <Crosshair className="h-4 w-4 text-brand-ink" />
                <h3 className="text-sm font-bold text-ink">Quick Actions / Macros</h3>
              </div>
              {renderTwQuickActions()}
            </section>
          )}
        </>
      ) : (
        <section className="rounded-cozy border border-ink/10 bg-paper p-3 text-sm text-ink-secondary">
          <p>
            This panel follows <strong>Speak As</strong> until you select and pin a character.
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Select a character above to open their HUD, shortcuts and game actions.
          </p>
        </section>
      )}

      {showSheet && character && (
        <CharacterSheetViewerModal
          character={character}
          campaignId={campaign?.id}
          membership={membership}
          campaign={campaign}
          onClose={() => setShowSheet(false)}
          onCharacterChanged={setCharacter}
        />
      )}

      {showEditor && character && (
        <CharacterSheetEditorModal
          character={character}
          onClose={() => setShowEditor(false)}
          onSaved={() => void loadCharacter(character.id)}
        />
      )}
    </div>
  );
}
