import { AlertTriangle, Cloud, Droplet, Heart, HelpCircle, MessageCircleMore, Sparkles, Zap, CircleAlert, Wind } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ComponentType } from 'react';
import type { StageMotion, StageEmote, StageCue } from '@/types/sceneBoard';
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

/**
 * Browsers can disable CSS animation completely when the OS requests reduced
 * motion. An explicitly enabled Canvas cue instead uses Web Animations, which
 * animates the *one image wrapper* without depending on CSS animation rules.
 * It never duplicates the IMG element or alters the saved picture position.
 */
const MOTION_FRAMES: Record<Exclude<StageMotion, 'none'>, Keyframe[]> = {
  float: [
    { transform: 'translateY(0)' },
    { transform: 'translateY(-24px)' },
    { transform: 'translateY(0)' },
  ],
  bob: [
    { transform: 'translateY(0)' },
    { transform: 'translateY(-13px)' },
    { transform: 'translateY(0)' },
  ],
  shake: [
    { transform: 'translateX(0)' },
    { transform: 'translateX(-18px)' },
    { transform: 'translateX(18px)' },
    { transform: 'translateX(-12px)' },
    { transform: 'translateX(12px)' },
    { transform: 'translateX(0)' },
  ],
  hop: [
    { transform: 'translateY(0)' },
    { transform: 'translateY(-55px)' },
    { transform: 'translateY(5px)' },
    { transform: 'translateY(0)' },
  ],
  pulse: [
    { transform: 'scale(1)' },
    { transform: 'scale(1.13)' },
    { transform: 'scale(1)' },
  ],
  fade: [{ opacity: 0.2 }, { opacity: 1 }],
  slide: [
    { transform: 'translateX(-70px)', opacity: 0.4 },
    { transform: 'translateX(0)', opacity: 1 },
  ],
  jolt: [
    { transform: 'rotate(0deg)' },
    { transform: 'rotate(-5deg)' },
    { transform: 'rotate(5deg)' },
    { transform: 'rotate(-2deg)' },
    { transform: 'rotate(0deg)' },
  ],
};

/** Each cue is a finite three-cycle animation, with no audio. */
export function StagePicture({ src, cue, motionEnabled = true, repeat = false, repeatMotion = 'none' }: { src?: string; cue?: StageCue; motionEnabled?: boolean; repeat?: boolean; repeatMotion?: StageMotion }) {
  const motion = stageMotion(repeat ? repeatMotion : cue?.motion);
  const emote = stageEmote(cue?.emote);
  const Icon = emote === 'none' ? null : EMOTE_ICONS[emote];
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = frameRef.current;
    if (!element || (!cue && !repeat) || !motionEnabled || motion === 'none') return;
    // Firefox and Chromium support this API. Do not fall back to a CSS
    // animation that may be silently overridden by prefers-reduced-motion.
    if (typeof element.animate !== 'function') return;
    const animation = element.animate(MOTION_FRAMES[motion], {
      duration: motion === 'shake' || motion === 'jolt' ? 650 : 1050,
      easing: 'ease-in-out',
      iterations: repeat ? Infinity : 3,
    });
    return () => animation.cancel();
  }, [cue?.id, motion, motionEnabled, repeat]);

  return (
    <div className="relative isolate h-full w-full" data-stage-cue={cue?.id ?? 'none'} data-stage-picture>
      <div ref={frameRef} data-stage-motion={(cue || repeat) && motionEnabled ? motion : 'none'} className="h-full w-full">
        {src ? <img src={src} alt="" draggable={false} className="h-full w-full select-none object-contain" /> : null}
      </div>
      {cue && Icon && <span key={cue.id} aria-hidden="true" className={`smug-stage-emote smug-stage-emote-${emote}`}>
        <Icon size={38} strokeWidth={2.6} aria-hidden />
      </span>}
    </div>
  );
}
