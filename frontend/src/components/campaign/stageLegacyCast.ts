import type { SceneBoardElement, SceneBoardState } from '@/types/sceneBoard';

/**
 * A one-way, additive bridge for pre-Stage v1 Scene cast portraits. The old
 * smugSceneStage record is preserved, not silently deleted or rewritten.
 */
export function importLegacyStageCast(board: SceneBoardState, makeId: () => string): SceneBoardElement[] {
  const value = (board as SceneBoardState & { smugSceneStage?: unknown }).smugSceneStage;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const people = (value as Record<string, unknown>).people;
  if (!Array.isArray(people)) return [];

  const existing = new Set(board.elements.filter((item) => item.type === 'image' && item.smugSpeakerKey)
    .map((item) => item.smugSpeakerKey));
  let z = Math.max(0, ...board.elements.map((item) => item.z));
  const result: SceneBoardElement[] = [];

  for (const person of people.slice(0, 40)) {
    if (!person || typeof person !== 'object' || Array.isArray(person)) continue;
    const p = person as Record<string, unknown>;
    if (typeof p.key !== 'string' || !/^(character|npc):[^:]+$/.test(p.key) || existing.has(p.key)) continue;
    if (typeof p.imageUrl !== 'string' || !/^(https?:\/\/|\/)/.test(p.imageUrl)) continue;
    const centerX = Math.max(0, Math.min(100, typeof p.x === 'number' ? p.x : 50)) * 16;
    const centerY = Math.max(0, Math.min(100, typeof p.y === 'number' ? p.y : 50)) * 9;
    result.push({
      id: makeId(), type: 'image',
      x: Math.max(0, Math.min(960, Math.round(centerX - 320))),
      y: Math.max(0, Math.min(420, Math.round(centerY - 240))),
      width: 640, height: 480, rotation: 0, z: ++z, locked: false,
      imageUrl: p.imageUrl, smugSpeakerKey: p.key,
      stageAutoReact: true, stageMotion: 'pulse', stageEmote: 'none',
    });
    existing.add(p.key);
    if (board.elements.length + result.length >= 1000) break;
  }
  return result;
}
