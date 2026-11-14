/** Public Squad Command learning catalog — original private catalogs are excluded. */
import { WEAPON_COMBAT_METADATA } from './combatMetadata';
import { EMPTY_BATTLE_STATE, TW_PROFILE_REVISION, TW_SYSTEM_VERSION } from './battleState';
import type {
  SquadCommandAbility,
  SquadCommandCharacterData,
  SquadCommandFaction,
  SquadCommandProfile,
  SquadCommandUnitStats,
  SquadCommandWeapon,
  SquadCommandWeaponKind,
} from '../../../types/game-systems/squadCommand';

interface WeaponDefinition {
  name: string; kind?: SquadCommandWeaponKind; damage: string; accuracy: number;
  ap: string; range: string; ammoMax?: number; cooldownMax?: number;
  handling?: string; traits?: string;
}
interface AbilityDefinition { name: string; usesMax?: number; cooldownMax?: number; rules?: string; }
export interface UnitDefinition {
  id: string; name: string; faction: SquadCommandFaction; profile: SquadCommandProfile;
  branch: string; stats?: Omit<SquadCommandUnitStats, 'hpCurrent' | 'shieldCurrent' | 'suppression'>;
  weapons: string[]; abilities: string[];
  sourceStatus?: 'complete' | 'source-locked'; sourceReference?: string; sourceNote?: string;
}
export interface VehicleCatalogEntry {
  id: string; name: string; faction: SquadCommandFaction;
  status: 'complete' | 'source-locked'; note?: string;
}

// The historical keys are retained in stored data for backwards compatibility.
// Only generic labels are shown to players and GMs.
export const FACTION_LABELS: Record<SquadCommandFaction, string> = {
  astora: 'Faction 1', westphal: 'Faction 2',
  albion: 'Faction 3', gaulia: 'Faction 4',
};
export const PROFILE_LABELS: Record<SquadCommandProfile, string> = {
  trooper: 'Trooper', commander: 'Commander', vehicle: 'Vehicle',
};
export const WEAPONS: Record<string, WeaponDefinition> = {
  example_rifle: { name: 'Example Rifle', kind: 'attack', damage: '1d6', accuracy: 0,
    ap: '0', range: 'Effective Close 3 / Maximum Medium 6', ammoMax: 10,
    handling: 'Two-Handed', traits: 'Example weapon for training; freely editable.' },
  example_launcher: { name: 'Example Launcher', kind: 'attack', damage: '2d6', accuracy: -1,
    ap: '1', range: 'Effective Medium 6 / Maximum Long 9', ammoMax: 2,
    handling: 'Two-Handed', traits: 'Example support weapon; freely editable.' },
};
export const ABILITIES: Record<string, AbilityDefinition> = {
  eager: { name: 'Eager', usesMax: 1, rules: 'One free Rally per battle.' },
  relentless: { name: 'Relentless', usesMax: 1, rules: 'Ignore becoming Pinned once per battle.' },
  monocle: { name: 'Monocle', rules: 'Example passive trait.' },
};
export const UNITS: Record<string, UnitDefinition> = {
  example_infantry: { id: 'example_infantry', name: 'Example Infantry', faction: 'astora',
    profile: 'trooper', branch: 'Example',
    stats: { hpMax: 10, defense: 9, av: 0, move: 6, shieldMax: 0 },
    weapons: ['example_rifle'], abilities: ['eager'], sourceStatus: 'complete',
    sourceReference: 'Squad Command learning template' },
  example_support: { id: 'example_support', name: 'Example Support', faction: 'westphal',
    profile: 'trooper', branch: 'Example',
    stats: { hpMax: 12, defense: 8, av: 1, move: 5, shieldMax: 0 },
    weapons: ['example_launcher'], abilities: ['relentless'], sourceStatus: 'complete',
    sourceReference: 'Squad Command learning template' },
};
export const PALADIN_PACKAGES: Record<string, { name: string; weapons: string[] }> = {};
const TROOPER_ORDER: Record<SquadCommandFaction, string[]> = {
  astora: ['example_infantry'], westphal: ['example_support'],
  albion: [], gaulia: [],
};
export const VEHICLE_CATALOG: VehicleCatalogEntry[] = [];
export const PROMOTION_TREES: Record<SquadCommandFaction, string[][]> = {
  astora: [['Example Infantry']], westphal: [['Example Support']],
  albion: [], gaulia: [],
};

export function unitIdsFor(faction: SquadCommandFaction, profile: SquadCommandProfile): string[] {
  if (profile === 'trooper') return TROOPER_ORDER[faction] ?? [];
  return [];
}

export function firstUnitIdFor(faction: SquadCommandFaction, profile: SquadCommandProfile): string | undefined {
  return unitIdsFor(faction, profile)[0];
}

export function weaponFromDefinition(id: string): SquadCommandWeapon {
  const definition = WEAPONS[id];
  if (!definition) {
    return { id, name: id, damage: '0', accuracy: 0, ap: '0', range: '' };
  }
  return {
    id,
    ...definition,
    ...(WEAPON_COMBAT_METADATA[id] ?? {}),
    ammoCurrent: definition.ammoMax,
    ammoMax: definition.ammoMax,
    cooldownCurrent: 0,
    cooldownMax: definition.cooldownMax,
  };
}

export function abilityFromDefinition(id: string): SquadCommandAbility {
  const definition = ABILITIES[id];
  if (!definition) return { id, name: id };
  return {
    id,
    ...definition,
    special: id,
    usesCurrent: definition.usesMax,
    usesMax: definition.usesMax,
    cooldownCurrent: 0,
    cooldownMax: definition.cooldownMax,
  };
}

export function applyCanonicalUnit(
  current: SquadCommandCharacterData,
  unitId: string,
  _packageId?: string
): SquadCommandCharacterData {
  const unit = UNITS[unitId];
  // Important: never reset an existing user's custom or legacy unit when
  // its original preset is intentionally not distributed in the public build.
  if (!unit || !unit.stats) return { ...current, unitId };
  return {
    ...current,
    systemVersion: TW_SYSTEM_VERSION,
    profileRevision: TW_PROFILE_REVISION,
    faction: unit.faction,
    profile: unit.profile,
    unitId: unit.id,
    branch: unit.branch,
    packageId: undefined,
    profileSource: { status: 'complete', reference: 'Squad Command learning template' },
    stats: {
      hpCurrent: unit.stats.hpMax,
      hpMax: unit.stats.hpMax,
      defense: unit.stats.defense,
      av: unit.stats.av,
      move: unit.stats.move,
      shieldCurrent: unit.stats.shieldMax,
      shieldMax: unit.stats.shieldMax,
      suppression: 0,
    },
    weapons: unit.weapons.map(weaponFromDefinition),
    abilities: unit.abilities.map(abilityFromDefinition),
    battle: structuredClone(EMPTY_BATTLE_STATE),
    rallyUsed: undefined,
  };
}

export function makeCustomProfile(
  current: SquadCommandCharacterData,
  faction: SquadCommandFaction,
  profile: SquadCommandProfile
): SquadCommandCharacterData {
  return {
    ...current,
    faction,
    profile,
    unitId: profile === 'commander' ? 'custom_commander' : 'custom_vehicle',
    branch: profile === 'commander' ? 'Commander' : 'Vehicle',
    packageId: undefined,
    profileSource: { status: 'custom', reference: 'Custom / GM-authored profile' },
  };
}
