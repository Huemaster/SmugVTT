import type { Token } from '@/types';
import type { SquadCommandCharacterData } from '@/types/game-systems/squadCommand';
import { normalizeSquadCommandData } from '@/components/character-sheets/squadCommand/battleState';

/** Map-only Squad Command units never own a Character / Journal sheet. */
export const TW_FODDER_SNAPSHOT_KEY = 'squadFodderData';
const MAX_TOKEN_METADATA_BYTES = 8000; // backend TokenMetadataSchema cap

export function isSheetlessSquadFodder(token: Token | undefined | null): token is Token {
  return !!token && !token.characterId && token.metadata?.smugSquadFodder === true
    && !!token.metadata[TW_FODDER_SNAPSHOT_KEY] && typeof token.metadata[TW_FODDER_SNAPSHOT_KEY] === 'object';
}

export function readSheetlessSquadFodder(token: Token): SquadCommandCharacterData | null {
  if (!isSheetlessSquadFodder(token)) return null;
  const raw = token.metadata[TW_FODDER_SNAPSHOT_KEY] as SquadCommandCharacterData;
  return normalizeSquadCommandData({ ...raw, characterName: token.name, isPlayerCharacter: false });
}

/** Trim unbounded logs so a fought battle cannot exceed the backend metadata limit. */
export function snapshotForToken(data: SquadCommandCharacterData, otherMetadata: Record<string, unknown>) {
  const normal = normalizeSquadCommandData({ ...data, isPlayerCharacter: false });
  if (normal.profile === 'commander') throw new Error('Commanders must use named character sheets; disposable Fodder cannot be Commanders.');
  const bounded: SquadCommandCharacterData = {
    ...normal,
    combatLog: (normal.combatLog ?? []).slice(-8),
    // Token metadata is visible to other players; do not copy GM notes.
    notes: '',
    ...(normal.profileSource ? { profileSource: { ...normal.profileSource, note: undefined } } : {}),
  };
  const metadata = { ...otherMetadata, smugSquadFodder: true, [TW_FODDER_SNAPSHOT_KEY]: bounded };
  if (JSON.stringify(metadata).length > MAX_TOKEN_METADATA_BYTES) {
    throw new Error('The unit snapshot exceeds the map-token 8KB limit. Reduce template notes or equipment before spawning.');
  }
  return metadata;
}

export function tokenHpFor(data: SquadCommandCharacterData) {
  const stats = data.stats;
  return stats ? { current: Math.max(0, stats.hpCurrent), max: Math.max(1, stats.hpMax), temp: 0 } : null;
}
