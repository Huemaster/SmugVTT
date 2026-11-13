import type { SheetChrome } from './sheetChrome';

export type SquadCommandFaction = 'astora' | 'westphal' | 'albion' | 'gaulia';
export type SquadCommandProfile = 'trooper' | 'commander' | 'vehicle';
export type SquadCommandWeaponKind = 'attack' | 'heal' | 'psychic' | 'smoke' | 'support';
export type SquadCommandChatChime = 'default' | 'bell' | 'soft' | 'spark' | 'wood';
export type SquadCommandCover = 0 | 1 | 2;
export type SquadCommandAttackEdge = -1 | 0 | 1;
export type SquadCommandVehicleArc = 'front' | 'side' | 'rear';
export type SquadCommandSourceStatus = 'complete' | 'source-locked' | 'custom';
export type SquadCommandFodderDisposition = 'friendly' | 'neutral' | 'hostile';

export interface SquadCommandFodderConfig {
  /** Default square token footprint, in map grid cells. */
  tokenSize?: number;
  /** Default map disposition/team for spawned copies. */
  disposition?: SquadCommandFodderDisposition;
  isSpawned?: boolean;
}

export interface SquadCommandUnitStats {
  hpCurrent: number;
  hpMax: number;
  defense: number;
  av: number;
  move: number;
  shieldCurrent: number;
  shieldMax: number;
  suppression: number;
  directionalAV?: {
    front: number;
    side: number;
    rear: number;
  };
}

export interface SquadCommandOverwatchState {
  active: boolean;
  weaponId?: string;
  reactions: number;
}

export interface SquadCommandBattlefieldState {
  cover: SquadCommandCover;
  attackEdge: SquadCommandAttackEdge;
  highGround: boolean;
  prone: boolean;
  obscured: boolean;
  poorVisibility: boolean;
  flanked: boolean;
  stabilized: boolean;
  wrecked: boolean;
  recoveryHp: number;
  vehicleArc: SquadCommandVehicleArc;
  embarkedIn?: string;
  overwatch: SquadCommandOverwatchState;
  targetDistance: number;
  targetCover: SquadCommandCover;
  targetProne: boolean;
  targetObscured: boolean;
  targetIsVehicle: boolean;
  targetArc: SquadCommandVehicleArc;
  /** Active-only temporary Commander / PC effects. No effect is implicit. */
  specialEffects?: {
    resolveActive?: boolean;
    exaltedActive?: boolean;
    reaperActive?: boolean;
    withdrawn?: boolean;
  };
}

export interface SquadCommandBattleState {
  active: boolean;
  round: number;
  activation: number;
  actionsThisActivation: number;
  pushesThisActivation: number;
  fatiguePenalty: number;
  rallyUsed: boolean;
  relentlessUsed: boolean;
  downed: boolean;
  deathTimer: number;
  naniteBuffer: number;
  bastionActive: boolean;
  battlefield: SquadCommandBattlefieldState;
}

export interface SquadCommandWeapon {
  id: string;
  name: string;
  kind?: SquadCommandWeaponKind;
  damage: string;
  accuracy: number;
  ap: string;
  range: string;

  ammoCurrent?: number;
  ammoMax?: number;
  ammoCost?: number;
  cooldownCurrent?: number;
  cooldownMax?: number;

  minRange?: number;
  effectiveRange?: number;
  maxRange?: number;
  rangePenalty?: number;
  rangeEdges?: Partial<Record<'melee' | 'close' | 'medium' | 'long' | 'extreme', SquadCommandAttackEdge>>;

  ignoreAV?: boolean;
  ignoreCover?: boolean;
  antiTank?: boolean;
  autoHit?: boolean;
  smartSight?: boolean;
  canOverwatch?: boolean;
  overwatchMax?: number;
  suppressionOnDamage?: number;
  shieldHealing?: boolean;
  noSplash?: boolean;
  disadvantageVsNonVehicle?: boolean;
  special?: string;

  handling?: string;
  traits?: string;
}

export interface SquadCommandAbility {
  id: string;
  name: string;
  usesCurrent?: number;
  usesMax?: number;
  cooldownCurrent?: number;
  cooldownMax?: number;
  special?: string;
  rules?: string;
}

export interface SquadCommandProfileSource {
  status: SquadCommandSourceStatus;
  reference: string;
  note?: string;
}

export interface SquadCommandCombatLogEntry {
  id: string;
  at: string;
  title: string;
  detail: string;
  kind: 'attack' | 'support' | 'state' | 'gm';
}

export interface SquadCommandCharacterData extends SheetChrome {
  systemVersion?: string;
  profileRevision?: number;

  characterName: string;
  playerName?: string;
  /** Assigned by the GM; PCs qualify for special abilities without becoming a Commander. */
  isPlayerCharacter?: boolean;
  chatChime?: SquadCommandChatChime;

  faction?: SquadCommandFaction;
  profile?: SquadCommandProfile;
  unitId?: string;
  branch?: string;
  packageId?: string;
  profileSource?: SquadCommandProfileSource;
  /** GM-only spawn defaults used by the Squad Command Units workflow. */
  fodder?: SquadCommandFodderConfig;

  stats?: SquadCommandUnitStats;
  weapons?: SquadCommandWeapon[];
  abilities?: SquadCommandAbility[];
  battle?: SquadCommandBattleState;
  combatLog?: SquadCommandCombatLogEntry[];

  /** v0.1 compatibility only; normalized into battle.rallyUsed */
  rallyUsed?: boolean;

  notes?: string;
}
