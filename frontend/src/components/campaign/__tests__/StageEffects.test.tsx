import { describe, expect, it, vi } from 'vitest';
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
    expect(container.querySelectorAll('[data-stage-picture] img')).toHaveLength(1);
    expect(container.querySelector('[data-stage-motion="hop"]')).not.toBeNull();
    expect(container.querySelector('.smug-stage-emote-alert')).not.toBeNull();
    expect(container.querySelector('audio, video')).toBeNull();
    rerender(<StagePicture src="/api/assets/gif/example.gif" />);
    expect(container.querySelector('.smug-stage-emote')).toBeNull();
  });

  it('starts a three-cycle Web Animation on each cue and cancels on replacement', () => {
    const cancel = vi.fn();
    const animate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({ cancel } as unknown as Animation));
    const oldDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    try {
      const { container, rerender, unmount } = render(<StagePicture src="/character.png" cue={cue} />);
      expect(container.querySelectorAll('[data-stage-picture] img')).toHaveLength(1);
      expect(animate).toHaveBeenCalledTimes(1);
      expect(animate.mock.calls[0]?.[1]).toMatchObject({ iterations: 3 });
      rerender(<StagePicture src="/character.png" cue={{ ...cue, id: 'cast-cue-2', motion: 'shake' }} />);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(animate).toHaveBeenCalledTimes(2);
      rerender(<StagePicture src="/character.png" cue={cue} motionEnabled={false} />);
      expect(cancel).toHaveBeenCalledTimes(2);
      expect(animate).toHaveBeenCalledTimes(2);
      unmount();
    } finally {
      if (oldDescriptor) Object.defineProperty(HTMLElement.prototype, 'animate', oldDescriptor);
      else delete (HTMLElement.prototype as HTMLElement & { animate?: unknown }).animate;
    }
  });

  it('renders the graphic emote as decorative, not a phone emoji', () => {
    const { container } = render(<StagePicture src="/character.png" cue={{ ...cue, emote: 'heart' }} />);
    expect(container.querySelector('.smug-stage-emote-heart svg')).not.toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
