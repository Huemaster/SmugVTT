import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Crosshair, Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import Button from '../../ui/Button';
import SquadSpecialAbilityPanel from './SquadSpecialAbilityPanel';
import type { CharacterData } from '../../../types';
import type {
  SquadCommandAbility,
  SquadCommandAttackEdge,
  SquadCommandCharacterData,
  SquadCommandChatChime,
  SquadCommandCover,
  SquadCommandFaction,
  SquadCommandProfile,
  SquadCommandUnitStats,
  SquadCommandVehicleArc,
  SquadCommandWeapon,
} from '../../../types/game-systems/squadCommand';
import type { CharacterSheetProps } from '../types';
import {
  FACTION_LABELS,
  PALADIN_PACKAGES,
  PROFILE_LABELS,
  PROMOTION_TREES,
  UNITS,
  VEHICLE_CATALOG,
  applyCanonicalUnit,
  firstUnitIdFor,
  makeCustomProfile,
  unitIdsFor,
} from './profiles';
import {
  EMPTY_BATTLE_STATE,
  TW_SYSTEM_VERSION,
  battleReset,
  endBattle,
  nextRound,
  normalizeSquadCommandData,
  recordAction,
  refreshUnit,
  startActivation,
  startBattle,
  useRally as performRally,
} from './battleState';
import {
  activateAbility,
  armOverwatch,
  cancelOverwatch,
  formatCombatResult,
  nextActionMode,
  reloadWeapon,
  resolveWeaponAction,
  setBattlefieldState,
  validateCombatProfile,
  TW_SPECIAL_ABILITIES,
  grantSquadSpecialAbility,
  canUseSquadSpecialAbilities,
  isSquadSpecialAbility,
  weaponUnavailableReason,
} from './combatEngine';
import { CHAT_CHIME_OPTIONS, playChatChime } from '../../../utils/chatChimes';

const THEME_SWATCHES = [
  '#466f9f',
  '#98414d',
  '#4f795d',
  '#72558f',
  '#9c5678',
  '#a6603b',
  '#9b762f',
  '#397b7a',
  '#42464d',
] as const;

const DEFAULT_THEME = '#466f9f';

function visibleThemeColor(value?: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_THEME;
}

const EMPTY_STATS: SquadCommandUnitStats = {
  hpCurrent: 0, hpMax: 0, defense: 8, av: 0, move: 6,
  shieldCurrent: 0, shieldMax: 0, suppression: 0,
};

function initialData(character: CharacterSheetProps['character']): SquadCommandCharacterData {
  const raw = normalizeSquadCommandData(character.data as SquadCommandCharacterData);
  return normalizeSquadCommandData({
    ...raw,
    characterName: raw.characterName || character.name || 'New Unit',
    chatChime: raw.chatChime ?? 'default',
    faction: raw.faction ?? 'astora',
    profile: raw.profile ?? 'trooper',
    unitId: raw.unitId ?? 'example_infantry',
    branch: raw.branch ?? 'Example',
    stats: raw.stats ?? { ...EMPTY_STATS },
    weapons: raw.weapons ?? [],
    abilities: raw.abilities ?? [],
    battle: raw.battle ?? { ...EMPTY_BATTLE_STATE },
    combatLog: raw.combatLog ?? [],
    notes: raw.notes ?? '',
  });
}

const numberValue = (value: string, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const Section: React.FC<{ title: string; children: React.ReactNode; aside?: React.ReactNode }> = ({ title, children, aside }) => (
  <section className="rounded-cozy border border-ink/10 bg-paper p-4 shadow-sm">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-lg font-semibold text-ink">{title}</h3>{aside}
    </div>
    {children}
  </section>
);

const StatBox: React.FC<{ label: string; value: number; editing?: boolean; onChange?: (v: number) => void }> = ({ label, value, editing, onChange }) => (
  <label className="rounded-cozy border border-ink/10 bg-ink/5 p-2 text-center">
    <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
    {editing ? <input className="input-cozy mt-1 w-full text-center" type="number" value={value} onChange={(e) => onChange?.(numberValue(e.target.value))} /> : <span className="mt-1 block text-lg font-semibold text-ink">{value}</span>}
  </label>
);

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 rounded border border-ink/10 bg-ink/5 px-2 py-1.5 text-xs text-ink-secondary">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
  </label>
);

