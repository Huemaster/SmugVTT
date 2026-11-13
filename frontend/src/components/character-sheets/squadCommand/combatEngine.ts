import type {
  SquadCommandAttackEdge,
  SquadCommandCharacterData,
  SquadCommandBattleState,
  SquadCommandCover,
  SquadCommandVehicleArc,
  SquadCommandWeapon,
} from '../../../types/game-systems/squadCommand';
import { addCombatLog, EMPTY_BATTLE_STATE, normalizeSquadCommandData, recordAction } from './battleState';

export type TwRangeBand = 'melee' | 'close' | 'medium' | 'long' | 'extreme' | 'beyond';
export type TwActionMode = 'free' | 'push' | 'reaction' | 'none';

export interface TwActionContext {
  distance: number;
  actionMode?: TwActionMode;
  enemyHasLineOfSight?: boolean;
  targetCover?: SquadCommandCover;
  targetProne?: boolean;
  targetObscured?: boolean;
  targetFlanked?: boolean;
  targetIsVehicle?: boolean;
  targetArc?: SquadCommandVehicleArc;
  roll?: (sides: number) => number;
}

export interface TwCombatRow {
  label: string;
  value: string;
}

export interface TwCombatResult {
  ok: boolean;
  title: string;
  rows: TwCombatRow[];
  source: SquadCommandCharacterData;
  target: SquadCommandCharacterData;
  sourceChanged: boolean;
  targetChanged: boolean;
  summary: string;
}

const defaultRoll = (sides: number) => Math.floor(Math.random() * sides) + 1;

export function rangeBand(distance: number): TwRangeBand {
  if (distance <= 1) return 'melee';
  if (distance <= 3) return 'close';
  if (distance <= 6) return 'medium';
  if (distance <= 9) return 'long';
  if (distance <= 12) return 'extreme';
  return 'beyond';
}

export function rollExpression(expression: string, roll = defaultRoll): number {
  const clean = expression.trim().toLowerCase().replace(/\s+/g, '');
  if (!clean || clean === '0') return 0;
  const match = /^(\d+)d(\d+)([+-]\d+)?$/.exec(clean);
  if (!match) {
    const flat = Number(clean);
    return Number.isFinite(flat) ? flat : 0;
  }
  const count = Math.max(0, Number(match[1]));
  const sides = Math.max(1, Number(match[2]));
  const bonus = Number(match[3] ?? 0);
  let total = bonus;
  for (let i = 0; i < count; i += 1) total += roll(sides);
  return total;
}

