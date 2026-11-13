import type { SquadCommandWeapon } from '../../../types/game-systems/squadCommand';

export type SquadCommandWeaponCombatMetadata = Pick<
  SquadCommandWeapon,
  | 'ammoCost'
  | 'minRange'
  | 'effectiveRange'
  | 'maxRange'
  | 'rangePenalty'
  | 'ignoreAV'
  | 'ignoreCover'
  | 'antiTank'
  | 'autoHit'
  | 'smartSight'
  | 'canOverwatch'
  | 'suppressionOnDamage'
  | 'shieldHealing'
  | 'noSplash'
  | 'disadvantageVsNonVehicle'
  | 'special'
  | 'overwatchMax'
  | 'rangeEdges'
>;

const ranged = (
  effectiveRange: number,
  maxRange: number,
  extra: SquadCommandWeaponCombatMetadata = {}
): SquadCommandWeaponCombatMetadata => ({
  minRange: 0,
  effectiveRange,
  maxRange,
  canOverwatch: true,
  suppressionOnDamage: 1,
  ...extra,
});

export const WEAPON_COMBAT_METADATA: Record<string, SquadCommandWeaponCombatMetadata> = {
  example_rifle: ranged(3, 6, { ammoCost: 1, rangePenalty: -1, overwatchMax: 10 }),
  example_launcher: ranged(6, 9, { ammoCost: 1, rangePenalty: -1, overwatchMax: 2 }),
};
