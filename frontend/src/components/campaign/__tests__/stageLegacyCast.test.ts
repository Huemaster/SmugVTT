import { describe, expect, it } from 'vitest';
import { importLegacyStageCast } from '../stageLegacyCast';
import type { SceneBoardState } from '@/types/sceneBoard';

describe('old Scene cast → freeform Stage images', () => {
  it('adds large speaker-linked art without mutating old Scene state', () => {
    const stage = { version: 1, background: '#111111',
      people: [{ key: 'character:one', name: 'Example', imageUrl: '/api/assets/maps/one', x: 50, y: 60 }] };
    const board = { background: '#222222', elements: [], smugSceneStage: stage } as unknown as SceneBoardState;
    const added = importLegacyStageCast(board, () => 'copied-1');
    expect(added).toMatchObject([{ id: 'copied-1', type: 'image', width: 640, height: 480,
      x: 480, y: 300, smugSpeakerKey: 'character:one' }]);
    expect((board as unknown as { smugSceneStage: unknown }).smugSceneStage).toBe(stage);
    expect(board.elements).toEqual([]);
  });
  it('does not duplicate linked portraits or copy malformed links', () => {
    const board = { background: '#000000', elements: [{ id: 'portrait', type: 'image',
      x: 0, y: 0, width: 640, height: 480, rotation: 0, z: 1, locked: false,
      smugSpeakerKey: 'npc:one' }], smugSceneStage: { people: [
        { key: 'npc:one', imageUrl: '/a.png', x: 20, y: 50 },
        { key: 'npc:bad', imageUrl: 'javascript:alert(1)', x: 20, y: 50 },
      ] } } as unknown as SceneBoardState;
    expect(importLegacyStageCast(board, () => 'id')).toHaveLength(0);
  });
});
