import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StagePicture, STAGE_EMOTES, STAGE_MOTIONS, stageEmote, stageMotion } from '../StageEffects';
import type { StageCue } from '@/types/sceneBoard';

describe('Stage visual novel / JRPG picture cues', () => {
  const cue: StageCue = { id: 'cast-cue-1', at: 100, motion: 'hop', emote: 'alert' };

  it('has finite known motion/emote choices and rejects arbitrary stored values', () => {
    expect(STAGE_MOTIONS.map(([id]) => id)).toContain('jolt');
    expect(STAGE_EMOTES.map(([id]) => id)).toContain('thought');
    expect(stageMotion('shake')).toBe('shake');
    expect(stageEmote('gloom')).toBe('gloom');
    expect(stageMotion('infinite-random-motion')).toBe('none');
    expect(stageEmote('<unsafe>')).toBe('none');
  });

  it('keeps an animated GIF image while adding a silent graphic cue', () => {
    const { container, rerender } = render(<StagePicture src="/api/assets/gif/example.gif" cue={cue} />);
    const picture = container.querySelector('img');
    expect(picture).toHaveAttribute('src', '/api/assets/gif/example.gif');
    expect(container.querySelector('.smug-stage-motion-hop')).not.toBeNull();
    expect(container.querySelector('.smug-stage-emote-alert')).not.toBeNull();
    expect(container.querySelector('audio, video')).toBeNull();
    rerender(<StagePicture src="/api/assets/gif/example.gif" />);
    expect(container.querySelector('.smug-stage-emote')).toBeNull();
  });

  it('renders the graphic emote as decorative, not a phone emoji', () => {
    const { container } = render(<StagePicture src="/character.png" cue={{ ...cue, emote: 'heart' }} />);
    expect(container.querySelector('.smug-stage-emote-heart svg')).not.toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
