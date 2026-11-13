import type {
  SquadCommandAbility,
  SquadCommandBattleState,
  SquadCommandBattlefieldState,
  SquadCommandCharacterData,
  SquadCommandCombatLogEntry,
  SquadCommandWeapon,
} from '../../../types/game-systems/squadCommand';

export const TW_SYSTEM_VERSION = '0.7.0';
export const TW_PROFILE_REVISION = 6;

export const EMPTY_BATTLEFIELD_STATE: SquadCommandBattlefieldState = {
  cover: 0,
  attackEdge: 0,
  highGround: false,
  prone: false,
  obscured: false,
  poorVisibility: false,
  flanked: false,
  stabilized: false,
  wrecked: false,
  recoveryHp: 0,
  vehicleArc: 'front',
  overwatch: { active: false, reactions: 0 },
  targetDistance: 1,
  targetCover: 0,
  targetProne: false,
  targetObscured: false,
  targetIsVehicle: false,
  targetArc: 'front',
  specialEffects: {},
};

export const EMPTY_BATTLE_STATE: SquadCommandBattleState = {
  active: false,
  round: 0,
  activation: 0,
  actionsThisActivation: 0,
  pushesThisActivation: 0,
  fatiguePenalty: 0,
  rallyUsed: false,
  relentlessUsed: false,
  downed: false,
  deathTimer: 0,
  naniteBuffer: 0,
  bastionActive: false,
  battlefield: { ...EMPTY_BATTLEFIELD_STATE, overwatch: { ...EMPTY_BATTLEFIELD_STATE.overwatch } },
};

function battlefieldOf(data: SquadCommandCharacterData | null | undefined): SquadCommandBattlefieldState {
  const existing = data?.battle?.battlefield;
  return {
    ...EMPTY_BATTLEFIELD_STATE,
    ...(existing ?? {}),
    overwatch: {
      ...EMPTY_BATTLEFIELD_STATE.overwatch,
      ...(existing?.overwatch ?? {}),
    },
  };
}

export function normalizeSquadCommandData(data: SquadCommandCharacterData | null | undefined): SquadCommandCharacterData {
  // Older/imported Squad Command characters may exist before their game-system data object has
  // been initialized. Normalize that state instead of crashing while rendering the
  // sheet or Battle HUD.
  const source = data ?? ({} as SquadCommandCharacterData);

  const battle: SquadCommandBattleState = {
    ...EMPTY_BATTLE_STATE,
    ...(source.battle ?? {}),
    rallyUsed: source.battle?.rallyUsed ?? source.rallyUsed ?? false,
    battlefield: battlefieldOf(source),
  };

  const withoutLegacy = { ...source };
  delete withoutLegacy.rallyUsed;

  const abilities = [...(source.abilities ?? [])];
  if ((source.weapons ?? []).some((weapon) => weapon.id === 'advanced_canister') && !abilities.some((ability) => ability.id === 'shield_recovery')) {
    abilities.push({
      id: 'shield_recovery',
      name: 'Shield Recovery',
      cooldownCurrent: 0,
      cooldownMax: 2,
      rules: 'Advanced Canister shield-support cooldown tracker. Shield recovery may occur with the same support roll when the target has Shields.',
    });
  }

  return {
    ...withoutLegacy,
    systemVersion: TW_SYSTEM_VERSION,
    profileRevision: TW_PROFILE_REVISION,
    abilities,
    battle,
    combatLog: (source.combatLog ?? []).slice(-40),
  };
}

export function addCombatLog(
  data: SquadCommandCharacterData,
  title: string,
  detail: string,
  kind: SquadCommandCombatLogEntry['kind'] = 'state',
): SquadCommandCharacterData {
  const normalized = normalizeSquadCommandData(data);
  const entry: SquadCommandCombatLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    title,
    detail,
    kind,
  };
  return { ...normalized, combatLog: [...(normalized.combatLog ?? []), entry].slice(-40) };
}

function resetAbilityBattleUses(abilities: SquadCommandAbility[] | undefined): SquadCommandAbility[] {
  return (abilities ?? []).map((ability) => ({
    ...ability,
    usesCurrent: ability.usesMax !== undefined ? ability.usesMax : ability.usesCurrent,
    cooldownCurrent: 0,
  }));
}

function resetWeaponCooldowns(weapons: SquadCommandWeapon[] | undefined): SquadCommandWeapon[] {
  return (weapons ?? []).map((weapon) => ({ ...weapon, cooldownCurrent: 0 }));
}

