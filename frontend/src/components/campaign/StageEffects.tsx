import { AlertTriangle, Cloud, Droplet, Heart, HelpCircle, MessageCircleMore, Sparkles, Zap, CircleAlert, Wind } from 'lucide-react';
import type { ComponentType } from 'react';
import './stageEffects.css';

/**
 * Stage moods are illustrated by the VTT's own stroke-style icons, not OS
 * emoji glyphs. Cues deliberately run only three times and have no audio.
 */
export const STAGE_MOTIONS = [
  ['none', 'Still'],
  ['float', 'Idle float'],
  ['bob', 'Gentle bob'],
  ['shake', 'Shake'],
  ['hop', 'Hop'],
  ['pulse', 'Pulse'],
  ['fade', 'Fade in'],
  ['slide', 'Slide in'],
  ['jolt', 'Impact jolt'],
] as const;
export type StageMotion = (typeof STAGE_MOTIONS)[number][0];

export const STAGE_EMOTES = [
  ['none', 'None'],
  ['anger', 'Anger'],
  ['stress', 'Stress'],
  ['sweat', 'Sweat'],
  ['gloom', 'Gloom'],
  ['alert', 'Alert'],
  ['question', 'Question'],
  ['exclamation', 'Exclamation'],
  ['sparkle', 'Sparkle'],
  ['heart', 'Heart'],
  ['thought', 'Thinking'],
] as const;
export type StageEmote = (typeof STAGE_EMOTES)[number][0];

export interface StageCue {
  id: string;
  at: number;
  motion: StageMotion;
  emote: StageEmote;
}

export function stageMotion(value: unknown): StageMotion {
  return STAGE_MOTIONS.some(([id]) => id === value) ? value as StageMotion : 'none';
}
export function stageEmote(value: unknown): StageEmote {
  return STAGE_EMOTES.some(([id]) => id === value) ? value as StageEmote : 'none';
}

const EMOTE_ICONS: Record<Exclude<StageEmote, 'none'>, ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>> = {
  anger: Zap,
  stress: AlertTriangle,
  sweat: Droplet,
  gloom: Cloud,
  alert: Wind,
  question: HelpCircle,
  exclamation: CircleAlert,
  sparkle: Sparkles,
  heart: Heart,
  thought: MessageCircleMore,
};

/** Still GIFs retain their native animation. Stage motion is an optional CSS overlay. */
export function StagePicture({ src, cue }: { src?: string; cue?: StageCue }) {
  const motion = stageMotion(cue?.motion);
  const emote = stageEmote(cue?.emote);
  const Icon = emote === 'none' ? null : EMOTE_ICONS[emote];
  return (
    <div className="relative h-full w-full" data-stage-cue={cue?.id ?? 'none'}>
      <div key={cue?.id ?? 'still'} className={cue && motion !== 'none' ? `smug-stage-motion smug-stage-motion-${motion} h-full w-full` : 'h-full w-full'}>
        {src ? <img src={src} alt="" draggable={false} className="h-full w-full select-none object-contain" /> : null}
      </div>
      {cue && Icon && <span key={cue.id} aria-hidden="true" className={`smug-stage-emote smug-stage-emote-${emote}`}>
        <Icon size={38} strokeWidth={2.6} aria-hidden />
      </span>}
    </div>
  );
}
