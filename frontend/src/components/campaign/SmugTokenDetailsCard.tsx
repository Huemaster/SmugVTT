import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Position, Token } from '@/types';
import type { CharacterHpInfo } from '@/utils/characterHp';
import { useTokenInitiative } from '@/stores/gameStore';
import { tokenDisplayName } from '@/utils/tokenDisplayName';
import { placeholderColor } from './map/layers/drawTokens';
import SquadCommandTokenCombatHover from './SquadCommandTokenCombatHover';
import { useCampaign } from '@/contexts/CampaignContext';
import { readSheetlessSquadFodder } from './squadSheetlessFodder';
import { isKnownMapStatusCondition } from './mapTokenIndicators';
import { visibleCombatIndicators } from './visibleCombatIndicators';
import type { ZoneEffects } from './map/zoneMechanics';

interface SmugTokenDetailsCardProps {
  token: Token;
  square: Position;
  hp: CharacterHpInfo | null;
  imageSrc?: string;
  mayMove: boolean;
  onClose?: () => void;
  docked?: boolean;
  zoneEffects?: ZoneEffects | null;
  /** Kept only for held-distance notices. Squad Command stats are INSIDE the card. */
  above?: ReactNode;
}
const CORNER_BOX = 'absolute bottom-4 left-4 glass-panel px-3 py-3 bg-parchment/95 backdrop-blur-xs w-[25rem] max-w-[calc(100%-2rem)] shadow-lg';
const DOCKED_BOX = 'relative glass-panel px-3 py-3 bg-parchment/95 backdrop-blur-xs w-full sm:w-[25rem] shadow-lg';

