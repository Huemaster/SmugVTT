import type { Token } from '@/types';

/** Compact status pips for visible tokens. Explicit conditions are public;
 * sheetless Squad Command snapshots are read only when actually supplied to this client.
 * The server strips private Fodder snapshots from ordinary players.
 */
export type MapStatusIndicator = { key: string; glyph: string; color: string; title: string; priority: number; kind?: 'condition' | 'trait' | 'ready' };
const STATUS: Record<string, MapStatusIndicator> = {
  dead: { key: 'dead', glyph: '✕', color: '#8b161f', title: 'Dead', priority: 0 },
  hp0: { key: 'hp0', glyph: '0', color: '#a43d26', title: 'Zero HP — inspect sheet for Downed/Dead/Wrecked state', priority: 4 },
  wrecked: { key: 'wrecked', glyph: '✕', color: '#5f2424', title: 'Wrecked', priority: 1 },
  downed: { key: 'downed', glyph: '!', color: '#c32931', title: 'Downed', priority: 2 },
  stabilized: { key: 'stabilized', glyph: '+', color: '#2e855c', title: 'Stabilized', priority: 3 },
  pinned: { key: 'pinned', glyph: 'P', color: '#a66316', title: 'Pinned', priority: 10 },
  prone: { key: 'prone', glyph: '↓', color: '#7b5f40', title: 'Prone', priority: 20 },
  obscured: { key: 'obscured', glyph: '?', color: '#69607c', title: 'Obscured', priority: 21 },
  cloaked: { key: 'cloaked', glyph: '◌', color: '#424b82', title: 'Cloaked', priority: 22 },
  overwatch: { key: 'overwatch', glyph: '◎', color: '#297780', title: 'Overwatch', priority: 35 },
  bastion: { key: 'bastion', glyph: '◆', color: '#346c7c', title: 'Bastion', priority: 40 },
  resolve: { key: 'resolve', glyph: '◆', color: '#2e855c', title: 'Resolve', priority: 41 },
  exalted: { key: 'exalted', glyph: '↑', color: '#8d5724', title: 'Exalted', priority: 42 },
  reaper: { key: 'reaper', glyph: '+', color: '#6654aa', title: 'Reaper', priority: 43 },
  nanites: { key: 'nanites', glyph: 'N', color: '#276c74', title: 'Nanite buffer', priority: 44 },
  withdrawn: { key: 'withdrawn', glyph: '↩', color: '#7d5757', title: 'Withdrawn from battle', priority: 5 },
  rally: { key: 'rally', glyph: '↻', color: '#287a63', title: 'Rally available (once per battle)', priority: 55, kind: 'ready' },
  eager: { key: 'eager', glyph: 'E', color: '#447b43', title: 'Eager — free Rally available', priority: 56, kind: 'ready' },
  relentless: { key: 'relentless', glyph: 'R', color: '#7d5fba', title: 'Relentless — protection against Pinned available', priority: 57, kind: 'ready' },
  monocle: { key: 'monocle', glyph: '◉', color: '#4c7aa0', title: 'Monocle — passive coordinated-fire trait', priority: 70, kind: 'trait' },
  breakaway: { key: 'breakaway', glyph: '↗', color: '#4a8f6f', title: 'Breakaway — passive disengage trait', priority: 71, kind: 'trait' },
  cover_drill: { key: 'cover_drill', glyph: 'C', color: '#93703d', title: 'Cover Drill — passive cover trait', priority: 71, kind: 'trait' },
  fire_control: { key: 'fire_control', glyph: 'F', color: '#6580b2', title: 'Fire-Control Stabilization', priority: 71, kind: 'trait' },
  entrenchment: { key: 'entrenchment', glyph: 'T', color: '#6b747f', title: 'Entrenchment trait (bonus requires stationary position)', priority: 71, kind: 'trait' },
  broom: { key: 'broom', glyph: '↥', color: '#567c9c', title: 'Broom — three-dimensional movement trait', priority: 71, kind: 'trait' },
  dodge: { key: 'dodge', glyph: 'D', color: '#477f7f', title: 'Dodge — passive defense trait', priority: 71, kind: 'trait' },
  dual_wield: { key: 'dual_wield', glyph: 'Ⅱ', color: '#816a99', title: 'Dual Wield trait', priority: 71, kind: 'trait' },
  energy_shield: { key: 'energy_shield', glyph: '◇', color: '#477ea3', title: 'Energy Shield available', priority: 72, kind: 'ready' },
  field_stabilization: { key: 'field_stabilization', glyph: '✚', color: '#36836b', title: 'Field Stabilization available', priority: 72, kind: 'ready' },
  shield_recovery: { key: 'shield_recovery', glyph: 'S', color: '#317c9c', title: 'Shield Recovery ready', priority: 72, kind: 'ready' },
  speed_loader: { key: 'speed_loader', glyph: '↺', color: '#996c3a', title: 'Speed Loader available', priority: 72, kind: 'ready' },
  automatic_dodge: { key: 'automatic_dodge', glyph: '⤴', color: '#4e9081', title: 'Automatic Dodge available', priority: 72, kind: 'ready' },
  bandolier: { key: 'bandolier', glyph: 'B', color: '#94733a', title: 'Bandolier available', priority: 72, kind: 'ready' },
  flares: { key: 'flares', glyph: '✺', color: '#b06a43', title: 'Flares available', priority: 72, kind: 'ready' },
  boost_pack: { key: 'boost_pack', glyph: '»', color: '#467eac', title: 'Boost Pack equipped', priority: 76, kind: 'trait' },
  fast_pack: { key: 'fast_pack', glyph: '»', color: '#467eac', title: 'Fast Pack equipped', priority: 76, kind: 'trait' },
  super_pack: { key: 'super_pack', glyph: '⇧', color: '#467eac', title: 'Super Pack equipped', priority: 76, kind: 'trait' },
  westphal_boost: { key: 'westphal_boost', glyph: '»', color: '#467eac', title: 'Boost Pack available', priority: 76, kind: 'ready' },
  cataphract_boost: { key: 'cataphract_boost', glyph: '»', color: '#467eac', title: 'Cavalry Boost available', priority: 76, kind: 'ready' },
  cataphract_cavalry_fire: { key: 'cataphract_cavalry_fire', glyph: '⊕', color: '#926b40', title: 'Cavalry Fire trait', priority: 76, kind: 'trait' },
  extendable_shield: { key: 'extendable_shield', glyph: '▣', color: '#597a99', title: 'Extendable Shield equipped', priority: 76, kind: 'trait' },
  nanite2: { key: 'nanite2', glyph: 'N', color: '#3e8983', title: 'Nanite Pack equipped', priority: 76, kind: 'trait' },
  nanite3: { key: 'nanite3', glyph: 'N', color: '#3e8983', title: 'Nanite Pack equipped', priority: 76, kind: 'trait' },
  repair_omnitool: { key: 'repair_omnitool', glyph: '⌁', color: '#657e8b', title: 'Repair Omnitool equipped', priority: 76, kind: 'trait' },
  albion_omnitool: { key: 'albion_omnitool', glyph: '⌁', color: '#657e8b', title: 'Omnitool equipped', priority: 76, kind: 'trait' },
  chariot_transport: { key: 'chariot_transport', glyph: '⇄', color: '#657e8b', title: 'Transport capability', priority: 76, kind: 'trait' },
  chariot_shield_recharge: { key: 'chariot_shield_recharge', glyph: 'S', color: '#317c9c', title: 'Shield Recharge trait', priority: 76, kind: 'trait' },
  cataphract_shield_recharge: { key: 'cataphract_shield_recharge', glyph: 'S', color: '#317c9c', title: 'Shield Recharge trait', priority: 76, kind: 'trait' },
  gaulian_cloak: { key: 'gaulian_cloak', glyph: '◌', color: '#4c6090', title: 'Cloak equipment available (not necessarily active)', priority: 80, kind: 'ready' },
};

