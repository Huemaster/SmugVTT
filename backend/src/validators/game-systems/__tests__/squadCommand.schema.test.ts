import { squadCommandCharacterDataSchema } from '../squadCommand.schema';

describe('squadCommandCharacterDataSchema', () => {
  it('accepts a minimal Squad Command character', () => {
    expect(() =>
      squadCommandCharacterDataSchema.parse({
        characterName: 'Example Unit',
      })
    ).not.toThrow();
  });

  it('accepts v0.2 structured combat state', () => {
    const parsed = squadCommandCharacterDataSchema.parse({
      characterName: 'Example Infantry',
      systemVersion: '0.2.0',
      profileRevision: 2,
      faction: 'astora',
      profile: 'trooper',
      unitId: 'example_infantry',
      stats: {
        hpCurrent: 7,
        hpMax: 7,
        defense: 8,
        av: 1,
        move: 8,
        shieldCurrent: 8,
        shieldMax: 8,
        suppression: 0,
      },
      weapons: [
        {
          id: 'example_rifle',
          name: 'Example Rifle',
          kind: 'attack',
          damage: '3d6',
          accuracy: 2,
          ap: '1',
          range: 'Melee/CQC',
          minRange: 0,
          effectiveRange: 1,
          maxRange: 1,
          canOverwatch: false,
          suppressionOnDamage: 1,
        },
      ],
      battle: {
        active: true,
        round: 1,
        activation: 1,
        actionsThisActivation: 1,
        pushesThisActivation: 0,
        fatiguePenalty: 0,
        rallyUsed: false,
        relentlessUsed: false,
        downed: false,
        deathTimer: 0,
        naniteBuffer: 0,
        bastionActive: false,
      },
    });

    expect(parsed.unitId).toBe('example_infantry');
  });

  it('rejects Suppression above 3', () => {
    expect(() =>
      squadCommandCharacterDataSchema.parse({
        characterName: 'Invalid',
        stats: {
          hpCurrent: 1,
          hpMax: 1,
          defense: 8,
          av: 0,
          move: 6,
          shieldCurrent: 0,
          shieldMax: 0,
          suppression: 4,
        },
      })
    ).toThrow();
  });

  it('rejects more than two Pushes in one activation', () => {
    expect(() =>
      squadCommandCharacterDataSchema.parse({
        characterName: 'Invalid',
        battle: {
          active: true,
          round: 1,
          activation: 1,
          actionsThisActivation: 3,
          pushesThisActivation: 3,
          fatiguePenalty: -6,
          rallyUsed: false,
          relentlessUsed: false,
          downed: false,
          deathTimer: 0,
          naniteBuffer: 0,
          bastionActive: false,
        },
      })
    ).toThrow();
  });
  it('accepts v0.6 battlefield, source metadata, directional AV and combat log', () => {
    const parsed = squadCommandCharacterDataSchema.parse({
      characterName: 'Example Transport',
      systemVersion: '0.6.1',
      profileRevision: 6,
      faction: 'astora',
      profile: 'vehicle',
      unitId: 'example_transport',
      profileSource: { status: 'complete', reference: 'generic test fixture' },
      stats: {
        hpCurrent: 20, hpMax: 20, defense: 6, av: 1, move: 12,
        shieldCurrent: 16, shieldMax: 16, suppression: 0,
        directionalAV: { front: 1, side: 1, rear: 0 },
      },
      battle: {
        active: true, round: 1, activation: 1,
        actionsThisActivation: 0, pushesThisActivation: 0, fatiguePenalty: 0,
        rallyUsed: false, relentlessUsed: false, downed: false, deathTimer: 0,
        naniteBuffer: 0, bastionActive: false,
        battlefield: {
          cover: 0, attackEdge: 0, highGround: false, prone: false, obscured: false,
          poorVisibility: false, flanked: false, stabilized: false, wrecked: false,
          recoveryHp: 0, vehicleArc: 'front', overwatch: { active: false, reactions: 0 },
          targetDistance: 3, targetCover: 1, targetProne: false, targetObscured: false,
          targetIsVehicle: false, targetArc: 'front',
        },
      },
      combatLog: [{ id: '1', at: '2026-11-11T00:00:00.000Z', title: 'Test', detail: 'ok', kind: 'state' }],
    });
    expect(parsed.stats?.directionalAV?.front).toBe(1);
    expect(parsed.battle?.battlefield?.targetCover).toBe(1);
  });

});
