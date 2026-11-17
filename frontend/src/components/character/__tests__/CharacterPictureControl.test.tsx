import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Character } from '@/types';
import CharacterPictureControl from '../CharacterPictureControl';
import { api } from '@/services/api';
import { uploadTokenPicture } from '@/utils/tokenPicture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/utils/tokenPicture', () => ({
  tokenPictureProblem: () => null,
  uploadTokenPicture: vi.fn(),
}));
vi.mock('@/services/api', () => ({
  api: {
    getCharacter: vi.fn(),
    updateCharacter: vi.fn(),
  },
}));

const initial = {
  id: 'character-1', name: 'Sample Hero', campaignId: 'campaign-1',
  tokenImageUrl: '/api/assets/tokens/old', updatedAt: '2026-11-01T00:00:00Z',
} as Character;
const fresh = { ...initial, updatedAt: '2026-11-15T00:00:00Z' };

beforeEach(() => { vi.clearAllMocks(); });

describe('character journal picture control', () => {
  it('uploads and saves only the new picture, retaining the rest of the journal', async () => {
    vi.mocked(uploadTokenPicture).mockResolvedValue('/api/assets/tokens/new');
    vi.mocked(api.getCharacter).mockResolvedValue({ character: fresh });
    vi.mocked(api.updateCharacter).mockResolvedValue({ character: { ...fresh, tokenImageUrl: '/api/assets/tokens/new' }, message: 'OK' });
    const onSaved = vi.fn();
    const { container } = render(<CharacterPictureControl character={initial} onSaved={onSaved} />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['png'], 'portrait.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(uploadTokenPicture).toHaveBeenCalledWith(expect.any(File), 'Sample Hero', 'campaign-1');
    expect(api.updateCharacter).toHaveBeenCalledWith('character-1', {
      tokenImageUrl: '/api/assets/tokens/new', updatedAt: fresh.updatedAt,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Character picture updated.');
  });

  it('keeps the old portrait if upload fails', async () => {
    vi.mocked(uploadTokenPicture).mockRejectedValue(new Error('Upload refused'));
    const onSaved = vi.fn();
    const { container } = render(<CharacterPictureControl character={initial} onSaved={onSaved} />);
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['png'], 'portrait.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(api.updateCharacter).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
