import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Crosshair, EyeOff, HeartCrack, ShieldCheck, ShieldAlert, Skull, Sparkles, Wrench, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { api } from '@/services/api';
import type { SquadCommandCharacterData } from '@/types/game-systems/squadCommand';
import { normalizeSquadCommandData } from '@/components/character-sheets/squadCommand/battleState';

/** Small, permission-aware Squad Command stat strip for the existing map token details popover. */
export default function SquadCommandTokenCombatHover({ characterId }: { characterId: string | null | undefined }) {
  const { campaign, userRole } = useCampaign();
  const { user } = useAuth();
  const { socket } = useWebSocket();
  const [data, setData] = useState<SquadCommandCharacterData | null>(null);
  const [revision, setRevision] = useState(0);
  const owner = campaign?.characters?.find((character) => character.id === characterId);
  const canSee = userRole === 'DM' || (!!user && !!characterId && (
    owner?.userId === user.id || campaign?.memberships?.some((member) => member.userId === user.id && member.characterIds?.includes(characterId)) === true
  ));
  useEffect(() => {
    if (!characterId || !canSee || owner?.gameSystem !== 'SQUAD_COMMAND') { setData(null); return; }
    let live = true;
    const timer = window.setTimeout(() => {
      void api.getCharacter(characterId).then(({ character }) => {
        if (live && character.gameSystem === 'SQUAD_COMMAND') setData(normalizeSquadCommandData(character.data as SquadCommandCharacterData));
      }).catch(() => { if (live) setData(null); });
    }, 100);
    return () => { live = false; window.clearTimeout(timer); };
  }, [characterId, canSee, owner?.gameSystem, revision]);
  useEffect(() => {
    if (!socket || !characterId) return;
    const changed = (event: { character?: { id?: string } }) => {
      if (event?.character?.id === characterId) setRevision((value) => value + 1);
    };
    socket.on('character.updated', changed);
    socket.on('character.hp.updated', changed);
    return () => {
      socket.off('character.updated', changed);
      socket.off('character.hp.updated', changed);
    };
  }, [socket, characterId]);
  if (!data?.stats) return null;
  const { stats, battle } = data;
  const field = battle?.battlefield;
  const special = field?.specialEffects ?? {};
  const statuses: { label: string; icon: typeof AlertTriangle; priority: number; className: string; title: string }[] = [];
  const add = (label: string, icon: typeof AlertTriangle, priority: number, title = label, className = 'bg-amber-500/15 text-ink') => statuses.push({ label, icon, priority, title, className });
  if (stats.suppression >= 3) add('Pinned', ShieldAlert, 20, 'Pinned — unable to attack normally', 'bg-orange-600/15 text-ink');
  if (field?.overwatch.active) add('Overwatch', Crosshair, 50, `Overwatch — ${field.overwatch.reactions} reaction(s) remaining`);
  if (battle?.downed && !field?.wrecked) {
    if (!field?.stabilized && (battle.deathTimer ?? 1) <= 0) add('Dead', Skull, 0, 'Dead — death timer exhausted', 'bg-red-600/20 text-red-800');
    else add('Downed', HeartCrack, 10, field?.stabilized ? 'Downed — stabilized; timer frozen' : `Downed — ${battle.deathTimer ?? 3} turn(s) remaining`, 'bg-red-600/15 text-red-800');
  }
  if (field?.wrecked) add('Wrecked', Wrench, 0, 'Vehicle wrecked — unable to act', 'bg-red-600/20 text-red-800');
  if (field?.stabilized && battle?.downed) add('Stabilized', CheckCircle2, 11, 'Death timer stopped');
  if (battle?.bastionActive) add('Bastion', ShieldCheck, 60, 'Bastion — prevents the next single damaging hit');
  if ((battle?.naniteBuffer ?? 0) > 0) add(`Nanites ${battle?.naniteBuffer}`, ShieldCheck, 65, `Nanite buffer — ${battle?.naniteBuffer} temporary HP`);
  if (field?.prone) add('Prone', AlertTriangle, 30);
  if (field?.obscured) add('Obscured', EyeOff, 35);
  if (special.withdrawn) add('Withdrawn', HeartCrack, 5, 'Withdrawn from combat; no longer an active combatant');
  if (special.resolveActive) add('Resolve', ShieldCheck, 70, 'Resolve — incoming damage reduced by 50% until Refresh');
  if (special.exaltedActive) add('Exalted', Zap, 71, 'Exalted — next attack gains +50% damage');
  if (special.reaperActive) add('Reaper', Sparkles, 72, 'Reaper — next attack gains +2 Accuracy');
  if ((data.abilities ?? []).some((ability) => (ability.id === 'cloak' || ability.id === 'gaulian_cloak') && ability.special === 'active')) add('Cloaked', EyeOff, 40);
  statuses.sort((a, b) => a.priority - b.priority);
  return (
    <div className="min-w-0 w-full" aria-label="Squad Command combat statistics">
      <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
        <div className="rounded bg-ink/5 px-1 py-1"><strong className="block text-ink font-mono">{stats.hpCurrent}/{stats.hpMax}</strong><span className="text-ink-muted">HP</span></div>
        <div className="rounded bg-ink/5 px-1 py-1"><strong className="block text-ink font-mono">{stats.defense}</strong><span className="text-ink-muted">DEF</span></div>
        <div className="rounded bg-ink/5 px-1 py-1"><strong className="block text-ink font-mono">{stats.shieldCurrent}/{stats.shieldMax}</strong><span className="text-ink-muted">SH</span></div>
        <div className="rounded bg-ink/5 px-1 py-1"><strong className="block text-ink font-mono">{stats.suppression}/3</strong><span className="text-ink-muted">SUP</span></div>
      </div>
      {statuses.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Active effects">
          {statuses.map(({ label, icon: Icon, title, className }) => (
            <span key={label} title={title} aria-label={title} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${className}`}>
              <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />{label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