interface WeaponEditorProps { weapon: SquadCommandWeapon; onChange: (v: SquadCommandWeapon) => void; onRemove: () => void; }
const WeaponEditor: React.FC<WeaponEditorProps> = ({ weapon, onChange, onRemove }) => {
  const set = <K extends keyof SquadCommandWeapon>(key: K, value: SquadCommandWeapon[K]) => onChange({ ...weapon, [key]: value });
  return <div className="rounded-cozy border border-ink/10 bg-paper p-3">
    <div className="mb-2 flex gap-2"><input className="input-cozy flex-1" value={weapon.name} onChange={(e) => set('name', e.target.value)} /><Button variant="danger" size="sm" icon={Trash2} iconOnly aria-label="Remove weapon" onClick={onRemove} /></div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {([
        ['Damage', 'damage', 'text'], ['Accuracy', 'accuracy', 'number'], ['AP', 'ap', 'text'], ['Range label', 'range', 'text'],
        ['Ammo', 'ammoCurrent', 'number'], ['Ammo max', 'ammoMax', 'number'], ['Ammo cost', 'ammoCost', 'number'], ['Cooldown', 'cooldownCurrent', 'number'],
        ['CD max', 'cooldownMax', 'number'], ['Min range', 'minRange', 'number'], ['Effective', 'effectiveRange', 'number'], ['Max range', 'maxRange', 'number'],
      ] as const).map(([label, key, type]) => <label key={key} className="text-xs text-ink-muted">{label}<input className="input-cozy mt-1 w-full" type={type} value={(weapon[key] as string | number | undefined) ?? ''} onChange={(e) => set(key, (type === 'number' ? numberValue(e.target.value) : e.target.value) as never)} /></label>)}
    </div>
    <div className="mt-2 grid grid-cols-2 gap-1 md:grid-cols-5">
      {([
        ['ignoreAV','Ignore AV'], ['ignoreCover','Ignore Cover'], ['antiTank','Anti-Tank'], ['autoHit','True Hit'], ['smartSight','Smart Sight'],
        ['canOverwatch','Overwatch'], ['shieldHealing','Shield Healing'], ['noSplash','No Splash'], ['disadvantageVsNonVehicle','Disadv. non-Vehicle'],
      ] as const).map(([key,label]) => <Toggle key={key} label={label} checked={Boolean(weapon[key])} onChange={(v) => set(key, v)} />)}
    </div>
    <label className="mt-2 block text-xs text-ink-muted">Traits<textarea className="input-cozy mt-1 min-h-16 w-full" value={weapon.traits ?? ''} onChange={(e) => set('traits', e.target.value)} /></label>
  </div>;
};

interface AbilityEditorProps { ability: SquadCommandAbility; onChange: (v: SquadCommandAbility) => void; onRemove: () => void; }
const AbilityEditor: React.FC<AbilityEditorProps> = ({ ability, onChange, onRemove }) => {
  const set = <K extends keyof SquadCommandAbility>(key: K, value: SquadCommandAbility[K]) => onChange({ ...ability, [key]: value });
  return <div className="rounded-cozy border border-ink/10 bg-paper p-3">
    <div className="mb-2 flex gap-2"><input className="input-cozy flex-1" value={ability.name} onChange={(e) => set('name', e.target.value)} /><Button variant="danger" size="sm" icon={Trash2} iconOnly aria-label="Remove ability" onClick={onRemove} /></div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <label className="text-xs text-ink-muted">Uses<input className="input-cozy mt-1 w-full" type="number" value={ability.usesCurrent ?? ''} onChange={(e) => set('usesCurrent', numberValue(e.target.value))} /></label>
      <label className="text-xs text-ink-muted">Uses max<input className="input-cozy mt-1 w-full" type="number" value={ability.usesMax ?? ''} onChange={(e) => set('usesMax', numberValue(e.target.value))} /></label>
      <label className="text-xs text-ink-muted">Cooldown<input className="input-cozy mt-1 w-full" type="number" value={ability.cooldownCurrent ?? ''} onChange={(e) => set('cooldownCurrent', numberValue(e.target.value))} /></label>
      <label className="text-xs text-ink-muted">CD max<input className="input-cozy mt-1 w-full" type="number" value={ability.cooldownMax ?? ''} onChange={(e) => set('cooldownMax', numberValue(e.target.value))} /></label>
    </div>
    <label className="mt-2 block text-xs text-ink-muted">Rules<textarea className="input-cozy mt-1 min-h-16 w-full" value={ability.rules ?? ''} onChange={(e) => set('rules', e.target.value)} /></label>
  </div>;
};

