import type { SquadCommandCharacterData } from '@/types/game-systems/squadCommand';
import {
  EMPTY_BATTLEFIELD_STATE,
  EMPTY_BATTLE_STATE,
  normalizeSquadCommandData,
} from '@/components/character-sheets/squadCommand/battleState';

/**
 * Fodder templates intentionally reuse normal SQUAD_COMMAND Character Templates.
 * A spawned unit gets a fresh mutable combat state while the template remains the
 * reusable master definition.
 */
export function freshSquadCommandFodderData(
  input: unknown,
  spawnedName: string,
): SquadCommandCharacterData {
  const source = normalizeSquadCommandData((input ?? {}) as SquadCommandCharacterData);
  const stats = source.stats
    ? {
        ...source.stats,
        hpCurrent: source.stats.hpMax,
        shieldCurrent: source.stats.shieldMax,
        suppression: 0,
      }
    : source.stats;

  return {
    ...source,
    characterName: spawnedName,
    // A Fodder copy is never a Commander/PC special-ability actor, even when its master is.
    isPlayerCharacter: false,
    fodder: { ...(source.fodder ?? {}), isSpawned: true },
    stats,
    weapons: (source.weapons ?? []).map((weapon) => ({
      ...weapon,
      ammoCurrent: weapon.ammoMax ?? weapon.ammoCurrent,
      cooldownCurrent: 0,
    })),
    abilities: (source.abilities ?? []).map((ability) => ({
      ...ability,
      usesCurrent: ability.usesMax ?? ability.usesCurrent,
      cooldownCurrent: 0,
    })),
    battle: {
      ...EMPTY_BATTLE_STATE,
      battlefield: {
        ...EMPTY_BATTLEFIELD_STATE,
        overwatch: { ...EMPTY_BATTLEFIELD_STATE.overwatch },
      },
    },
    combatLog: [],
  };
}

export function nextFodderName(baseName: string, existingNames: Iterable<string>): string {
  const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}\\s+(\\d+)$`, 'i');
  let highest = 0;
  for (const name of existingNames) {
    const match = pattern.exec(name.trim());
    if (!match) continue;
    highest = Math.max(highest, Number(match[1]) || 0);
  }
  return `${baseName} ${highest + 1}`;
}
