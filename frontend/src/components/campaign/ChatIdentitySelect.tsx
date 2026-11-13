import { useMemo, useState } from 'react';

export type ChatSpeakerType = 'self' | 'character' | 'npc' | 'narrator';
export type ChatMode = 'ic' | 'ooc' | 'narrator';

export interface PortraitFrame {
  zoom: number;
  x: number;
  y: number;
}

export interface ChatIdentityOption {
  key: string;
  type: ChatSpeakerType;
  id?: string;
  label: string;
  imageUrl?: string | null;
  frame?: PortraitFrame;
  chatChime?: string;
}

interface Props {
  options: ChatIdentityOption[];
  value: string;
  onChange: (key: string) => void;
  onFrameChange?: (key: string, frame: PortraitFrame) => void;
  compact?: boolean;
}

const DEFAULT_FRAME: PortraitFrame = { zoom: 1, x: 50, y: 50 };

export default function ChatIdentitySelect({
  options,
  value,
  onChange,
  onFrameChange,
  compact = false,
}: Props) {
  const [frameOpen, setFrameOpen] = useState(false);
  const selected = useMemo(() => options.find((option) => option.key === value) ?? options[0], [options, value]);
  const frame = selected?.frame ?? DEFAULT_FRAME;
  const canFrame = !!selected?.imageUrl && selected.type !== 'narrator';

  const changeFrame = (patch: Partial<PortraitFrame>) => {
    if (!selected || !onFrameChange) return;
    onFrameChange(selected.key, { ...frame, ...patch });
  };

  return (
    <div className="relative">
      <div className={`flex items-center gap-2 ${compact ? 'flex-wrap' : ''}`}>
        <span className="text-xs font-medium text-ink-muted">Speak as</span>
        <select
          className={`input-cozy py-1 text-xs ${compact ? 'min-w-32 flex-1' : 'min-w-40'}`}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setFrameOpen(false);
          }}
        >
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>

        {canFrame && onFrameChange && (
          <button
            type="button"
            className="rounded-cozy border border-ink/10 bg-paper px-2 py-1 text-xs text-ink-secondary hover:bg-ink/5 hover:text-ink"
            onClick={() => setFrameOpen((open) => !open)}
          >
            Portrait
          </button>
        )}
      </div>

      {frameOpen && canFrame && selected && (
        <div className="absolute bottom-full left-0 z-[1000] mb-2 w-72 rounded-cozy border border-ink/15 bg-paper p-3 shadow-xl">
          <div className="mb-3 flex items-center gap-3">
            <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-ink/10 bg-ink/5">
              <img
                src={selected.imageUrl ?? ''}
                alt=""
                className="h-full w-full object-cover"
                style={{
                  objectPosition: `${frame.x}% ${frame.y}%`,
                  transform: `scale(${frame.zoom})`,
                  transformOrigin: `${frame.x}% ${frame.y}%`,
                }}
              />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{selected.label}</p>
              <p className="text-xs text-ink-muted">Adjust how this identity is framed in chat.</p>
            </div>
          </div>

          <label className="mb-2 block text-xs text-ink-secondary">
            Zoom {Math.round(frame.zoom * 100)}%
            <input
              className="mt-1 w-full"
              type="range"
              min="0.6"
              max="2"
              step="0.05"
              value={frame.zoom}
              onChange={(event) => changeFrame({ zoom: Number(event.target.value) })}
            />
          </label>
          <label className="mb-2 block text-xs text-ink-secondary">
            Horizontal focus
            <input
              className="mt-1 w-full"
              type="range"
              min="0"
              max="100"
              step="1"
              value={frame.x}
              onChange={(event) => changeFrame({ x: Number(event.target.value) })}
            />
          </label>
          <label className="block text-xs text-ink-secondary">
            Vertical focus
            <input
              className="mt-1 w-full"
              type="range"
              min="0"
              max="100"
              step="1"
              value={frame.y}
              onChange={(event) => changeFrame({ y: Number(event.target.value) })}
            />
          </label>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              className="rounded px-2 py-1 text-xs text-ink-secondary hover:bg-ink/5"
              onClick={() => { if (selected && onFrameChange) onFrameChange(selected.key, DEFAULT_FRAME); }}
            >
              Reset
            </button>
            <button
              type="button"
              className="rounded bg-accent px-2 py-1 text-xs text-accent-text"
              onClick={() => setFrameOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