export default function SquadCommandCharacterSheet({ character, mode, onSave, onDirtyChange, onEditStart, onCancel }: CharacterSheetProps) {
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);
  const [form, setForm] = useState<SquadCommandCharacterData>(() => initialData(character));
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string>('');
  const [previewDef, setPreviewDef] = useState(8);
  const [previewAv, setPreviewAv] = useState(1);
  const [previewHp, setPreviewHp] = useState(10);
  const [previewShield, setPreviewShield] = useState(0);

  useEffect(() => { if (currentMode === 'edit') onEditStart?.(); }, [currentMode, onEditStart]);
  useEffect(() => { if (currentMode === 'view') setForm(initialData(character)); }, [character, currentMode]);

  const faction = form.faction ?? 'astora';
  const profile = form.profile ?? 'trooper';
  const unitIds = useMemo(() => unitIdsFor(faction, profile), [faction, profile]);
  const stats = form.stats ?? EMPTY_STATS;
  const battle = form.battle ?? EMPTY_BATTLE_STATE;
  const field = battle.battlefield;
  const selectedUnit = form.unitId ? UNITS[form.unitId] : undefined;
  const validation = useMemo(() => validateCombatProfile(form), [form]);

  const change = (next: SquadCommandCharacterData) => { setForm(normalizeSquadCommandData(next)); onDirtyChange?.(true); };
  const saveData = async (next: SquadCommandCharacterData, showToast = true) => {
    if (!onSave) return;
    const normalized = normalizeSquadCommandData(next); setForm(normalized); await onSave(normalized as CharacterData, showToast); window.dispatchEvent(new CustomEvent('smugvtt:speaker-profile-changed')); onDirtyChange?.(false);
  };
  const applyLive = async (transform: (d: SquadCommandCharacterData) => SquadCommandCharacterData) => {
    setSaving(true); try { await saveData(transform(form), false); } finally { setSaving(false); }
  };

  const setField = (patch: Partial<typeof field>) => {
    if (currentMode === 'view') {
      void applyLive((data) => setBattlefieldState(data, patch));
      return;
    }
    change(setBattlefieldState(form, patch));
  };
  const setStat = (key: keyof SquadCommandUnitStats, value: number) => change({ ...form, stats: { ...stats, [key]: value } });

  const changeFaction = (nextFaction: SquadCommandFaction) => {
    const first = firstUnitIdFor(nextFaction, profile);
    change(first ? applyCanonicalUnit({ ...form, faction: nextFaction }, first) : makeCustomProfile(form, nextFaction, profile));
  };
  const changeProfile = (nextProfile: SquadCommandProfile) => {
    const first = firstUnitIdFor(faction, nextProfile);
    change(first ? applyCanonicalUnit({ ...form, profile: nextProfile }, first) : makeCustomProfile(form, faction, nextProfile));
  };
  const changeUnit = (unitId: string) => {
    if (unitId === 'custom_vehicle') return change(makeCustomProfile(form, faction, 'vehicle'));
    const unit = UNITS[unitId];
    if (unit?.sourceStatus === 'source-locked') { setPreview(`SOURCE LOCKED — ${unit.sourceNote ?? 'Retrieve the finalized vehicle handout; no guessed stats were applied.'}`); return; }
    change(applyCanonicalUnit(form, unitId));
  };

  const resetCanonical = () => {
    if (!form.unitId || !UNITS[form.unitId] || UNITS[form.unitId].sourceStatus === 'source-locked') return;
    if (!window.confirm('Reset stats, weapons, abilities, and battle state to the canonical profile? Name and notes are kept.')) return;
    change(applyCanonicalUnit(form, form.unitId, form.packageId));
  };

  const testWeapon = (weapon: SquadCommandWeapon) => {
    const target = normalizeSquadCommandData({
      characterName: 'Target Preview', faction: 'westphal', profile: field.targetIsVehicle ? 'vehicle' : 'trooper',
      stats: { hpCurrent: previewHp, hpMax: previewHp, defense: previewDef, av: previewAv, move: 6, shieldCurrent: previewShield, shieldMax: previewShield, suppression: 0 },
      weapons: [], abilities: [], notes: '',
    });
    const result = resolveWeaponAction(form, target, weapon.id, {
      distance: field.targetDistance, actionMode: 'none', targetCover: field.targetCover,
      targetProne: field.targetProne, targetObscured: field.targetObscured,
      targetIsVehicle: field.targetIsVehicle, targetArc: field.targetArc,
    });
    setPreview(`${result.title}\n${formatCombatResult(result)}`);
  };

  const sourceBadge = form.profileSource?.status === 'source-locked' ? 'Source locked' : form.profileSource?.status === 'custom' ? 'Custom' : 'Canonical';

  const commonHeader = <section className="rounded-cozy border bg-paper p-5 shadow-sm" style={{ borderColor: visibleThemeColor(form.themeColor) }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Squad Command • Squadron Command • SmugVTT Squad Command v{TW_SYSTEM_VERSION}</div><h2 className="text-2xl font-bold text-ink">{form.characterName}</h2><p className="text-sm text-ink-secondary">{FACTION_LABELS[faction]} • {PROFILE_LABELS[profile]} • {selectedUnit?.name ?? form.branch ?? 'Custom'} • {sourceBadge}</p></div>
      {currentMode === 'view' ? <Button variant="secondary" icon={Pencil} onClick={() => setCurrentMode('edit')}>Edit</Button> : null}
    </div>
    {form.profileSource?.note && <div className="mt-3 rounded border border-warning/30 bg-warning/10 p-2 text-xs text-warning-ink"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{form.profileSource.note}</div>}
  </section>;

  const combatProfile = <Section title="Combat Profile" aside={<span className="text-xs text-ink-muted">Profile rev {form.profileRevision ?? '—'}</span>}>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
      <StatBox label="HP" value={stats.hpCurrent} editing={currentMode === 'edit'} onChange={(v) => setStat('hpCurrent', v)} />
      <StatBox label="HP Max" value={stats.hpMax} editing={currentMode === 'edit'} onChange={(v) => setStat('hpMax', v)} />
      <StatBox label="DEF" value={stats.defense} editing={currentMode === 'edit'} onChange={(v) => setStat('defense', v)} />
      <StatBox label="AV" value={stats.av} editing={currentMode === 'edit'} onChange={(v) => setStat('av', v)} />
      <StatBox label="Move" value={stats.move} editing={currentMode === 'edit'} onChange={(v) => setStat('move', v)} />
      <StatBox label="Shield" value={stats.shieldCurrent} editing={currentMode === 'edit'} onChange={(v) => setStat('shieldCurrent', v)} />
      <StatBox label="Shield Max" value={stats.shieldMax} editing={currentMode === 'edit'} onChange={(v) => setStat('shieldMax', v)} />
      <StatBox label="Supp." value={stats.suppression} editing={currentMode === 'edit'} onChange={(v) => setStat('suppression', Math.max(0, Math.min(3, v)))} />
    </div>
    {stats.directionalAV && <div className="mt-2 text-xs text-ink-secondary">Directional AV: Front {stats.directionalAV.front} • Side {stats.directionalAV.side} • Rear {stats.directionalAV.rear}</div>}
    <div className="mt-2 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-ink/5 px-2 py-1">Rally {battle.rallyUsed ? 'USED' : 'ready'}</span><span className="rounded-full bg-ink/5 px-2 py-1">Fatigue {battle.fatiguePenalty}</span><span className="rounded-full bg-ink/5 px-2 py-1">Nanite {battle.naniteBuffer}</span>{battle.bastionActive && <span className="rounded-full bg-warning/10 px-2 py-1 text-warning-ink">Bastion ACTIVE</span>}{field.overwatch.active && <span className="rounded-full bg-info/10 px-2 py-1 text-info-ink">OW {field.overwatch.reactions}</span>}</div>
  </Section>;

  const battleControls = <Section title="Battle / Battlefield">
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><StatBox label="Round" value={battle.round} /><StatBox label="Activation" value={battle.activation} /><StatBox label="Actions" value={battle.actionsThisActivation} /><StatBox label="Pushes" value={battle.pushesThisActivation} /></div>
    <div className="mt-3 flex flex-wrap gap-2">
      {!battle.active ? <Button disabled={saving} onClick={() => void applyLive(startBattle)}>Start Battle</Button> : <>
        <Button disabled={saving} variant="secondary" onClick={() => void applyLive(nextRound)}>Next Round</Button><Button disabled={saving} variant="secondary" onClick={() => void applyLive(startActivation)}>Activation</Button>
        <Button disabled={saving || battle.actionsThisActivation > battle.pushesThisActivation || battle.actionsThisActivation >= 3} variant="secondary" onClick={() => void applyLive((d) => recordAction(d, false))}>Free Action</Button>
        <Button disabled={saving || battle.pushesThisActivation >= 2 || battle.actionsThisActivation >= 3} variant="secondary" onClick={() => void applyLive((d) => recordAction(d, true))}>Push</Button>
        <Button disabled={saving} variant="secondary" onClick={() => void applyLive(refreshUnit)}>Refresh</Button><Button disabled={saving || battle.rallyUsed || stats.suppression === 0} variant="secondary" onClick={() => void applyLive((d) => performRally(d, false))}>Rally</Button>
        <Button disabled={saving} variant="secondary" onClick={() => { if (window.confirm('Reset per-battle uses/cooldowns? HP, Shield and ammo will NOT be restored.')) void applyLive(battleReset); }}>Battle Reset</Button>
        <Button disabled={saving} variant="danger" onClick={() => void applyLive(endBattle)}>End Battle</Button>
      </>}
    </div>
    <p className="mt-2 text-xs text-ink-muted">Refresh: Suppression −1, cooldowns −1, action/fatigue state clears; listed vehicle Shield recharge applies. Battle Reset never restores HP, Shield, or weapon ammo.</p>
    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
      <label className="text-xs text-ink-muted">Cover<select className="input-cozy mt-1 w-full" value={field.cover} onChange={(e) => setField({ cover: Number(e.target.value) as SquadCommandCover })}><option value={0}>None</option><option value={1}>Light</option><option value={2}>Heavy</option></select></label>
      <label className="text-xs text-ink-muted">Attack edge<select className="input-cozy mt-1 w-full" value={field.attackEdge} onChange={(e) => setField({ attackEdge: Number(e.target.value) as SquadCommandAttackEdge })}><option value={-1}>Disadv.</option><option value={0}>Normal</option><option value={1}>Adv.</option></select></label>
      <Toggle label="High Ground" checked={field.highGround} onChange={(v) => setField({ highGround: v })} /><Toggle label="Prone" checked={field.prone} onChange={(v) => setField({ prone: v })} /><Toggle label="Obscured" checked={field.obscured} onChange={(v) => setField({ obscured: v })} /><Toggle label="Poor Visibility" checked={field.poorVisibility} onChange={(v) => setField({ poorVisibility: v })} /><Toggle label="Flanked" checked={field.flanked} onChange={(v) => setField({ flanked: v })} />
    </div>
  </Section>;

  const targetHelper = <Section title="Range / Cover Helper" aside={<Crosshair className="h-4 w-4 text-ink-muted" />}>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
      <label className="text-xs text-ink-muted">Distance<input className="input-cozy mt-1 w-full" type="number" min={0} max={99} value={field.targetDistance} onChange={(e) => setField({ targetDistance: Math.max(0, numberValue(e.target.value)) })} /></label>
      <label className="text-xs text-ink-muted">Target Cover<select className="input-cozy mt-1 w-full" value={field.targetCover} onChange={(e) => setField({ targetCover: Number(e.target.value) as SquadCommandCover })}><option value={0}>None</option><option value={1}>Light</option><option value={2}>Heavy</option></select></label>
      <Toggle label="Target Prone" checked={field.targetProne} onChange={(v) => setField({ targetProne: v })} /><Toggle label="Target Obscured" checked={field.targetObscured} onChange={(v) => setField({ targetObscured: v })} /><Toggle label="Vehicle" checked={field.targetIsVehicle} onChange={(v) => setField({ targetIsVehicle: v })} />
      <label className="text-xs text-ink-muted">Vehicle Arc<select className="input-cozy mt-1 w-full" value={field.targetArc} onChange={(e) => setField({ targetArc: e.target.value as SquadCommandVehicleArc })}><option value="front">Front</option><option value="side">Side</option><option value="rear">Rear</option></select></label>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4"><label className="text-xs text-ink-muted">Preview DEF<input className="input-cozy mt-1 w-full" type="number" value={previewDef} onChange={(e) => setPreviewDef(numberValue(e.target.value))} /></label><label className="text-xs text-ink-muted">Preview AV<input className="input-cozy mt-1 w-full" type="number" value={previewAv} onChange={(e) => setPreviewAv(numberValue(e.target.value))} /></label><label className="text-xs text-ink-muted">Preview HP<input className="input-cozy mt-1 w-full" type="number" value={previewHp} onChange={(e) => setPreviewHp(numberValue(e.target.value))} /></label><label className="text-xs text-ink-muted">Preview Shield<input className="input-cozy mt-1 w-full" type="number" value={previewShield} onChange={(e) => setPreviewShield(numberValue(e.target.value))} /></label></div>
    {preview && <pre className="mt-3 whitespace-pre-wrap rounded bg-ink/5 p-3 text-xs text-ink-secondary">{preview}</pre>}
  </Section>;

  const weaponCards = <Section title="Weapons">
    <div className="space-y-2">{(form.weapons ?? []).length === 0 && <p className="text-sm text-ink-muted">No weapons recorded.</p>}{(form.weapons ?? []).map((weapon) => {
      const reason = weaponUnavailableReason(form, weapon, { distance: field.targetDistance, actionMode: nextActionMode(form) ?? 'none' });
      const ow = field.overwatch.active && field.overwatch.weaponId === weapon.id;
      return <div key={weapon.id} className="rounded-cozy border border-ink/10 bg-ink/5 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="text-ink">{weapon.name}</strong><div className="text-xs text-ink-secondary">{weapon.damage} • Acc {weapon.accuracy >= 0 ? '+' : ''}{weapon.accuracy} • AP {weapon.ap} • {weapon.range}</div></div><div className="text-xs text-ink-muted">{weapon.ammoMax ? `Ammo ${weapon.ammoCurrent ?? 0}/${weapon.ammoMax}` : ''}{weapon.cooldownMax ? ` • CD ${weapon.cooldownCurrent ?? 0}/${weapon.cooldownMax}` : ''}</div></div>
        <div className="mt-2 flex flex-wrap gap-1">{weapon.canOverwatch && <span className="rounded bg-info/10 px-2 py-0.5 text-[10px] text-info-ink">OW</span>}{weapon.ignoreAV && <span className="rounded bg-warning/10 px-2 py-0.5 text-[10px] text-warning-ink">Ignore AV</span>}{weapon.ignoreCover && <span className="rounded bg-warning/10 px-2 py-0.5 text-[10px] text-warning-ink">Ignore Cover</span>}{weapon.antiTank && <span className="rounded bg-danger/10 px-2 py-0.5 text-[10px] text-danger-ink">Anti-Tank</span>}{weapon.smartSight && <span className="rounded bg-info/10 px-2 py-0.5 text-[10px] text-info-ink">Smart Sight</span>}</div>
        {weapon.traits && <p className="mt-2 text-xs text-ink-secondary">{weapon.traits}</p>}
        <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={Boolean(reason)} onClick={() => testWeapon(weapon)} title={reason ?? 'Roll against the preview target without changing either sheet'}>Test Roll</Button>{weapon.ammoMax ? <Button size="sm" variant="secondary" disabled={weapon.ammoCurrent === weapon.ammoMax || weapon.id === 'seeker' || weapon.id === 'frag_grenade'} onClick={() => void applyLive((d) => reloadWeapon(d, weapon.id))}>Reload</Button> : null}{weapon.canOverwatch && <Button size="sm" variant="secondary" onClick={() => void applyLive((d) => ow ? cancelOverwatch(d) : armOverwatch(d, weapon.id))}>{ow ? 'Cancel OW' : 'Arm OW'}</Button>}{reason && <span className="self-center text-[10px] text-danger-ink">{reason}</span>}</div>
      </div>;
    })}</div>
  </Section>;

  const abilityCards = <Section title="Abilities & Equipment"><div className="space-y-2">{(form.abilities ?? []).filter((ability) => !isSquadSpecialAbility(ability.id)).map((ability) => <div key={ability.id} className="rounded-cozy border border-ink/10 bg-ink/5 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-ink">{ability.name}</strong><span className="text-xs text-ink-muted">{ability.usesMax !== undefined ? `Uses ${ability.usesCurrent ?? 0}/${ability.usesMax}` : ''}{ability.cooldownMax !== undefined ? ` • CD ${ability.cooldownCurrent ?? 0}/${ability.cooldownMax}` : ''}</span></div>{ability.rules && <p className="mt-1 text-xs text-ink-secondary">{ability.rules}</p>}<Button className="mt-2" size="sm" variant="secondary" onClick={() => void applyLive((d) => activateAbility(d, ability.id))}>Use / Reference</Button></div>)}</div></Section>;

  const specialAbilities = currentMode === 'view' && canUseSquadSpecialAbilities(form) ? <SquadSpecialAbilityPanel
    character={character}
    data={form}
    canControl={Boolean(onSave)}
    onCommitted={(updated) => setForm(normalizeSquadCommandData(updated.data as SquadCommandCharacterData))}
  /> : null;

  const validationPanel = <Section title="Profile Validation" aside={<span className={`text-xs ${validation.some((x) => x.severity === 'error') ? 'text-danger-ink' : 'text-success-ink'}`}>{validation.length ? `${validation.length} issue${validation.length === 1 ? '' : 's'}` : 'Ready'}</span>}>
    {validation.length === 0 ? <p className="text-sm text-success-ink">No structural combat-profile warnings.</p> : <div className="space-y-1">{validation.map((issue, i) => <div key={`${issue.message}-${i}`} className={`rounded px-2 py-1 text-xs ${issue.severity === 'error' ? 'bg-danger/10 text-danger-ink' : 'bg-warning/10 text-warning-ink'}`}>{issue.message}</div>)}</div>}
  </Section>;

  const promotionPanel = <Section title="Promotion Trees"><div className="grid gap-2 md:grid-cols-2">{PROMOTION_TREES[faction].map((tree, i) => <div key={i} className="rounded bg-ink/5 p-2 text-xs text-ink-secondary">{tree.join(' → ')}</div>)}</div></Section>;

  const vehiclePanel = <Section title="Vehicle Preset Audit"><div className="grid gap-2 md:grid-cols-2">{VEHICLE_CATALOG.map((v) => <div key={v.id} className="rounded border border-ink/10 p-2 text-xs"><div className="flex justify-between gap-2"><strong>{FACTION_LABELS[v.faction]} — {v.name}</strong><span className={v.status === 'complete' ? 'text-success-ink' : 'text-warning-ink'}>{v.status === 'complete' ? 'Loaded' : 'Source locked'}</span></div>{v.note && <p className="mt-1 text-ink-muted">{v.note}</p>}</div>)}</div></Section>;

  const logPanel = <Section title="Combat / Action History"><div className="max-h-72 space-y-1 overflow-auto">{(form.combatLog ?? []).length === 0 ? <p className="text-xs text-ink-muted">No combat actions recorded yet.</p> : [...(form.combatLog ?? [])].reverse().map((entry) => <div key={entry.id} className="rounded border border-ink/10 p-2 text-xs"><div className="flex justify-between gap-2"><strong>{entry.title}</strong><span className="text-ink-muted">{new Date(entry.at).toLocaleString()}</span></div><p className="mt-1 text-ink-secondary">{entry.detail}</p></div>)}</div></Section>;

  if (currentMode === 'view') return <div className="space-y-4">{commonHeader}{combatProfile}{battleControls}{targetHelper}{weaponCards}{specialAbilities}{abilityCards}{validationPanel}{promotionPanel}{profile === 'vehicle' && vehiclePanel}{logPanel}{form.notes && <Section title="Notes"><p className="whitespace-pre-wrap text-sm text-ink-secondary">{form.notes}</p></Section>}</div>;

  const updateWeapon = (index: number, weapon: SquadCommandWeapon) => { const next = [...(form.weapons ?? [])]; next[index] = weapon; change({ ...form, weapons: next }); };
  const updateAbility = (index: number, ability: SquadCommandAbility) => { const next = [...(form.abilities ?? [])]; next[index] = ability; change({ ...form, abilities: next }); };
  const handleSave = async () => { setSaving(true); try { await saveData(form); setCurrentMode('view'); } finally { setSaving(false); } };
  const handleCancel = () => { setForm(initialData(character)); onDirtyChange?.(false); setCurrentMode('view'); onCancel?.(); };

  return <div className="space-y-4">{commonHeader}
    <Section title="Canonical Profile / Identity" aside={selectedUnit?.sourceStatus !== 'source-locked' ? <Button variant="secondary" size="sm" icon={RotateCcw} onClick={resetCanonical}>Reset Canonical</Button> : null}>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm text-ink-secondary">Character Name<input className="input-cozy mt-1 w-full" value={form.characterName} onChange={(e) => change({ ...form, characterName: e.target.value })} /></label>
        <label className="text-sm text-ink-secondary">Faction<select className="input-cozy mt-1 w-full" value={faction} onChange={(e) => changeFaction(e.target.value as SquadCommandFaction)}>{(Object.keys(FACTION_LABELS) as SquadCommandFaction[]).map((k) => <option key={k} value={k}>{FACTION_LABELS[k]}</option>)}</select></label>
        <label className="text-sm text-ink-secondary">Profile<select className="input-cozy mt-1 w-full" value={profile} onChange={(e) => changeProfile(e.target.value as SquadCommandProfile)}>{(Object.keys(PROFILE_LABELS) as SquadCommandProfile[]).map((k) => <option key={k} value={k}>{PROFILE_LABELS[k]}</option>)}</select></label>
        {(profile === 'trooper' || profile === 'vehicle') ? <label className="text-sm text-ink-secondary">Unit / Rank<select className="input-cozy mt-1 w-full" value={form.unitId ?? ''} onChange={(e) => changeUnit(e.target.value)}>{unitIds.map((id) => <option key={id} value={id} disabled={UNITS[id]?.sourceStatus === 'source-locked'}>{UNITS[id]?.name}{UNITS[id]?.sourceStatus === 'source-locked' ? ' — source locked' : ''}</option>)}{profile === 'vehicle' && <option value="custom_vehicle">Custom Vehicle</option>}</select></label> : <label className="text-sm text-ink-secondary">Unit / Rank<input className="input-cozy mt-1 w-full" value={form.branch ?? ''} onChange={(e) => change({ ...form, branch: e.target.value })} /></label>}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-ink-secondary">
        <input type="checkbox" checked={form.isPlayerCharacter === true} onChange={(e) => change({ ...form, isPlayerCharacter: e.target.checked })} />
        Player Character (special-ability eligibility; Commanders qualify automatically)
      </label>
      {canUseSquadSpecialAbilities(form) && <div className="mt-3 rounded-cozy border border-warning/25 p-3">
        <div className="mb-2 text-sm font-semibold text-ink">Assign Special Abilities</div>
        <div className="grid gap-1.5 md:grid-cols-2">
          {TW_SPECIAL_ABILITIES.map((special) => {
            const assigned = (form.abilities ?? []).some((a) => a.id === special.id);
            return <label key={special.id} className="flex cursor-pointer items-start gap-2 rounded border border-ink/10 p-2 text-xs text-ink-secondary">
              <input type="checkbox" checked={assigned} onChange={(e) => change(e.target.checked
                ? grantSquadSpecialAbility(form, special.id)
                : { ...form, abilities: (form.abilities ?? []).filter((a) => a.id !== special.id) })} />
              <span><strong className="block text-ink">{special.name}</strong>{special.rules}</span>
            </label>;
          })}
        </div>
      </div>}
      {form.unitId === 'paladin'  && <label className="mt-3 block max-w-sm text-sm text-ink-secondary">Legacy Equipment Package<select className="input-cozy mt-1 w-full" value={form.packageId ?? 'lance_canister'} onChange={(e) => change(applyCanonicalUnit(form, 'paladin', e.target.value))}>{Object.entries(PALADIN_PACKAGES).map(([id,pkg]) => <option key={id} value={id}>{pkg.name}</option>)}</select></label>}
      <div className="mt-4 grid gap-4 border-t border-ink/10 pt-4 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink-secondary">Character Theme</span>
            <input type="color" value={visibleThemeColor(form.themeColor)} aria-label="Custom character theme color" onChange={(e) => change({ ...form, themeColor: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-ink/10 bg-transparent p-0.5" />
          </div>
          <div className="flex flex-wrap gap-2">
            {THEME_SWATCHES.map((color) => <button key={color} type="button" title={color} aria-label={`Use theme ${color}`} onClick={() => change({ ...form, themeColor: color })} className={`h-7 w-7 rounded-full border-2 ${visibleThemeColor(form.themeColor).toLowerCase() === color.toLowerCase() ? 'border-ink ring-2 ring-ink/15' : 'border-paper shadow-sm'}`} style={{ backgroundColor: color }} />)}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Used by this sheet, the Speak As plate, and this character&apos;s name in chat.</p>
        </div>
        <div>
          <label className="text-sm font-medium text-ink-secondary">Chat Chime
            <div className="mt-1 flex gap-2">
              <select className="input-cozy min-w-0 flex-1" value={form.chatChime ?? 'default'} onChange={(e) => change({ ...form, chatChime: e.target.value as SquadCommandChatChime })}>
                {CHAT_CHIME_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <Button type="button" size="sm" variant="secondary" onClick={() => playChatChime(form.chatChime ?? 'default', { force: true })}>Preview</Button>
            </div>
          </label>
          <p className="mt-2 text-xs text-ink-muted">Plays for other table members when this identity posts. Everyone has a default chime unless they mute chat sounds locally.</p>
        </div>
      </div>
    </Section>
    {combatProfile}{battleControls}{targetHelper}
    <Section title="Weapon Editor"><div className="space-y-3">{(form.weapons ?? []).map((w,i) => <WeaponEditor key={`${w.id}-${i}`} weapon={w} onChange={(v) => updateWeapon(i,v)} onRemove={() => change({ ...form, weapons: (form.weapons ?? []).filter((_,j) => j !== i) })} />)}<Button variant="secondary" size="sm" icon={Plus} onClick={() => change({ ...form, weapons: [...(form.weapons ?? []), { id: `custom_weapon_${Date.now()}`, name: 'Custom Weapon', kind: 'attack', damage: '0', accuracy: 0, ap: '0', range: '' }] })}>Add Weapon</Button></div></Section>
    <Section title="Ability Editor"><div className="space-y-3">{(form.abilities ?? []).map((a,i) => <AbilityEditor key={`${a.id}-${i}`} ability={a} onChange={(v) => updateAbility(i,v)} onRemove={() => change({ ...form, abilities: (form.abilities ?? []).filter((_,j) => j !== i) })} />)}<Button variant="secondary" size="sm" icon={Plus} onClick={() => change({ ...form, abilities: [...(form.abilities ?? []), { id: `custom_ability_${Date.now()}`, name: 'Custom Ability', rules: '' }] })}>Add Ability</Button></div></Section>
    {validationPanel}{promotionPanel}{profile === 'vehicle' && vehiclePanel}
    <Section title="Notes"><textarea className="input-cozy min-h-28 w-full" value={form.notes ?? ''} onChange={(e) => change({ ...form, notes: e.target.value })} /></Section>
    <div className="flex justify-end gap-2"><Button variant="secondary" icon={X} onClick={handleCancel}>Cancel</Button><Button icon={Save} loading={saving} onClick={handleSave}>Save</Button></div>
  </div>;
}
