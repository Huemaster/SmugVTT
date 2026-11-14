import { GameSystem } from '@prisma/client';
import type { CharacterTemplate } from './types';

export const squadCommandBlankTemplate: CharacterTemplate = {
  name: 'Blank Squad Command Unit',
  description: 'Generic Squad Command character template',
  gameSystem: GameSystem.SQUAD_COMMAND,
  data: {
    systemVersion: '0.6.1',
    profileRevision: 6,
    characterName: 'Example Unit',
    faction: 'astora',
    profile: 'trooper',
    unitId: 'example_infantry',
    branch: 'Example',
    stats: {
      hpCurrent: 7,
      hpMax: 7,
      defense: 8,
      av: 1,
      move: 8,
      shieldCurrent: 0,
      shieldMax: 0,
      suppression: 0,
    },
    weapons: [{ id: 'example_rifle', name: 'Example Rifle', kind: 'attack',
      damage: '1d6', accuracy: 0, ap: '0', range: 'Effective Close 3 / Maximum Medium 6',
      ammoCurrent: 10, ammoMax: 10, ammoCost: 1, cooldownCurrent: 0, cooldownMax: 0,
      minRange: 0, effectiveRange: 3, maxRange: 6, rangePenalty: -1,
      canOverwatch: true, suppressionOnDamage: 1, handling: 'Two-Handed',
      traits: 'Generic example weapon.' }],
    abilities: [],
    battle: {
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
      battlefield: {
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
      },
    },
    profileSource: {
      status: 'complete',
      reference: 'Squad Command learning template',
    },
    combatLog: [],
    notes: '',
  },
};

export function getSquadCommandTemplates(): CharacterTemplate[] {
  return [squadCommandBlankTemplate];
}

export function getSquadCommandTemplate(templateName?: string): CharacterTemplate {
  if (!templateName || templateName === 'blank') return squadCommandBlankTemplate;
  return squadCommandBlankTemplate;
}