function numericAp(weapon: SquadCommandWeapon): number {
  if (weapon.ignoreAV) return 0;
  const parsed = Number(weapon.ap);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceBattle(data: SquadCommandCharacterData) {
  return normalizeSquadCommandData(data).battle ?? EMPTY_BATTLE_STATE;
}

function currentMaxRange(source: SquadCommandCharacterData, weapon: SquadCommandWeapon): number {
  const max = weapon.maxRange ?? weapon.effectiveRange ?? 0;
  const effective = weapon.effectiveRange ?? max;
  const poorVisibility = sourceBattle(source).battlefield.poorVisibility;
  if (!poorVisibility || max <= effective) return max;
  return Math.max(effective, max - 3);
}

function hasAbility(data: SquadCommandCharacterData, id: string): boolean {
  return (data.abilities ?? []).some((ability) => ability.id === id);
}

function replaceWeapon(data: SquadCommandCharacterData, nextWeapon: SquadCommandWeapon): SquadCommandCharacterData {
  return {
    ...data,
    weapons: (data.weapons ?? []).map((weapon) => weapon.id === nextWeapon.id ? nextWeapon : weapon),
  };
}

function spendWeapon(data: SquadCommandCharacterData, weapon: SquadCommandWeapon): SquadCommandCharacterData {
  const ammoCost = weapon.ammoCost ?? ((weapon.ammoMax ?? 0) > 0 ? 1 : 0);
  const nextWeapon: SquadCommandWeapon = {
    ...weapon,
    ammoCurrent: (weapon.ammoMax ?? 0) > 0
      ? Math.max(0, (weapon.ammoCurrent ?? 0) - ammoCost)
      : weapon.ammoCurrent,
    cooldownCurrent: Math.max(weapon.cooldownCurrent ?? 0, weapon.cooldownMax ?? 0),
  };
  return replaceWeapon(data, nextWeapon);
}

function applyActionMode(data: SquadCommandCharacterData, mode: TwActionMode): SquadCommandCharacterData | null {
  if (mode === 'none' || mode === 'reaction') return data;
  const before = normalizeSquadCommandData(data);
  const after = recordAction(before, mode === 'push');
  if ((after.battle?.actionsThisActivation ?? 0) === (before.battle?.actionsThisActivation ?? 0)) return null;
  return after;
}

export function nextActionMode(data: SquadCommandCharacterData): 'free' | 'push' | null {
  const battle = sourceBattle(data);
  if (!battle.active || battle.actionsThisActivation >= 3) return null;
  const freeUsed = battle.actionsThisActivation > battle.pushesThisActivation;
  if (!freeUsed) return 'free';
  if (battle.pushesThisActivation < 2) return 'push';
  return null;
}

export function overwatchCapacity(_data: SquadCommandCharacterData, weapon: SquadCommandWeapon): number {
  if (!weapon.canOverwatch || (weapon.kind && weapon.kind !== 'attack')) return 0;
  if ((weapon.cooldownCurrent ?? 0) > 0) return 0;
  let cap = weapon.overwatchMax ?? ((weapon.cooldownMax ?? 0) > 0 ? 1 : 99);
  if ((weapon.cooldownMax ?? 0) > 0) cap = Math.min(cap, 1);
  const ammoCost = weapon.ammoCost ?? ((weapon.ammoMax ?? 0) > 0 ? 1 : 0);
  if ((weapon.ammoMax ?? 0) > 0 && ammoCost > 0) {
    cap = Math.min(cap, Math.floor((weapon.ammoCurrent ?? 0) / ammoCost));
  }
  return Math.max(0, cap === 99 ? 1 : cap);
}

export function weaponUnavailableReason(
  sourceInput: SquadCommandCharacterData,
  weapon: SquadCommandWeapon,
  context?: Partial<TwActionContext>,
): string | null {
  const source = normalizeSquadCommandData(sourceInput);
  const battle = source.battle ?? EMPTY_BATTLE_STATE;
  const field = battle.battlefield;
  if (battle.downed || field.wrecked) return 'Incapacitated';
  if (field.embarkedIn) return 'Embarked';
  if ((weapon.cooldownCurrent ?? 0) > 0) return `Cooldown ${weapon.cooldownCurrent}`;
  const ammoCost = weapon.ammoCost ?? ((weapon.ammoMax ?? 0) > 0 ? 1 : 0);
  if ((weapon.ammoMax ?? 0) > 0 && (weapon.ammoCurrent ?? 0) < ammoCost) return 'Out of ammo';
  if ((!weapon.kind || weapon.kind === 'attack') && (source.stats?.suppression ?? 0) >= 3) return 'Pinned';
  if (context?.distance !== undefined) {
    const distance = Math.max(0, context.distance);
    const min = weapon.minRange ?? 0;
    const max = currentMaxRange(source, weapon);
    if (distance < min) return `Minimum range ${min}`;
    if (max > 0 && distance > max) return `Maximum range ${max}`;
  }
  if (context?.actionMode === 'free' || context?.actionMode === 'push') {
    const probe = applyActionMode(source, context.actionMode);
    if (!probe) return context.actionMode === 'push' ? 'No Push action available' : 'Free action already used';
  }
  return null;
}

export function armOverwatch(dataInput: SquadCommandCharacterData, weaponId: string): SquadCommandCharacterData {
  const data = normalizeSquadCommandData(dataInput);
  const weapon = (data.weapons ?? []).find((entry) => entry.id === weaponId);
  if (!weapon) return data;
  const cap = overwatchCapacity(data, weapon);
  if (cap <= 0 || data.stats?.suppression === 3 || data.battle?.downed || data.battle?.battlefield.wrecked || data.battle?.battlefield.embarkedIn) return data;
  return addCombatLog({
    ...data,
    battle: {
      ...(data.battle ?? EMPTY_BATTLE_STATE),
      battlefield: {
        ...(data.battle?.battlefield ?? EMPTY_BATTLE_STATE.battlefield),
        overwatch: { active: true, weaponId, reactions: cap },
      },
    },
  }, 'Overwatch armed', `${weapon.name}: ${cap} reaction${cap === 1 ? '' : 's'} available.`);
}

export function cancelOverwatch(dataInput: SquadCommandCharacterData): SquadCommandCharacterData {
  const data = normalizeSquadCommandData(dataInput);
  return {
    ...data,
    battle: {
      ...(data.battle ?? EMPTY_BATTLE_STATE),
      battlefield: {
        ...(data.battle?.battlefield ?? EMPTY_BATTLE_STATE.battlefield),
        overwatch: { active: false, reactions: 0 },
      },
    },
  };
}

export function reloadWeapon(dataInput: SquadCommandCharacterData, weaponId: string): SquadCommandCharacterData {
  const data = normalizeSquadCommandData(dataInput);
  const weapon = (data.weapons ?? []).find((entry) => entry.id === weaponId);
  if (!weapon || !weapon.ammoMax || weapon.ammoCurrent === weapon.ammoMax) return data;
  if (weapon.id === 'seeker' || weapon.special === 'seeker') return data;
  if (weapon.id === 'frag_grenade' || weapon.special === 'frag_grenade') return data;
  const mode = nextActionMode(data);
  if (!mode) return data;
  const acted = applyActionMode(data, mode);
  if (!acted) return data;
  return addCombatLog(replaceWeapon(acted, { ...weapon, ammoCurrent: weapon.ammoMax }), `Reload: ${weapon.name}`, `${mode === 'push' ? 'Push action' : 'Free action'} spent; ammunition restored.`, 'state');
}

function setSuppression(dataInput: SquadCommandCharacterData, desired: number, rows: TwCombatRow[]): SquadCommandCharacterData {
  const data = normalizeSquadCommandData(dataInput);
  const old = data.stats?.suppression ?? 0;
  let next = Math.max(0, Math.min(3, desired));
  let battle = data.battle ?? EMPTY_BATTLE_STATE;
  let abilities = data.abilities;
  if (next >= 3 && old < 3 && hasAbility(data, 'relentless') && !battle.relentlessUsed) {
    next = 2;
    battle = { ...battle, relentlessUsed: true };
    abilities = (data.abilities ?? []).map((ability) => ability.id === 'relentless'
      ? { ...ability, usesCurrent: ability.usesMax !== undefined ? Math.max(0, (ability.usesCurrent ?? 0) - 1) : ability.usesCurrent }
      : ability);
    rows.push({ label: 'Relentless', value: 'Triggered — Pin prevented; Suppression remains 2.' });
  }
  return {
    ...data,
    abilities,
    stats: data.stats ? { ...data.stats, suppression: next } : data.stats,
    battle,
  };
}

function bodyAv(data: SquadCommandCharacterData, arc: SquadCommandVehicleArc): number {
  const directional = data.stats?.directionalAV;
  if (data.profile === 'vehicle' && directional) return directional[arc];
  return data.stats?.av ?? 0;
}

function applyBodyDamage(
  targetInput: SquadCommandCharacterData,
  amount: number,
  rows: TwCombatRow[],
  instantKill = true,
): SquadCommandCharacterData {
  let target = normalizeSquadCommandData(targetInput);
  let net = Math.max(0, amount);
  const battle = target.battle ?? EMPTY_BATTLE_STATE;
  if (battle.naniteBuffer > 0 && net > 0) {
    const used = Math.min(battle.naniteBuffer, net);
    net -= used;
    target = { ...target, battle: { ...battle, naniteBuffer: battle.naniteBuffer - used } };
    rows.push({ label: 'Nanite Buffer', value: `${used} absorbed; ${battle.naniteBuffer - used} remains.` });
  }
  if (net <= 0 || !target.stats) return target;
  const hpMax = target.stats.hpMax;
  const nextHp = Math.max(0, target.stats.hpCurrent - net);
  rows.push({ label: 'HP Damage', value: String(net) });
  target = { ...target, stats: { ...target.stats, hpCurrent: nextHp } };
  if (instantKill && hpMax > 0 && net >= hpMax * 2) {
    const isVehicle = target.profile === 'vehicle';
    target = {
      ...target,
      battle: {
        ...(target.battle ?? EMPTY_BATTLE_STATE),
        downed: !isVehicle,
        deathTimer: 0,
        battlefield: {
          ...(target.battle?.battlefield ?? EMPTY_BATTLE_STATE.battlefield),
          wrecked: isVehicle,
          overwatch: { active: false, reactions: 0 },
        },
      },
    };
    rows.push({ label: 'Status', value: isVehicle ? 'WRECKED — massive damage' : 'INSTANT KILL' });
  } else if (nextHp <= 0) {
    const isVehicle = target.profile === 'vehicle';
    target = {
      ...target,
      battle: {
        ...(target.battle ?? EMPTY_BATTLE_STATE),
        downed: !isVehicle,
        deathTimer: isVehicle ? 0 : 3,
        battlefield: {
          ...(target.battle?.battlefield ?? EMPTY_BATTLE_STATE.battlefield),
          wrecked: isVehicle,
          stabilized: false,
          overwatch: { active: false, reactions: 0 },
        },
      },
    };
    rows.push({ label: 'Status', value: isVehicle ? 'WRECKED' : 'DOWNED — 3 turns' });
  } else {
    rows.push({ label: 'Target HP', value: `${nextHp}/${hpMax}` });
  }
  return target;
}

function applyDamageSource(
  targetInput: SquadCommandCharacterData,
  raw: number,
  weapon: SquadCommandWeapon,
  cover: SquadCommandCover,
  arc: SquadCommandVehicleArc,
  rows: TwCombatRow[],
): SquadCommandCharacterData {
  let target = normalizeSquadCommandData(targetInput);
  const battle = target.battle ?? EMPTY_BATTLE_STATE;
  if (battle.battlefield.specialEffects?.resolveActive && raw > 0) {
    const reduced = Math.ceil(raw / 2);
    rows.push({ label: 'Resolve', value: `Incoming damage ${raw} → ${reduced} (50% reduced, before protection).` });
    raw = reduced;
  }
  if (battle.bastionActive && raw > 0) {
    rows.push({ label: 'Bastion', value: 'Triggered — this damage source was completely prevented.' });
    return { ...target, battle: { ...battle, bastionActive: false } };
  }
  if (!target.stats) return target;
  const coverAv = weapon.ignoreCover ? 0 : cover;
  if (target.stats.shieldCurrent > 0) {
    const shieldDamage = Math.max(1, raw - coverAv);
    const nextShield = Math.max(0, target.stats.shieldCurrent - shieldDamage);
    rows.push({ label: 'Protection', value: `Shield${coverAv ? ` + Cover ${coverAv}` : ''}` });
    rows.push({ label: 'Shield Damage', value: String(shieldDamage) });
    rows.push({ label: 'Target Shield', value: `${nextShield}/${target.stats.shieldMax}` });
    return { ...target, stats: { ...target.stats, shieldCurrent: nextShield } };
  }
  const baseAv = weapon.ignoreAV ? 0 : bodyAv(target, arc);
  const reducedAv = weapon.ignoreAV ? 0 : Math.max(0, baseAv - numericAp(weapon));
  const total = reducedAv + coverAv;
  const net = Math.max(1, raw - total);
  rows.push({ label: 'Protection', value: weapon.ignoreAV ? `Armor ignored${coverAv ? `; Cover ${coverAv}` : ''}` : `AV ${baseAv} − AP ${numericAp(weapon)} + Cover ${coverAv} = ${total}` });
  return applyBodyDamage(target, net, rows, true);
}

function rangeEdge(weapon: SquadCommandWeapon, distance: number): SquadCommandAttackEdge {
  const explicit = weapon.rangeEdges?.[rangeBand(distance) as Exclude<TwRangeBand, 'beyond'>];
  if (explicit !== undefined) return explicit;
  if ((weapon.effectiveRange ?? 0) > 0 && distance > (weapon.effectiveRange ?? 0)) {
    return (weapon.rangePenalty ?? 0) < 0 ? -1 : 0;
  }
  return 0;
}

function attackRoll(accuracy: number, roll: (sides: number) => number): number {
  return roll(6) + roll(6) + accuracy;
}

function consumeOverwatchReaction(data: SquadCommandCharacterData, weapon: SquadCommandWeapon): SquadCommandCharacterData {
  const battle = sourceBattle(data);
  if (!battle.battlefield.overwatch.active) return data;
  const remaining = Math.max(0, battle.battlefield.overwatch.reactions - 1);
  const liveWeapon = (data.weapons ?? []).find((entry) => entry.id === weapon.id) ?? weapon;
  const stillReady = remaining > 0 && overwatchCapacity(data, liveWeapon) > 0;
  return {
    ...data,
    battle: {
      ...battle,
      battlefield: {
        ...battle.battlefield,
        overwatch: stillReady
          ? { ...battle.battlefield.overwatch, reactions: remaining }
          : { active: false, reactions: 0 },
      },
    },
  };
}

function makeResult(
  ok: boolean,
  title: string,
  rows: TwCombatRow[],
  source: SquadCommandCharacterData,
  target: SquadCommandCharacterData,
  originalSource: SquadCommandCharacterData,
  originalTarget: SquadCommandCharacterData,
): TwCombatResult {
  const summary = rows.map((row) => `${row.label}: ${row.value}`).join(' • ');
  return {
    ok,
    title,
    rows,
    source,
    target,
    sourceChanged: JSON.stringify(source) !== JSON.stringify(originalSource),
    targetChanged: JSON.stringify(target) !== JSON.stringify(originalTarget),
    summary,
  };
}

export function resolveWeaponAction(
  sourceInput: SquadCommandCharacterData,
  targetInput: SquadCommandCharacterData,
  weaponId: string,
  context: TwActionContext,
): TwCombatResult {
  const originalSource = normalizeSquadCommandData(sourceInput);
  const originalTarget = normalizeSquadCommandData(targetInput);
  let source = originalSource;
  let target = originalTarget;
  const weapon = (source.weapons ?? []).find((entry) => entry.id === weaponId);
  const rows: TwCombatRow[] = [];
  const roll = context.roll ?? defaultRoll;
  const actionMode = context.actionMode ?? 'none';

  if (!weapon) return makeResult(false, 'Squad Command Action Error', [{ label: 'Weapon', value: 'Weapon not found.' }], source, target, originalSource, originalTarget);
  const unavailable = weaponUnavailableReason(source, weapon, { ...context, actionMode });
  if (unavailable) return makeResult(false, `${weapon.name} — unavailable`, [{ label: 'Status', value: unavailable }], source, target, originalSource, originalTarget);

  const acted = applyActionMode(source, actionMode);
  if (!acted) return makeResult(false, `${weapon.name} — unavailable`, [{ label: 'Action', value: 'No eligible action remains.' }], source, target, originalSource, originalTarget);
  source = acted;

  if (source.battle?.battlefield.overwatch.active && actionMode !== 'reaction') source = cancelOverwatch(source);
  source = spendWeapon(source, weapon);
  if (actionMode === 'reaction') source = consumeOverwatchReaction(source, weapon);

  const distance = Math.max(0, context.distance);
  const targetField = target.battle?.battlefield ?? EMPTY_BATTLE_STATE.battlefield;
  const cover = context.targetFlanked || targetField.flanked ? 0 : (context.targetCover ?? targetField.cover);
  const targetProne = context.targetProne ?? targetField.prone;
  const targetObscured = context.targetObscured ?? targetField.obscured;
  const targetIsVehicle = context.targetIsVehicle ?? target.profile === 'vehicle';
  const targetArc = context.targetArc ?? targetField.vehicleArc;
  rows.push({ label: 'Target', value: target.characterName || 'Target' });
  rows.push({ label: 'Range', value: weapon.special === 'orbital_rail_cannon' ? `${distance} — orbital (unlimited)` : `${distance} — ${rangeBand(distance)}` });
  rows.push({ label: 'Action', value: actionMode === 'push' ? `Push (${source.battle?.fatiguePenalty ?? 0} Hit fatigue)` : actionMode === 'reaction' ? 'Overwatch reaction' : actionMode === 'free' ? 'Free action' : 'No action bookkeeping' });

  if (weapon.kind === 'heal') {
    const amount = rollExpression(weapon.damage, roll);
    rows.push({ label: 'Support Roll', value: String(amount) });
    if (target.profile === 'vehicle') {
      rows.push({ label: 'Result', value: 'Restorative Canisters do not repair vehicles.' });
    } else if (target.battle?.downed) {
      target = {
        ...target,
        battle: {
          ...(target.battle ?? EMPTY_BATTLE_STATE),
          battlefield: { ...targetField, stabilized: true, recoveryHp: amount },
        },
      };
      rows.push({ label: 'Result', value: `STABILIZED — Recovery HP ${amount}` });
    } else if (target.stats) {
      const hpMax = target.stats.hpMax;
      const hp = Math.min(hpMax, target.stats.hpCurrent + amount);
      target = { ...target, stats: { ...target.stats, hpCurrent: hp } };
      rows.push({ label: 'Result', value: `${hp}/${hpMax} HP` });
    }
    if (weapon.shieldHealing && target.stats?.shieldMax) {
      const tracker = (source.abilities ?? []).find((ability) => ability.id === 'shield_recovery');
      if ((tracker?.cooldownCurrent ?? 0) > 0) {
        rows.push({ label: 'Shield Recovery', value: `Cooldown ${tracker?.cooldownCurrent} — HP support still resolved.` });
      } else {
        const shieldMax = target.stats.shieldMax;
        const sh = Math.min(shieldMax, target.stats.shieldCurrent + amount);
        target = { ...target, stats: { ...target.stats, shieldCurrent: sh } };
        source = spendAbility(source, 'shield_recovery');
        rows.push({ label: 'Shield Recovery', value: `${sh}/${shieldMax} • support cooldown 2.` });
      }
    }
    rows.push({ label: 'AoE', value: 'Use the same support roll for eligible adjacent units; same-round AoE support does not stack.' });
  } else if (weapon.kind === 'smoke') {
    target = {
      ...target,
      battle: { ...(target.battle ?? EMPTY_BATTLE_STATE), battlefield: { ...targetField, obscured: true } },
    };
    rows.push({ label: 'Smoke', value: 'Target marked Obscured. Adjacent-space application remains a GM/map action.' });
  } else if (weapon.kind === 'psychic') {
    const morale = roll(6) + roll(6);
    rows.push({ label: 'Attack', value: 'TRUE HIT — ignores Cover; no LOS required.' });
    rows.push({ label: 'Morale', value: `${morale} vs 7+` });
    if (morale < 7) {
      target = {
        ...target,
        battle: { ...(target.battle ?? EMPTY_BATTLE_STATE), battlefield: { ...targetField, cover: 0 } },
      };
      target = setSuppression(target, 3, rows);
      rows.push({ label: 'Morale Result', value: 'FAIL — Cover lost; target forced toward nearest legal non-cover position.' });
    } else rows.push({ label: 'Morale Result', value: 'PASS' });
    const psychicDamage = roll(6);
    if (psychicDamage === 6) {
      rows.push({ label: 'Psychic Damage', value: '6 rolled — 1 direct HP.' });
      target = applyBodyDamage(target, 1, rows, false);
    } else rows.push({ label: 'Psychic Damage', value: `${psychicDamage} — no HP damage.` });
  } else {
    target = setSuppression(target, (target.stats?.suppression ?? 0) + 1, rows);
    rows.push({ label: 'Suppression', value: `${target.stats?.suppression ?? 0}/3` });

    let accuracy = weapon.accuracy + (source.battle?.fatiguePenalty ?? 0);
    const special = source.battle?.battlefield.specialEffects;
    if (special?.reaperActive) {
      accuracy += 2;
      rows.push({ label: 'Reaper', value: '+2 Accuracy on this attack (consumed).' });
    }
    if (special?.reaperActive || special?.exaltedActive) {
      source = setBattlefieldState(source, {
        specialEffects: { ...special, reaperActive: false, exaltedActive: false },
      });
    }
    if (source.battle?.battlefield.highGround) accuracy += 1;
    if ((source.stats?.suppression ?? 0) > 0) accuracy -= 1;
    const melee = (weapon.maxRange ?? 0) <= 1;
    if (!melee) accuracy -= cover;

    let edge = (source.battle?.battlefield.attackEdge ?? 0) + rangeEdge(weapon, distance);
    if (weapon.disadvantageVsNonVehicle && !targetIsVehicle) edge -= 1;
    if (melee && cover > 0) edge += 1;
    if (melee && targetProne) edge += 1;
    if (targetObscured && !weapon.smartSight) edge -= 1;
    const normalizedEdge: SquadCommandAttackEdge = edge > 0 ? 1 : edge < 0 ? -1 : 0;

    let attack: number | null = null;
    if (weapon.autoHit) rows.push({ label: 'Attack', value: 'AUTO-HIT / TRUE HIT' });
    else if (normalizedEdge > 0) {
      const a = attackRoll(accuracy, roll); const b = attackRoll(accuracy, roll); attack = Math.max(a, b);
      rows.push({ label: 'Attack', value: `${a} / ${b} → ${attack} (Advantage)` });
    } else if (normalizedEdge < 0) {
      const a = attackRoll(accuracy, roll); const b = attackRoll(accuracy, roll); attack = Math.min(a, b);
      rows.push({ label: 'Attack', value: `${a} / ${b} → ${attack} (Disadvantage)` });
    } else {
      attack = attackRoll(accuracy, roll);
      rows.push({ label: 'Attack', value: String(attack) });
    }
    rows.push({ label: 'Defense', value: String(target.stats?.defense ?? 0) });
    const hit = weapon.autoHit || (attack ?? -999) >= (target.stats?.defense ?? 0);
    if (!hit) rows.push({ label: 'Result', value: 'MISS' });
    else {
      const rolled = rollExpression(weapon.damage, roll);
      const raw = special?.exaltedActive ? Math.ceil(rolled * 1.5) : rolled;
      rows.push({ label: 'Damage Roll', value: String(rolled) });
      if (special?.exaltedActive) rows.push({ label: 'Exalted', value: `${rolled} → ${raw} (+50% next attack, consumed before defenses).` });
      const hpBefore = target.stats?.hpCurrent ?? 0;
      const shieldBefore = target.stats?.shieldCurrent ?? 0;
      target = applyDamageSource(target, raw, weapon, melee ? 0 : cover, targetArc, rows);
      const damageLanded = (target.stats?.hpCurrent ?? 0) < hpBefore || (target.stats?.shieldCurrent ?? 0) < shieldBefore;
      if (weapon.special === 'power_mace') {
        target = setSuppression(target, 3, rows);
        rows.push({ label: 'Power Mace', value: target.stats?.suppression === 3 ? 'Target PINNED.' : 'Relentless prevented Pin.' });
      }
      // Extra Vehicle Suppression is only granted by weapons whose current canon explicitly says so.
      // Anti-Tank as a trait alone does not imply an additional Suppression tick.
      const extraVehicleSuppression = ['holy_lance_cannon', 'void_gun', 'demo_charge'].includes(weapon.special ?? weapon.id);
      if (extraVehicleSuppression && targetIsVehicle && damageLanded) {
        target = setSuppression(target, (target.stats?.suppression ?? 0) + 1, rows);
        rows.push({ label: 'Anti-Tank Impact', value: `Vehicle Suppression ${target.stats?.suppression ?? 0}/3.` });
      }
    }
  }

  if (context.enemyHasLineOfSight !== false && hasAbility(source, 'cloak')) {
    const cloak = source.abilities?.find((ability) => ability.id === 'cloak' || ability.id === 'gaulian_cloak');
    if (cloak) rows.push({ label: 'Cloak', value: 'Action in enemy LOS reveals the unit; mark Cloak off manually if currently active.' });
  }

  const title = `${weapon.name} → ${target.characterName || 'Target'}`;
  const detail = rows.map((row) => `${row.label}: ${row.value}`).join(' • ');
  source = addCombatLog(source, title, detail, weapon.kind === 'heal' ? 'support' : 'attack');
  target = addCombatLog(target, `Targeted: ${weapon.name}`, detail, weapon.kind === 'heal' ? 'support' : 'attack');
  return makeResult(true, title, rows, source, target, originalSource, originalTarget);
}

export function formatCombatResult(result: TwCombatResult): string {
  return result.rows.map((row) => `**${row.label}:** ${row.value}`).join('\n');
}

export interface TwValidationIssue { severity: 'error' | 'warning'; message: string; }

export function validateCombatProfile(dataInput: SquadCommandCharacterData): TwValidationIssue[] {
  const data = normalizeSquadCommandData(dataInput);
  const issues: TwValidationIssue[] = [];
  if (!data.stats) issues.push({ severity: 'error', message: 'Combat stats are missing.' });
  else {
    if (data.stats.hpMax <= 0) issues.push({ severity: 'error', message: 'Max HP must be greater than 0.' });
    if (data.stats.defense <= 0) issues.push({ severity: 'warning', message: 'DEF is 0; verify the profile.' });
    if (data.profile === 'vehicle' && !data.stats.directionalAV) issues.push({ severity: 'warning', message: 'Vehicle has no directional AV block.' });
  }
  for (const weapon of data.weapons ?? []) {
    if (!weapon.name.trim()) issues.push({ severity: 'error', message: `Weapon ${weapon.id} has no display name.` });
    if ((weapon.kind ?? 'attack') === 'attack' && !weapon.damage.trim()) issues.push({ severity: 'error', message: `${weapon.name} has no damage expression.` });
    if ((weapon.maxRange ?? 0) < (weapon.minRange ?? 0)) issues.push({ severity: 'error', message: `${weapon.name}: maximum range is below minimum range.` });
    if ((weapon.effectiveRange ?? 0) > (weapon.maxRange ?? weapon.effectiveRange ?? 0)) issues.push({ severity: 'warning', message: `${weapon.name}: effective range exceeds maximum range.` });
    if (weapon.canOverwatch && (weapon.maxRange ?? 0) <= 1) issues.push({ severity: 'warning', message: `${weapon.name}: melee weapon is marked Overwatch-capable.` });
  }
  if (data.profileSource?.status === 'source-locked') issues.push({ severity: 'warning', message: data.profileSource.note ?? 'Finalized source block is not loaded; numeric profile remains locked against invention.' });
  return issues;
}

export function abilityUnavailableReason(dataInput: SquadCommandCharacterData, abilityId: string): string | null {
  const data = normalizeSquadCommandData(dataInput);
  const ability = (data.abilities ?? []).find((entry) => entry.id === abilityId);
  if (!ability) return 'Ability not found';
  if ((ability.cooldownCurrent ?? 0) > 0) return `Cooldown ${ability.cooldownCurrent}`;
  if ((ability.usesMax ?? 0) > 0 && (ability.usesCurrent ?? 0) <= 0) return 'No uses remaining';
  if (data.battle?.downed || data.battle?.battlefield.wrecked) return 'Incapacitated';
  if (abilityId === 'eager' && ((data.stats?.suppression ?? 0) <= 0 || data.battle?.rallyUsed)) return 'Rally unavailable';
  if (abilityId === 'relentless' && data.battle?.relentlessUsed) return 'Used this battle';
  return null;
}

function spendAbility(data: SquadCommandCharacterData, abilityId: string): SquadCommandCharacterData {
  return {
    ...data,
    abilities: (data.abilities ?? []).map((ability) => ability.id !== abilityId ? ability : ({
      ...ability,
      usesCurrent: ability.usesMax !== undefined ? Math.max(0, (ability.usesCurrent ?? 0) - 1) : ability.usesCurrent,
      cooldownCurrent: ability.cooldownMax !== undefined ? ability.cooldownMax : ability.cooldownCurrent,
    })),
  };
}

export function activateAbility(dataInput: SquadCommandCharacterData, abilityId: string): SquadCommandCharacterData {
  let data = normalizeSquadCommandData(dataInput);
  if (abilityUnavailableReason(data, abilityId)) return data;
  const ability = (data.abilities ?? []).find((entry) => entry.id === abilityId);
  if (!ability) return data;

  if (abilityId === 'eager') {
    // useRally owns the Eager use decrement, so avoid spending twice.
    const battle = data.battle ?? EMPTY_BATTLE_STATE;
    if (battle.rallyUsed || (data.stats?.suppression ?? 0) <= 0) return data;
    data = {
      ...data,
      abilities: (data.abilities ?? []).map((entry) => entry.id === 'eager'
        ? { ...entry, usesCurrent: Math.max(0, (entry.usesCurrent ?? 0) - 1) }
        : entry),
      stats: data.stats ? { ...data.stats, suppression: 0 } : data.stats,
      battle: { ...battle, rallyUsed: true },
    };
    return addCombatLog(data, 'Eager Rally', 'Suppression cleared without spending an Action; Rally spent for this battle.');
  }

  if (abilityId === 'speed_loader') {
    data = spendAbility(data, abilityId);
    data = {
      ...data,
      weapons: (data.weapons ?? []).map((weapon) => weapon.id === 'westphalian_revolver'
        ? { ...weapon, ammoCurrent: weapon.ammoMax }
        : weapon),
    };
    return addCombatLog(data, 'Speed Loader', 'Faction 2 Revolver refilled.');
  }

  if (abilityId === 'bandolier') {
    data = spendAbility(data, abilityId);
    data = {
      ...data,
      weapons: (data.weapons ?? []).map((weapon) => weapon.id === 'frag_grenade'
        ? { ...weapon, ammoCurrent: weapon.ammoMax }
        : weapon),
    };
    return addCombatLog(data, 'Bandolier', 'Frag Grenades restored to full ammunition.');
  }

  if (abilityId === 'bastion' || abilityId === 'nanite2' || abilityId === 'nanite3') {
    return addCombatLog(data, ability.name, 'This ability requires a chosen target. Use the Battle HUD target control for live application; no use/cooldown was spent.', 'state');
  }

  if (abilityId === 'flares') {
    data = spendAbility(data, abilityId);
    return addCombatLog(data, 'Flares', 'Flares spent for this battle. Apply Disadvantage to eligible ranged Anti-Tank/Piercing attacks beyond Close.');
  }

  if (abilityId === 'westphal_boost') {
    data = spendAbility(data, abilityId);
    return addCombatLog(data, 'Faction 2 Boost', '+4 Move for this activation. Movement remains a table/map action.');
  }

  if (abilityId === 'automatic_dodge') {
    data = spendAbility(data, abilityId);
    return addCombatLog(data, 'Automatic Dodge spent', 'One successful attack is turned into a miss. Use this immediately when the trigger occurs.');
  }

  // Passive/scenario abilities are still logged so the same card can be used from sheet/HUD.
  return addCombatLog(data, ability.name, ability.rules || 'Ability referenced; no universal state change is defined.', 'state');
}

export function isTargetedAbility(abilityId: string): boolean {
  return abilityId === 'nanite2' || abilityId === 'nanite3' || abilityId === 'bastion';
}

export function resolveTargetedAbility(
  sourceInput: SquadCommandCharacterData,
  targetInput: SquadCommandCharacterData,
  abilityId: string,
  distance: number,
): TwCombatResult {
  const originalSource = normalizeSquadCommandData(sourceInput);
  const originalTarget = normalizeSquadCommandData(targetInput);
  let source = originalSource;
  let target = originalTarget;
  const rows: TwCombatRow[] = [];
  const ability = (source.abilities ?? []).find((entry) => entry.id === abilityId);
  if (!ability || !isTargetedAbility(abilityId)) {
    return makeResult(false, 'Squad Command Ability Error', [{ label: 'Ability', value: 'Targeted ability not found.' }], source, target, originalSource, originalTarget);
  }
  const unavailable = abilityUnavailableReason(source, abilityId);
  if (unavailable) return makeResult(false, `${ability.name} — unavailable`, [{ label: 'Status', value: unavailable }], source, target, originalSource, originalTarget);
  rows.push({ label: 'Target', value: target.characterName || 'Target' });
  if (abilityId === 'nanite2' || abilityId === 'nanite3') {
    if (distance > 3) return makeResult(false, `${ability.name} — unavailable`, [{ label: 'Range', value: `Target is ${distance}; Nanite Pack requires Close 3.` }], source, target, originalSource, originalTarget);
    const amount = abilityId === 'nanite3' ? 3 : 2;
    target = { ...target, battle: { ...(target.battle ?? EMPTY_BATTLE_STATE), naniteBuffer: amount } };
    rows.push({ label: 'Nanite Buffer', value: `${amount} temporary HP • refreshes, does not stack.` });
  } else if (abilityId === 'bastion') {
    if (target.battle?.bastionActive) return makeResult(false, `${ability.name} — unavailable`, [{ label: 'Target', value: 'Bastion is already active on this target.' }], source, target, originalSource, originalTarget);
    source = spendAbility(source, abilityId);
    target = { ...target, battle: { ...(target.battle ?? EMPTY_BATTLE_STATE), bastionActive: true } };
    const live = (source.abilities ?? []).find((entry) => entry.id === abilityId);
    rows.push({ label: 'Bastion', value: 'Next single damage source is completely prevented.' });
    rows.push({ label: 'Resource', value: `${live?.usesCurrent ?? 0}/${live?.usesMax ?? 0} uses • CD ${live?.cooldownCurrent ?? 0}.` });
  }

  const title = `${ability.name} → ${target.characterName || 'Target'}`;
  const detail = rows.map((row) => `${row.label}: ${row.value}`).join(' • ');
  source = addCombatLog(source, title, detail, 'support');
  target = addCombatLog(target, `Targeted: ${ability.name}`, detail, 'support');
  return makeResult(true, title, rows, source, target, originalSource, originalTarget);
}

export function setBattlefieldState(
  dataInput: SquadCommandCharacterData,
  patch: Partial<ReturnType<typeof sourceBattle>['battlefield']>,
): SquadCommandCharacterData {
  const data = normalizeSquadCommandData(dataInput);
  const battle = data.battle ?? EMPTY_BATTLE_STATE;
  return {
    ...data,
    battle: {
      ...battle,
      battlefield: { ...battle.battlefield, ...patch },
    },
  };
}

export function gmAdjust(
  dataInput: SquadCommandCharacterData,
  patch: Partial<{ hpCurrent: number; shieldCurrent: number; suppression: number; naniteBuffer: number; deathTimer: number }>,
  note = 'GM override',
): SquadCommandCharacterData {
  const data = normalizeSquadCommandData(dataInput);
  const stats = data.stats;
  const battle = data.battle ?? EMPTY_BATTLE_STATE;
  const nextHp = stats && patch.hpCurrent !== undefined
    ? Math.max(0, Math.min(stats.hpMax, patch.hpCurrent)) : stats?.hpCurrent;
  const nextSuppression = stats && patch.suppression !== undefined
    ? Math.max(0, Math.min(3, patch.suppression)) : stats?.suppression;
  let nextBattle: SquadCommandBattleState = {
    ...battle,
    naniteBuffer: patch.naniteBuffer !== undefined ? Math.max(0, patch.naniteBuffer) : battle.naniteBuffer,
    deathTimer: patch.deathTimer !== undefined ? Math.max(0, Math.min(3, patch.deathTimer)) : battle.deathTimer,
  };
  // A GM's explicit HP override can recover a casualty. This must NOT be
  // applied to healing weapons, which stabilize Downed units instead.
  if (patch.hpCurrent !== undefined && nextHp !== undefined) {
    if (nextHp > 0 && (battle.downed || battle.battlefield.wrecked)) {
      nextBattle = {
        ...nextBattle, downed: false, deathTimer: 0,
        battlefield: { ...battle.battlefield, stabilized: false, wrecked: false, recoveryHp: 0 },
      };
    } else if (nextHp <= 0 && (stats?.hpCurrent ?? 0) > 0) {
      const vehicle = data.profile === 'vehicle';
      nextBattle = {
        ...nextBattle, downed: !vehicle, deathTimer: vehicle ? 0 : 3,
        battlefield: {
          ...battle.battlefield, wrecked: vehicle, stabilized: false, recoveryHp: 0,
          overwatch: { active: false, reactions: 0 },
        },
      };
    }
  }
  // Pinned cancels any already-armed reaction; Rally must clear Suppression.
  if ((nextSuppression ?? 0) >= 3 && (stats?.suppression ?? 0) < 3) {
    nextBattle = { ...nextBattle, battlefield: {
      ...nextBattle.battlefield, overwatch: { active: false, reactions: 0 },
    } };
  }
  const next: SquadCommandCharacterData = {
    ...data,
    stats: stats ? {
      ...stats,
      hpCurrent: nextHp ?? stats.hpCurrent,
      shieldCurrent: patch.shieldCurrent !== undefined ? Math.max(0, Math.min(stats.shieldMax, patch.shieldCurrent)) : stats.shieldCurrent,
      suppression: nextSuppression ?? stats.suppression,
    } : stats,
    battle: nextBattle,
  };
  return addCombatLog(next, 'GM override', note, 'gm');
}


// === SmugVTT 0.7.0: shared assignable Commander/PC special ability resolver ===
export const TW_SPECIAL_ABILITIES = [
  { id: 'orbital_rail_cannon', name: 'Orbital Rail Cannon', rules: 'True Hit • Smart Sight • 3d6+2 • AP 3 • effectively unlimited range.' },
  { id: 'medic', name: 'Medic', rules: 'Withdraw a Downed unit from combat and freeze its death timer. This is not a heal or resurrection.' },
  { id: 'resolve', name: 'Resolve', rules: 'Target takes 50% less incoming damage until its next Refresh/end of turn.' },
  { id: 'exalted', name: 'Exalted', rules: 'Target deals +50% rolled damage on its next attack, before defenses.' },
  { id: 'reaper', name: 'Reaper', rules: 'Target gains +2 Accuracy on its next attack.' },
] as const;

export function isSquadSpecialAbility(id: string): boolean {
  return TW_SPECIAL_ABILITIES.some((entry) => entry.id === id);
}

export function canUseSquadSpecialAbilities(dataInput: SquadCommandCharacterData): boolean {
  const data = normalizeSquadCommandData(dataInput);
  return data.fodder?.isSpawned !== true && (data.profile === 'commander' || data.isPlayerCharacter === true);
}

/** No implicit power grants. The character must have this exact ability on its sheet. */
export function specialUnavailableReason(dataInput: SquadCommandCharacterData, id: string): string | null {
  if (!isSquadSpecialAbility(id)) return 'Unknown special ability';
  if (!canUseSquadSpecialAbilities(dataInput)) return 'Commander or PC only';
  const reason = abilityUnavailableReason(dataInput, id);
  if (reason) return reason;
  if (normalizeSquadCommandData(dataInput).battle?.battlefield.specialEffects?.withdrawn) return 'Withdrawn from combat';
  return null;
}

export function grantSquadSpecialAbility(dataInput: SquadCommandCharacterData, id: string): SquadCommandCharacterData {
  const data = normalizeSquadCommandData(dataInput);
  if (!canUseSquadSpecialAbilities(data)) return data;
  const definition = TW_SPECIAL_ABILITIES.find((entry) => entry.id === id);
  if (!definition || (data.abilities ?? []).some((entry) => entry.id === id)) return data;
  return { ...data, abilities: [ ...(data.abilities ?? []), { ...definition } ] };
}

export function resolveSquadSpecialAbility(
  sourceInput: SquadCommandCharacterData,
  targetInput: SquadCommandCharacterData,
  abilityId: string,
  context: TwActionContext,
  sameUnit = false,
): TwCombatResult {
  const originalSource = normalizeSquadCommandData(sourceInput);
  const originalTarget = normalizeSquadCommandData(targetInput);
  let source = originalSource;
  let target = originalTarget;
  const def = TW_SPECIAL_ABILITIES.find((entry) => entry.id === abilityId);
  const title = `Special • ${def?.name ?? abilityId}`;
  const reason = specialUnavailableReason(source, abilityId);
  if (reason) return makeResult(false, title, [{ label: 'Unavailable', value: reason }], source, target, originalSource, originalTarget);
  if (!Number.isFinite(context.distance) || context.distance < 0) {
    return makeResult(false, title, [{label:'Range',value:'Invalid map distance.'}], source, target, originalSource, originalTarget);
  }
  const mode = context.actionMode ?? 'none';
  if (mode !== 'free' && mode !== 'push') return makeResult(false, title, [{ label: 'Action', value: 'A Free or Push action is required.' }], source, target, originalSource, originalTarget);
  // Commander abilities still obey the standard Free / Push action economy.
  if (abilityId === 'orbital_rail_cannon') {
    const virtual: SquadCommandWeapon = {
      id: '__special_orbital_rail_cannon', name: 'Orbital Rail Cannon',
      kind: 'attack', damage: '3d6+2', accuracy: 0, ap: '3',
      range: 'Orbital / unlimited', minRange: 0, effectiveRange: 1000000000,
      maxRange: 1000000000, autoHit: true, smartSight: true,
      canOverwatch: false, special: 'orbital_rail_cannon',
    };
    const result = resolveWeaponAction({ ...source, weapons: [...(source.weapons ?? []), virtual] }, target, virtual.id, context);
    if (!result.ok) return makeResult(false, title, result.rows, source, target, originalSource, originalTarget);
    source = spendAbility({ ...result.source, weapons: source.weapons ?? [] }, abilityId);
    target = result.target;
    source = addCombatLog(source, title, result.summary, 'attack');
    return makeResult(true, `${title} → ${target.characterName || 'Target'}`, result.rows, source, target, originalSource, originalTarget);
  }
  if (abilityId === 'medic' && (!target.battle?.downed || target.profile === 'vehicle' || target.battle?.battlefield.specialEffects?.withdrawn)) {
    return makeResult(false, title, [{label:'Target',value:'Requires a Downed, non-withdrawn, non-vehicle unit.'}], source, target, originalSource, originalTarget);
  }
  if (target.battle?.battlefield.specialEffects?.withdrawn) {
    return makeResult(false, title, [{label:'Target',value:'Unit is already withdrawn.'}], source, target, originalSource, originalTarget);
  }
  if (abilityId === 'resolve' && target.battle?.battlefield.specialEffects?.resolveActive) {
    return makeResult(false, title, [{label:'Target',value:'Resolve is already active.'}], source, target, originalSource, originalTarget);
  }
  if (abilityId === 'exalted' && target.battle?.battlefield.specialEffects?.exaltedActive) {
    return makeResult(false, title, [{label:'Target',value:'Exalted is already active.'}], source, target, originalSource, originalTarget);
  }
  if (abilityId === 'reaper' && target.battle?.battlefield.specialEffects?.reaperActive) {
    return makeResult(false, title, [{label:'Target',value:'Reaper is already active.'}], source, target, originalSource, originalTarget);
  }
  const acted = applyActionMode(source, mode);
  if (!acted) return makeResult(false, title, [{label:'Actions',value:'No Free/Push action remains.'}], source, target, originalSource, originalTarget);
  source = spendAbility(acted, abilityId);
  if (source.battle?.battlefield.overwatch.active) source = cancelOverwatch(source);
  if (sameUnit) target = source;
  const oldField = target.battle?.battlefield ?? EMPTY_BATTLE_STATE.battlefield;
  const oldEffects = oldField.specialEffects ?? {};
  const newEffects = {
    ...oldEffects,
    ...(abilityId === 'medic' ? { withdrawn: true } : {}),
    ...(abilityId === 'resolve' ? { resolveActive: true } : {}),
    ...(abilityId === 'exalted' ? { exaltedActive: true } : {}),
    ...(abilityId === 'reaper' ? { reaperActive: true } : {}),
  };
  target = {
    ...target,
    battle: {
      ...(target.battle ?? EMPTY_BATTLE_STATE),
      battlefield: {
        ...oldField,
        stabilized: abilityId === 'medic' ? true : oldField.stabilized,
        overwatch: abilityId === 'medic' ? { active: false, reactions: 0 } : oldField.overwatch,
        specialEffects: newEffects,
      },
    },
  };
  const detail = abilityId === 'medic' ? 'Downed casualty withdrawn and stabilized; death timer frozen. No HP was restored.'
    : abilityId === 'resolve' ? '50% incoming damage reduction until target refreshes.'
    : abilityId === 'exalted' ? 'Next attack +50% rolled damage before protection.'
    : 'Next attack +2 Accuracy.';
  const rows: TwCombatRow[] = [
    {label:'Ability',value:def?.name ?? abilityId},
    {label:'Target',value:target.characterName || 'Target'},
    {label:'Effect',value:detail},
    {label:'Action',value:mode === 'push' ? 'Push' : mode === 'free' ? 'Free' : 'GM/manual'},
  ];
  // For a self-targeting buff, the affected target IS the source. Keep its
  // new effect flags, spent action and log together instead of overwriting
  // the effect with the pre-buff source snapshot.
  source = addCombatLog(sameUnit ? target : source, title, `${target.characterName}: ${detail}`, 'support');
  if (sameUnit) target = source;
  else target = addCombatLog(target, `Targeted: ${def?.name}`, detail, 'support');
  return makeResult(true, `${title} → ${target.characterName || 'Target'}`, rows, source, target, originalSource, originalTarget);
}
