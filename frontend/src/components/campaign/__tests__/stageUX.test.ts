import { describe, expect, it } from 'vitest';
import { defaultStageImagePosition, mayDragStageElement, stageContentChanged } from '../stageUX';

describe('Stage interaction guardrails', () => {
  const img = { type: 'image' as const, locked: false, hidden: false };
  const scene = { id: 'scene-a', boardVersion: 3, updatedAt: '2026-11-15T12:00:00.000Z' };

  it('does not treat a routine unchanged viewer poll as a reload', () => {
    expect(stageContentChanged(scene, { ...scene })).toBe(false);
    expect(stageContentChanged(scene, { ...scene, boardVersion: 4 })).toBe(true);
    expect(stageContentChanged(scene, { ...scene, id: 'scene-b' })).toBe(true);
    expect(stageContentChanged(scene, null)).toBe(true);
    expect(stageContentChanged(null, null)).toBe(false);
  });

  it('allows primary-button image dragging but never mistakes a right click for a drag', () => {
    expect(mayDragStageElement(0, true, false, 'select', img)).toBe(true);
    expect(mayDragStageElement(2, true, true, 'select', img)).toBe(false);
    expect(mayDragStageElement(1, true, true, 'select', img)).toBe(false);
  });

  it('places large pictures centrally and offsets successive uploads', () => {
    expect(defaultStageImagePosition(0)).toEqual({ x: 480, y: 210 });
    expect(defaultStageImagePosition(1)).toEqual({ x: 512, y: 242 });
    expect(defaultStageImagePosition(4)).toEqual({ x: 608, y: 338 });
    expect(defaultStageImagePosition(5)).toEqual({ x: 480, y: 210 });
  });

  it('does not allow spectators, hidden/locked images or non-picture player edits', () => {
    expect(mayDragStageElement(0, false, false, 'select', img)).toBe(false);
    expect(mayDragStageElement(0, true, false, 'pen', img)).toBe(false);
    expect(mayDragStageElement(0, true, false, 'select', { ...img, locked: true })).toBe(false);
    expect(mayDragStageElement(0, true, false, 'select', { ...img, hidden: true })).toBe(false);
    expect(mayDragStageElement(0, true, false, 'select', { type: 'stroke', locked: false, hidden: false })).toBe(false);
    expect(mayDragStageElement(0, true, true, 'select', { type: 'stroke', locked: false, hidden: false })).toBe(true);
  });
});
