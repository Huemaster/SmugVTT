import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CampaignSceneBoard } from '@/types/sceneBoard';

const state = vi.hoisted(() => {
  const speakerHistory: unknown[] = [];
  const showToast = vi.fn();
  const scene = {
    id: 'scene-1', campaignId: 'campaign-1', title: 'Shared Stage', location: null,
    timeLabel: null, imageUrl: null, participantIds: [], summary: null, gmNotes: null,
    revealed: true, active: true, boardVisibility: 'shared', boardVersion: 1,
    startedAt: '2026-11-15T10:00:00.000Z', endedAt: null,
    createdAt: '2026-11-15T10:00:00.000Z', updatedAt: '2026-11-15T10:00:00.000Z',
    boardState: { background: '#f4efe6', allowPlayerEditing: true, elements: [
      { id: 'portrait', type: 'image', x: 100, y: 100, width: 640, height: 480,
        rotation: 0, z: 1, locked: false, hidden: false, imageUrl: '/portrait.gif' },
    ] },
  };
  const api = {
    getActiveSceneBoard: vi.fn(async () => ({ scene: JSON.parse(JSON.stringify(scene)) as CampaignSceneBoard })),
    listSceneBoards: vi.fn(async () => ({ scenes: [scene] })),
    listCampaignNpcs: vi.fn(async () => ({ npcs: [] })),
    getAssetUrl: vi.fn((id: string) => '/assets/' + id),
  };
  return { scene, speakerHistory, api, showToast };
});

vi.mock('@/services/api', () => ({ api: state.api }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'campaign-1', characters: [] },
    userRole: 'PLAYER',
  }),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: state.showToast }) }));
vi.mock('../sceneDialogue', () => ({
  getSceneHistory: () => state.speakerHistory,
  subscribeSceneHistory: () => () => undefined,
  subscribeLiveSceneDialogue: () => () => undefined,
}));
vi.mock('../canvasSpeechAnchor', () => ({
  measureCanvasArt: async () => null,
  canvasArtSpeechX: () => 0,
}));

import SceneBoardPanel from '../SceneBoardPanel';

describe('shared Stage UX', () => {
  let poll: (() => void) | undefined;

  beforeEach(() => {
    poll = undefined;
    state.api.getActiveSceneBoard.mockClear();
    state.scene.boardVersion = 1;
    state.scene.updatedAt = '2026-11-15T10:00:00.000Z';
    state.scene.boardState.allowPlayerEditing = true;
    vi.spyOn(window, 'setInterval').mockImplementation((fn: TimerHandler, interval?: number) => {
      if (interval === 4000 && typeof fn === 'function') poll = fn as () => void;
      return 17;
    });
    vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps a selected picture resizable across unchanged and changed player polls', async () => {
    const { container } = render(<SceneBoardPanel />);
    await screen.findByText('Shared Stage');
    const img = container.querySelector('img[src="/portrait.gif"]');
    expect(img).not.toBeNull();
    fireEvent.click(img!);
    expect(screen.getByRole('button', { name: 'Resize selected scene element' })).toBeInTheDocument();
    expect(poll).toBeTypeOf('function');

    await act(async () => { poll!(); await Promise.resolve(); });
    expect(screen.getByRole('button', { name: 'Resize selected scene element' })).toBeInTheDocument();

    state.scene.boardVersion = 2;
    state.scene.updatedAt = '2026-11-15T10:00:01.000Z';
    await act(async () => { poll!(); await Promise.resolve(); });
    expect(screen.getByRole('button', { name: 'Resize selected scene element' })).toBeInTheDocument();
  });

  it('defaults to read-only when the GM has not enabled shared arranging', async () => {
    state.scene.boardState.allowPlayerEditing = false;
    const { container } = render(<SceneBoardPanel />);
    await screen.findByText('Shared Stage');
    fireEvent.click(container.querySelector('img[src="/portrait.gif"]')!);
    expect(screen.queryByRole('button', { name: 'Resize selected scene element' })).toBeNull();
  });
});