export default function SmugTokenDetailsCard({ token, square, hp, imageSrc, mayMove, onClose, docked = false, zoneEffects, above }: SmugTokenDetailsCardProps) {
  const { campaign } = useCampaign();
  const isTw = !!token.characterId && campaign?.characters?.some((character) => character.id === token.characterId && character.gameSystem === 'SQUAD_COMMAND') === true;
  const initiative = useTokenInitiative(token.id);
  const conditions = token.conditions ?? [];
  // Players receive a token with squadFodderData stripped. Only a permitted
  // viewer can get the full sheetless stats and battlefield conditions here.
  const sheetless = readSheetlessSquadFodder(token);
  // Sheet-backed Squad Command already renders its own permission-aware effect strip.
  // Explicit public conditions also get icons for sheet-backed units; the
  // private sheet-specific details still come from SquadCommandTokenCombatHover.
  const effects = visibleCombatIndicators(token, hp?.current ?? null);
  const extraConditions = conditions.filter((condition) => !isKnownMapStatusCondition(condition) && !effects.some(effect => effect.key === condition.trim().toLowerCase()));
  return (
    <>
      {above && docked && <div className="self-start">{above}</div>}
      <div className={`${docked ? DOCKED_BOX : CORNER_BOX}${onClose ? ' pointer-events-none' : ''}`}>
        {above && !docked && <div className="absolute bottom-full left-0 mb-2 pointer-events-none">{above}</div>}
        <div className="flex items-start gap-3">
          {imageSrc ? (
            <img src={imageSrc} alt="" className="w-18 h-18 rounded-cozy object-cover shrink-0" />
          ) : (
            <div className="w-18 h-18 rounded-cozy shrink-0 flex items-center justify-center text-2xl font-semibold text-white" style={{ backgroundColor: placeholderColor(token) }} aria-hidden="true">
              {(token.name || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="text-sm font-semibold text-brand-ink truncate">{tokenDisplayName(token)}</span>
              <span className="text-xs text-stone-gray font-mono shrink-0">({square.x}, {square.y})</span>
            </div>
            {/* The squad stat row now lives in the original plate, not a second floating plate. */}
            {isTw ? <SquadCommandTokenCombatHover characterId={token.characterId} /> : sheetless?.stats ? (
              <div className="grid grid-cols-4 gap-1 text-center text-[10px]" aria-label="Squad Command Fodder combat statistics">
                <div className="rounded bg-ink/5 px-1 py-1"><strong className="block font-mono">{sheetless.stats.hpCurrent}/{sheetless.stats.hpMax}</strong><span className="text-ink-muted">HP</span></div>
                <div className="rounded bg-ink/5 px-1 py-1"><strong className="block font-mono">{sheetless.stats.defense}</strong><span className="text-ink-muted">DEF</span></div>
                <div className="rounded bg-ink/5 px-1 py-1"><strong className="block font-mono">{sheetless.stats.shieldCurrent}/{sheetless.stats.shieldMax}</strong><span className="text-ink-muted">SH</span></div>
                <div className="rounded bg-ink/5 px-1 py-1"><strong className="block font-mono">{sheetless.stats.suppression}/3</strong><span className="text-ink-muted">SUP</span></div>
              </div>
            ) : (
              hp && <div className="text-xs text-brand-ink">HP: <strong className="font-mono">{hp.current}/{hp.max}{hp.temp > 0 ? ` +${hp.temp}` : ''}</strong></div>
            )}
            {zoneEffects && zoneEffects.zoneIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1" aria-label="Battlefield area effects">
                {zoneEffects.cover === 2 ? <span className="rounded-cozy border border-warning/40 bg-warning/20 px-1.5 py-0.5 text-[11px] font-semibold text-brand-ink" title="Heavy Cover: +2 Cover AV (strongest cover only)">Heavy Cover · +2 AV</span>
                  : zoneEffects.cover === 1 ? <span className="rounded-cozy border border-warning/40 bg-warning/20 px-1.5 py-0.5 text-[11px] font-semibold text-brand-ink" title="Light Cover: +1 Cover AV">Light Cover · +1 AV</span> : null}
                {zoneEffects.obscured && <span className="rounded-cozy bg-ink-muted/15 px-1.5 py-0.5 text-[11px] font-medium text-brand-ink">Smoke / Obscured</span>}
                {zoneEffects.highGround && <span className="rounded-cozy bg-info/15 px-1.5 py-0.5 text-[11px] font-medium text-brand-ink">High Ground</span>}
                {zoneEffects.lowGround && <span className="rounded-cozy bg-spirit/15 px-1.5 py-0.5 text-[11px] font-medium text-brand-ink">Low Ground</span>}
                {zoneEffects.inHealing && <span className="rounded-cozy bg-success/15 px-1.5 py-0.5 text-[11px] font-medium text-brand-ink">Healing AoE · GM approval</span>}
                {zoneEffects.inHazard && <span className="rounded-cozy bg-danger-fill/15 px-1.5 py-0.5 text-[11px] font-medium text-brand-ink">Hazard · GM-controlled</span>}
              </div>
            )}
            {(effects.length > 0 || extraConditions.length > 0) && (
              <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Active token conditions">
                {effects.map((effect) => (
                  <span key={effect.key} title={effect.title} className="inline-flex items-center gap-1 rounded-cozy bg-warm-amber/20 px-1.5 py-0.5 text-[10px] font-medium text-brand-ink">
                    <span aria-hidden="true">{effect.glyph}</span>{effect.title}
                  </span>
                ))}
                {extraConditions.map((condition) => <span key={condition} title={condition} className="px-1.5 py-0.5 rounded-cozy bg-warm-amber/20 text-[10px] font-medium text-brand-ink capitalize">{condition}</span>)}
              </div>
            )}
            {initiative !== undefined && <div className="mt-1 text-[11px] text-stone-gray">Initiative: <strong>{initiative === null ? '—' : initiative}</strong></div>}
            {!mayMove && <div className="mt-1 text-[11px] italic text-warm-gray">Not yours to move</div>}
          </div>
          {onClose && <button type="button" onClick={onClose} aria-label="Close details" title="Close details" className="pointer-events-auto -mr-2 -mt-1 p-2 shrink-0 touch-target text-stone-gray hover:text-brand-ink hover:bg-moss-green/10 rounded-cozy"><X className="w-4 h-4" aria-hidden="true" /></button>}
        </div>
      </div>
    </>
  );
}