function tickWeaponCooldowns(weapons: SquadCommandWeapon[] | undefined): SquadCommandWeapon[] {
  return (weapons ?? []).map((weapon) => ({
    ...weapon,
    cooldownCurrent: Math.max(0, (weapon.cooldownCurrent ?? 0) - 1),
  }));
}

function tickAbilityCooldowns(abilities: SquadCommandAbility[] | undefined): SquadCommandAbility[] {
  return (abilities ?? []).map((ability) => ({
    ...ability,
    cooldownCurrent: Math.max(0, (ability.cooldownCurrent ?? 0) - 1),
  }));
}

export function startBattle(data: SquadCommandCharacterData): SquadCommandCharacterData {
  const normalized = normalizeSquadCommandData(data);
  const battlefield = battlefieldOf(normalized);
  const hpZero = (normalized.stats?.hpCurrent ?? 0) <= 0;
  const vehicle = normalized.profile === 'vehicle';
  const preserveDowned = hpZero && !vehicle;
  const preserveWrecked = hpZero && vehicle;
  const next = {
    ...normalized,
    weapons: resetWeaponCooldowns(normalized.weapons),
    abilities: resetAbilityBattleUses(normalized.abilities),
    battle: {
      ...EMPTY_BATTLE_STATE,
      active: true,
      round: 1,
      downed: preserveDowned,
      deathTimer: preserveDowned ? Math.max(0, normalized.battle?.deathTimer ?? 3) : 3,
      // Nanite buffers are granted by an explicit support action; merely owning a Nanite system does not self-apply one.
      naniteBuffer: 0,
      battlefield: {
        ...battlefield,
        overwatch: { active: false, reactions: 0 },
        stabilized: preserveDowned ? battlefield.stabilized : false,
        wrecked: preserveWrecked,
        recoveryHp: preserveDowned ? battlefield.recoveryHp : 0,
        specialEffects: { withdrawn: battlefield.specialEffects?.withdrawn ?? false },
      },
    },
  };
  return addCombatLog(next, 'Battle started', 'Per-battle uses and cooldowns reset. HP, Shield, and ammunition were preserved.');
}

export function nextRound(data: SquadCommandCharacterData): SquadCommandCharacterData {
  const normalized = normalizeSquadCommandData(data);
  const battle = normalized.battle ?? EMPTY_BATTLE_STATE;
  const next = {
    ...normalized,
    battle: {
      ...battle,
      active: true,
      round: Math.max(1, battle.round + 1),
      activation: 0,
      actionsThisActivation: 0,
      pushesThisActivation: 0,
      fatiguePenalty: 0,
      battlefield: {
        ...battle.battlefield,
        obscured: false,
        overwatch: { active: false, reactions: 0 },
      },
    },
  };
  return addCombatLog(next, 'Round advanced', `Round ${next.battle.round}. Temporary smoke and Overwatch cleared.`);
}

export function startActivation(data: SquadCommandCharacterData): SquadCommandCharacterData {
  const normalized = normalizeSquadCommandData(data);
  const battle = normalized.battle ?? EMPTY_BATTLE_STATE;
  const next = {
    ...normalized,
    battle: {
      ...battle,
      active: true,
      activation: battle.activation + 1,
      actionsThisActivation: 0,
      pushesThisActivation: 0,
      fatiguePenalty: 0,
    },
  };
  return addCombatLog(next, 'Activation started', `Activation ${next.battle.activation}.`);
}

export function recordAction(data: SquadCommandCharacterData, pushed = false): SquadCommandCharacterData {
  const normalized = normalizeSquadCommandData(data);
  const battle = normalized.battle ?? EMPTY_BATTLE_STATE;
  const freeActionAlreadyUsed = battle.actionsThisActivation > battle.pushesThisActivation;

  if (!pushed && freeActionAlreadyUsed) return normalized;
  if (battle.actionsThisActivation >= 3) return normalized;
  if (pushed && battle.pushesThisActivation >= 2) return normalized;

  const nextPushes = pushed ? battle.pushesThisActivation + 1 : battle.pushesThisActivation;
  return {
    ...normalized,
    battle: {
      ...battle,
      actionsThisActivation: battle.actionsThisActivation + 1,
      pushesThisActivation: nextPushes,
      fatiguePenalty: -2 * nextPushes,
    },
  };
}

