import type { SceneBoardElement } from '@/types/sceneBoard';

/** Keep player selection and focus intact when routine polling sees no change. */
export function stageContentChanged(
  previous: { id: string; boardVersion: number; updatedAt: string } | null,
  incoming: { id: string; boardVersion: number; updatedAt: string } | null,
): boolean {
  return previous?.id !== incoming?.id
    || previous?.boardVersion !== incoming?.boardVersion
    || previous?.updatedAt !== incoming?.updatedAt;
}

/** Only primary-button drags can move artwork. Player access is image-only. */
export function mayDragStageElement(
  mouseButton: number,
  canEdit: boolean,
  isGm: boolean,
  tool: 'select' | 'pen',
  element: Pick<SceneBoardElement, 'type' | 'locked' | 'hidden'>,
): boolean {
  return mouseButton === 0 && canEdit && tool === 'select'
    && !element.locked && !element.hidden && (isGm || element.type === 'image');
}
