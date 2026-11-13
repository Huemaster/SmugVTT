import type { Token } from '@/types';
import { readSheetlessSquadFodder } from './squadSheetlessFodder';
import { tokenStatusIndicators, type MapStatusIndicator } from './mapTokenIndicators';

/** Statuses a viewer is permitted to see. Never fetch hidden combat data. */
export function visibleCombatIndicators(token: Token, visibleHp: number | null): MapStatusIndicator[] {
  const snapshot = readSheetlessSquadFodder(token);
  if (!snapshot) return tokenStatusIndicators(token, visibleHp);
  const field = snapshot.battle?.battlefield;
  const conditions = new Set((token.conditions ?? []).map(v => v.trim().toLowerCase()));
  for (const name of ['hp0', 'dead', 'downed', 'wrecked', 'stabilized', 'pinned', 'overwatch']) conditions.delete(name);
  if (field?.wrecked) conditions.add('wrecked');
  else if (snapshot.battle?.downed) {
    conditions.add((snapshot.battle.deathTimer ?? 1) <= 0 && !field?.stabilized ? 'dead' : 'downed');
    if (field?.stabilized) conditions.add('stabilized');
  } else if ((snapshot.stats?.hpCurrent ?? 1) <= 0) {
    conditions.add('hp0'); // Unknown zero-HP state is never guessed to be Downed.
  }
  if ((snapshot.stats?.suppression ?? 0) >= 3) conditions.add('pinned');
  if (field?.overwatch?.active && (field.overwatch.reactions ?? 0) > 0) conditions.add('overwatch');
  const normalized: MapStatusIndicator[] = tokenStatusIndicators({
    ...token, characterId: null, metadata: {}, conditions: [...conditions],
  }, null);
  // Preserve other active special statuses from the accessible snapshot.
  const base = tokenStatusIndicators(token, snapshot.stats?.hpCurrent ?? visibleHp);
  const byKey = new Map(base.map(indicator => [indicator.key, indicator]));
  for (const item of normalized) byKey.set(item.key, item);
  for (const key of ['hp0', 'dead', 'downed', 'wrecked', 'stabilized', 'pinned', 'overwatch']) {
    if (!conditions.has(key)) byKey.delete(key);
  }
  // Complete list for the tooltip. On-token badges may compact with +N.
  return [...byKey.values()].sort((a,b) => a.priority - b.priority);
}