export function useRally(data: SquadCommandCharacterData, freeFromEager = false): SquadCommandCharacterData {
  const normalized = normalizeSquadCommandData(data);
  const battle = normalized.battle ?? EMPTY_BATTLE_STATE;
  if (battle.rallyUsed || (normalized.stats?.suppression ?? 0) <= 0) return normalized;

  let abilities = normalized.abilities ?? [];
  if (freeFromEager) {
    const eager = abilities.find((ability) => ability.id === 'eager');
    if (!eager || (eager.usesCurrent ?? 0) <= 0) return normalized;
    abilities = abilities.map((ability) => ability.id === 'eager'
      ? { ...ability, usesCurrent: Math.max(0, (ability.usesCurrent ?? 0) - 1) }
      : ability);
  }

  const next = {
    ...normalized,
    abilities,
    stats: normalized.stats ? { ...normalized.stats, suppression: 0 } : normalized.stats,
    battle: { ...battle, rallyUsed: true },
  };
  return addCombatLog(next, freeFromEager ? 'Eager Rally' : 'Rally', 'Suppression cleared. Rally is now spent for this battle.');
}

export function refreshUnit(data: SquadCommandCharacterData): SquadCommandCharacterData {
  const normalized = normalizeSquadCommandData(data);
  const battle = normalized.battle ?? EMPTY_BATTLE_STATE;
  // Chariot recharges on Refresh. Cataphract recharge requires a full undamaged turn,
  // which cannot be inferred from a single sheet click and therefore remains an explicit/manual state change.
  const recharge = normalized.unitId === 'chariot' ? 4 : 0;
  const shieldMax = normalized.stats?.shieldMax ?? 0;
  const currentShield = normalized.stats?.shieldCurrent ?? 0;
  const next = {
    ...normalized,
    stats: normalized.stats
      ? {
          ...normalized.stats,
          suppression: Math.max(0, normalized.stats.suppression - 1),
          shieldCurrent: recharge > 0 ? Math.min(shieldMax, currentShield + recharge) : currentShield,
        }
      : normalized.stats,
    weapons: tickWeaponCooldowns(normalized.weapons),
    abilities: tickAbilityCooldowns(normalized.abilities),
    battle: {
      ...battle,
      actionsThisActivation: 0,
      pushesThisActivation: 0,
      fatiguePenalty: 0,
      // Resolve lasts through the protected unit's current turn, then expires on Refresh.
      battlefield: {
        ...battle.battlefield,
        specialEffects: { ...(battle.battlefield.specialEffects ?? {}), resolveActive: false },
      },
    },
  };
  return addCombatLog(next, 'Refresh', `Suppression -1; cooldowns -1${recharge ? `; Shield +${recharge} (up to max)` : ''}${normalized.unitId === 'cataphract' ? '; conditional shield recharge is not auto-applied' : ''}.`);
}

export function battleReset(data: SquadCommandCharacterData): SquadCommandCharacterData {
  const normalized = normalizeSquadCommandData(data);
  const battlefield = battlefieldOf(normalized);
  const next = {
    ...normalized,
    weapons: resetWeaponCooldowns(normalized.weapons),
    abilities: resetAbilityBattleUses(normalized.abilities),
    battle: {
      ...EMPTY_BATTLE_STATE,
      active: normalized.battle?.active ?? false,
      round: normalized.battle?.active ? Math.max(1, normalized.battle?.round ?? 1) : 0,
      // A resource reset is not resurrection. Preserve incapacitation/recovery state tied to current HP.
      downed: normalized.battle?.downed ?? false,
      deathTimer: normalized.battle?.deathTimer ?? 0,
      battlefield: {
        ...battlefield,
        overwatch: { active: false, reactions: 0 },
        obscured: false,
        stabilized: battlefield.stabilized,
        wrecked: battlefield.wrecked,
        recoveryHp: battlefield.recoveryHp,
        specialEffects: { withdrawn: battlefield.specialEffects?.withdrawn ?? false },
      },
    },
  };
  return addCombatLog(next, 'Battle state reset', 'Per-battle uses and cooldowns reset. HP, Shield, and ammunition were not restored.', 'gm');
}

export function endBattle(data: SquadCommandCharacterData): SquadCommandCharacterData {
  const normalized = normalizeSquadCommandData(data);
  const battle = normalized.battle ?? EMPTY_BATTLE_STATE;
  const next = {
    ...normalized,
    battle: {
      ...battle,
      active: false,
      actionsThisActivation: 0,
      pushesThisActivation: 0,
      fatiguePenalty: 0,
      battlefield: { ...battle.battlefield, overwatch: { active: false, reactions: 0 } },
    },
  };
  return addCombatLog(next, 'Battle ended', 'Live battle tracking stopped. Persistent HP, Shield, ammunition, and spent uses were preserved.');
}