/** Generic public condition labels and custom ability IDs receive visible icons too. */
function unknownIndicator(name: string): MapStatusIndicator {
  const title = name.replace(/_/g, ' ').replace(/-/g, ' ').trim().slice(0, 54);
  return { key: name, glyph: (title[0] || '?').toUpperCase(), color: '#546879', title: title || 'Custom condition', priority: 85, kind: 'condition' };
}

export function mapTokenIndicators(conditions: readonly string[] | undefined, visibleHp: number | null): MapStatusIndicator[] {
  const normalized = new Set((conditions ?? []).map((value) => value.trim().toLowerCase()));
  // A visible zero-HP number does NOT establish Downed vs Dead vs Wrecked.
  // Only show that specific label when public token conditions say so.
  if (visibleHp !== null && visibleHp <= 0 && !['dead','wrecked','downed'].some((key) => normalized.has(key))) normalized.add('hp0');
  return Array.from(normalized)
    .map((name) => STATUS[name] ?? unknownIndicator(name))
    .filter((value): value is MapStatusIndicator => value !== undefined)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Presentation-only statuses for visible tokens. The GM's sheetless Squad Command
 * snapshot, when present, is the authority for combat conditions, not HP=0.
 * The server strips squadFodderData from non-controlling players, so this must
 * never request a character sheet or infer private data from the token name.
 */
export function tokenStatusIndicators(token: Token, visibleHp: number | null): MapStatusIndicator[] {
  const conditions = new Set((token.conditions ?? []).map((value) => value.trim().toLowerCase()));
  const raw = !token.characterId && token.metadata?.smugSquadFodder === true
    ? token.metadata.squadFodderData : null;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const data = raw as {
      stats?: { suppression?: number };
      battle?: {
        downed?: boolean; deathTimer?: number; bastionActive?: boolean; naniteBuffer?: number; rallyUsed?: boolean; relentlessUsed?: boolean; active?: boolean;
        battlefield?: {
          wrecked?: boolean; stabilized?: boolean; prone?: boolean; obscured?: boolean;
          overwatch?: { active?: boolean; reactions?: number };
          specialEffects?: { resolveActive?: boolean; exaltedActive?: boolean; reaperActive?: boolean; withdrawn?: boolean };
        };
      };
      abilities?: Array<{ id?: string; name?: string; special?: string; usesCurrent?: number; usesMax?: number; cooldownCurrent?: number }>;
    };
    const battle = data.battle;
    const field = battle?.battlefield;
    // These four states are mutually exclusive or conditional. Ignore stale
    // token condition flags when an authoritative battle snapshot is present.
    for (const key of ['dead', 'downed', 'wrecked', 'stabilized', 'hp0', 'pinned', 'overwatch', 'prone', 'obscured', 'bastion', 'resolve', 'exalted', 'reaper', 'nanites', 'withdrawn', 'rally', 'eager', 'relentless', 'monocle']) conditions.delete(key);
    if (field?.wrecked) conditions.add('wrecked');
    else if (battle?.downed) {
      if (!field?.stabilized && (battle.deathTimer ?? 1) <= 0) conditions.add('dead');
      else conditions.add('downed');
      if (field?.stabilized) conditions.add('stabilized');
    }
    if ((data.stats?.suppression ?? 0) >= 3) conditions.add('pinned');
    if (field?.overwatch?.active && (field.overwatch.reactions ?? 0) > 0) conditions.add('overwatch');
    if (field?.prone) conditions.add('prone');
    if (field?.obscured) conditions.add('obscured');
    if (battle?.bastionActive) conditions.add('bastion');
    if ((battle?.naniteBuffer ?? 0) > 0) conditions.add('nanites');
    if (field?.specialEffects?.resolveActive) conditions.add('resolve');
    if (field?.specialEffects?.exaltedActive) conditions.add('exalted');
    if (field?.specialEffects?.reaperActive) conditions.add('reaper');
    if (field?.specialEffects?.withdrawn) conditions.add('withdrawn');
    if (Array.isArray(data.abilities) && data.abilities.some((a) => (a.id === 'cloak' || a.id === 'gaulian_cloak' || a.id === 'vehicle_cloak') && a.special === 'active')) conditions.add('cloaked');
    // Only expose traits/ready actions that the recipient's permitted snapshot
    // contains. A cooldown or spent charge is not shown as an ACTIVE buff.
    const unavailable = battle?.downed || field?.wrecked || ((data.stats as { hpCurrent?: number } | undefined)?.hpCurrent ?? 1) <= 0;
    if (!unavailable) {
      if (battle?.active && !battle.rallyUsed) conditions.add('rally');
      for (const ability of data.abilities ?? []) {
        const id = ability.id?.toLowerCase();
        if (!id || ['cloak','vehicle_cloak','chariot_wrecked','bastion','gaulian_cloak'].includes(id)) continue;
        if (ability.usesMax !== undefined && (ability.usesCurrent ?? 0) <= 0) continue;
        if ((ability.cooldownCurrent ?? 0) > 0) continue;
        if (id === 'eager' && battle?.rallyUsed) continue;
        if (id === 'relentless' && battle?.relentlessUsed) continue;
        conditions.add(id);
      }
    }
    const active = mapTokenIndicators([...conditions], visibleHp);
    return active.map((entry) => {
      if (entry.key === 'downed') return { ...entry, title: field?.stabilized
        ? 'Downed — stabilized (death timer frozen)'
        : `Downed — ${battle?.deathTimer ?? 3} turn(s) remaining` };
      if (entry.key === 'overwatch') return { ...entry, title: `Overwatch — ${field?.overwatch?.reactions ?? 0} reaction(s) remaining` };
      if (entry.key === 'nanites') return { ...entry, title: `Nanite buffer — ${battle?.naniteBuffer ?? 0} temporary HP` };
      return entry;
    });
  }
  return mapTokenIndicators([...conditions], visibleHp);
}

/** Preserve unknown, custom condition chips without duplicating known statuses. */
export function isKnownMapStatusCondition(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(STATUS, value.trim().toLowerCase());
}
