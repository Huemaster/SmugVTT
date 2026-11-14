import { z } from 'zod';
import { themeColorSchema } from './sheetChrome';
import {
  sheetCharacterNameSchema,
  sheetShortTextSchema as shortText,
  sheetLongTextSchema as longText,
} from './sheetText';
import { sheetList } from './sheetLists';

export const squadCommandFactionSchema = z.enum(['astora', 'westphal', 'albion', 'gaulia']);
export const squadCommandProfileSchema = z.enum(['trooper', 'commander', 'vehicle']);
export const squadCommandChatChimeSchema = z.enum(['default', 'bell', 'soft', 'spark', 'wood']);

const unitStatsSchema = z.object({
  hpCurrent: z.number().int().min(0),
  hpMax: z.number().int().min(0),
  defense: z.number().int().min(0),
  av: z.number().int().min(0),
  move: z.number().int().min(0),
  shieldCurrent: z.number().int().min(0),
  shieldMax: z.number().int().min(0),
  suppression: z.number().int().min(0).max(3),
  directionalAV: z.object({
    front: z.number().int().min(0),
    side: z.number().int().min(0),
    rear: z.number().int().min(0),
  }).optional(),
});

const battlefieldStateSchema = z.object({
  cover: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  attackEdge: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  highGround: z.boolean(),
  prone: z.boolean(),
  obscured: z.boolean(),
  poorVisibility: z.boolean(),
  flanked: z.boolean(),
  stabilized: z.boolean(),
  wrecked: z.boolean(),
  recoveryHp: z.number().int().min(0),
  vehicleArc: z.enum(['front', 'side', 'rear']),
  embarkedIn: shortText.optional(),
  overwatch: z.object({
    active: z.boolean(),
    weaponId: shortText.optional(),
    reactions: z.number().int().min(0),
  }),
  targetDistance: z.number().int().min(0).max(99),
  targetCover: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  targetProne: z.boolean(),
  targetObscured: z.boolean(),
  targetIsVehicle: z.boolean(),
  targetArc: z.enum(['front', 'side', 'rear']),
  specialEffects: z.object({
    resolveActive: z.boolean().optional(),
    exaltedActive: z.boolean().optional(),
    reaperActive: z.boolean().optional(),
    withdrawn: z.boolean().optional(),
  }).optional(),
});

const battleStateSchema = z.object({
  active: z.boolean(),
  round: z.number().int().min(0),
  activation: z.number().int().min(0),
  actionsThisActivation: z.number().int().min(0).max(3),
  pushesThisActivation: z.number().int().min(0).max(2),
  fatiguePenalty: z.number().int().max(0),
  rallyUsed: z.boolean(),
  relentlessUsed: z.boolean(),
  downed: z.boolean(),
  deathTimer: z.number().int().min(0).max(3),
  naniteBuffer: z.number().int().min(0),
  bastionActive: z.boolean(),
  // Optional for v0.1/v0.2 stored characters; the frontend normalizer upgrades it on next save.
  battlefield: battlefieldStateSchema.optional(),
});

const weaponSchema = z.object({
  id: shortText.min(1),
  name: shortText,
  kind: z.enum(['attack', 'heal', 'psychic', 'smoke', 'support']).optional(),
  damage: shortText,
  accuracy: z.number().int(),
  ap: shortText,
  range: shortText,

  ammoCurrent: z.number().int().min(0).optional(),
  ammoMax: z.number().int().min(0).optional(),
  ammoCost: z.number().int().min(0).optional(),
  cooldownCurrent: z.number().int().min(0).optional(),
  cooldownMax: z.number().int().min(0).optional(),

  minRange: z.number().int().min(0).optional(),
  effectiveRange: z.number().int().min(0).optional(),
  maxRange: z.number().int().min(0).optional(),
  rangePenalty: z.number().int().optional(),
  rangeEdges: z.object({
    melee: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
    close: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
    medium: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
    long: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
    extreme: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
  }).optional(),

  ignoreAV: z.boolean().optional(),
  ignoreCover: z.boolean().optional(),
  antiTank: z.boolean().optional(),
  autoHit: z.boolean().optional(),
  smartSight: z.boolean().optional(),
  canOverwatch: z.boolean().optional(),
  overwatchMax: z.number().int().min(0).optional(),
  suppressionOnDamage: z.number().int().min(0).optional(),
  shieldHealing: z.boolean().optional(),
  noSplash: z.boolean().optional(),
  disadvantageVsNonVehicle: z.boolean().optional(),
  special: shortText.optional(),

  handling: shortText.optional(),
  traits: longText.optional(),
});

const abilitySchema = z.object({
  id: shortText.min(1),
  name: shortText,
  usesCurrent: z.number().int().min(0).optional(),
  usesMax: z.number().int().min(0).optional(),
  cooldownCurrent: z.number().int().min(0).optional(),
  cooldownMax: z.number().int().min(0).optional(),
  special: shortText.optional(),
  rules: longText.optional(),
});

export const squadCommandCharacterDataSchema = z.object({
  themeColor: themeColorSchema,
  systemVersion: shortText.optional(),
  profileRevision: z.number().int().min(1).optional(),

  characterName: sheetCharacterNameSchema,
  playerName: shortText.optional(),
  isPlayerCharacter: z.boolean().optional(),
  chatChime: squadCommandChatChimeSchema.optional(),

  faction: squadCommandFactionSchema.optional(),
  profile: squadCommandProfileSchema.optional(),
  unitId: shortText.optional(),
  branch: shortText.optional(),
  packageId: shortText.optional(),
  profileSource: z.object({
    status: z.enum(['complete', 'source-locked', 'custom']),
    reference: shortText,
    note: longText.optional(),
  }).optional(),
  fodder: z.object({
    tokenSize: z.number().int().min(1).max(6).optional(),
    disposition: z.enum(['friendly', 'neutral', 'hostile']).optional(),
    isSpawned: z.boolean().optional(),
  }).optional(),

  stats: unitStatsSchema.optional(),
  weapons: sheetList(weaponSchema, 24).optional(),
  abilities: sheetList(abilitySchema, 50).optional(),
  battle: battleStateSchema.optional(),
  combatLog: sheetList(z.object({
    id: shortText.min(1),
    at: shortText,
    title: shortText,
    detail: longText,
    kind: z.enum(['attack', 'support', 'state', 'gm']),
  }), 40).optional(),

  // v0.1 compatibility. New saves no longer need this field.
  rallyUsed: z.boolean().optional(),

  notes: longText.optional(),
});

export type SquadCommandCharacterData = z.infer<typeof squadCommandCharacterDataSchema>;
