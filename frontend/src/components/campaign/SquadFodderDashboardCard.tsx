import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Copy,
  FileText,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import api from '@/services/api';
import type { CharacterTemplate } from '@/types';
import type {
  SquadCommandCharacterData,
  SquadCommandFaction,
  SquadCommandFodderDisposition,
} from '@/types/game-systems/squadCommand';
import { useToast } from '@/contexts/ToastContext';
import { apiErrorMessage } from '@/utils/errors';
import Button from '@/components/ui/Button';
import CharacterTemplateEditorModal from '@/components/character/CharacterTemplateEditorModal';

const TW_SYSTEM = 'SQUAD_COMMAND';
const FACTIONS: Array<{ value: SquadCommandFaction; label: string }> = [
  { value: 'astora', label: 'Faction 1' },
  { value: 'westphal', label: 'Faction 2' },
  { value: 'albion', label: 'Faction 3' },
  { value: 'gaulia', label: 'Faction 4' },
];
const DISPOSITIONS: Array<{ value: SquadCommandFodderDisposition; label: string }> = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'hostile', label: 'Hostile' },
];

function twData(template: CharacterTemplate): SquadCommandCharacterData {
  return (template.data ?? {}) as SquadCommandCharacterData;
}

function titleCase(value: string | undefined): string {
  if (!value) return 'Unassigned';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function SquadFodderDashboardCard() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<CharacterTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CharacterTemplate | null>(null);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all' | SquadCommandFaction | 'vehicle'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.listCharacterTemplates({ gameSystem: TW_SYSTEM, mine: true, limit: 100 });
      const full = await Promise.all(result.templates.map((template) => api.getCharacterTemplate(template.id)));
      setTemplates(full);
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not load Squad Command unit templates', 'error');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const openLibrary = () => navigate('/character-templates?gameSystem=SQUAD_COMMAND&mine=1&fodder=1');
  const createFodder = () => navigate('/character-templates?gameSystem=SQUAD_COMMAND&mine=1&fodder=1&create=1');

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return templates.filter((template) => {
      const data = twData(template);
      if (groupFilter === 'vehicle') {
        if (data.profile !== 'vehicle') return false;
      } else if (groupFilter !== 'all' && data.faction !== groupFilter) {
        return false;
      }
      if (!needle) return true;
      const weapons = (data.weapons ?? []).map((weapon) => weapon.name).join(' ');
      return `${template.name} ${data.faction ?? ''} ${data.profile ?? ''} ${data.unitId ?? ''} ${data.branch ?? ''} ${weapons}`
        .toLowerCase()
        .includes(needle);
    });
  }, [groupFilter, search, templates]);

  const replaceTemplate = (updated: CharacterTemplate) => {
    setTemplates((current) => current.map((template) => (template.id === updated.id ? updated : template)));
  };

  const updateData = async (
    template: CharacterTemplate,
    mutate: (data: SquadCommandCharacterData) => SquadCommandCharacterData,
  ) => {
    setBusyId(template.id);
    try {
      const latest = await api.getCharacterTemplate(template.id);
      const updated = await api.updateCharacterTemplate(template.id, {
        data: mutate({ ...twData(latest) }),
        updatedAt: latest.updatedAt,
      });
      replaceTemplate(updated);
    } catch (error) {
      showToast(apiErrorMessage(error) || `Could not update ${template.name}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const uploadArt = async (template: CharacterTemplate, file: File | undefined) => {
    if (!file) return;
    setBusyId(template.id);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', 'TOKEN');
      // Character Templates are server-wide, so CozyVTT requires GLOBAL art.
      form.append('scope', 'GLOBAL');
      form.append('name', file.name);
      const uploaded = await api.uploadAsset(form);
      const latest = await api.getCharacterTemplate(template.id);
      const updated = await api.updateCharacterTemplate(template.id, {
        tokenImageUrl: api.getAssetUrl(uploaded.asset.id, 'tokens'),
        updatedAt: latest.updatedAt,
      });
      replaceTemplate(updated);
      showToast(`${template.name} art updated`, 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not upload fodder art. Global asset permission may be required.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const rename = async (template: CharacterTemplate) => {
    const name = window.prompt('Fodder template name', template.name)?.trim();
    if (!name || name === template.name) return;
    setBusyId(template.id);
    try {
      const latest = await api.getCharacterTemplate(template.id);
      const updated = await api.updateCharacterTemplate(template.id, { name, updatedAt: latest.updatedAt });
      replaceTemplate(updated);
      showToast(`Renamed to ${name}`, 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not rename template', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const duplicate = async (template: CharacterTemplate) => {
    setBusyId(template.id);
    try {
      const source = await api.getCharacterTemplate(template.id);
      const copy = await api.createCharacterTemplate({
        name: `${source.name} Copy`,
        description: source.description,
        gameSystem: source.gameSystem,
        tokenImageUrl: source.tokenImageUrl,
        data: source.data,
      });
      setTemplates((current) => [...current, copy]);
      showToast(`${source.name} duplicated`, 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not duplicate template', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (template: CharacterTemplate) => {
    if (!window.confirm(`Delete fodder template “${template.name}”? Existing spawned units are not affected.`)) return;
    setBusyId(template.id);
    try {
      await api.deleteCharacterTemplate(template.id);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      showToast(`${template.name} template deleted`, 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not delete template', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="glass-panel col-span-full min-w-0 p-6">
      <div className="mb-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg bg-moss-green/10 p-2">
            <UsersRound className="h-6 w-6 text-brand-ink" />
          </div>
          <div className="min-w-0">
            <h2 className="font-heading text-xl font-semibold text-brand-ink">Squad Command Units</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-warm-gray">
              Master Squad Command units used by the GM map spawner. Configure the sheet, art and map defaults once; numbered battle copies stay independent.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={createFodder} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Fodder
          </Button>
          <Button onClick={openLibrary} variant="secondary" className="flex items-center gap-2">
            Manage Templates
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {templates.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-gray" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search fodder…"
              className="w-full rounded-lg border border-moss-green/20 bg-parchment/60 py-2 pl-9 pr-3 text-sm text-brand-ink outline-none focus:border-moss-green/50"
            />
          </label>
          <select
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value as typeof groupFilter)}
            className="rounded-lg border border-moss-green/20 bg-parchment/60 px-3 py-2 text-sm text-brand-ink"
            aria-label="Filter fodder by faction or vehicle"
          >
            <option value="all">All factions</option>
            {FACTIONS.map((faction) => <option key={faction.value} value={faction.value}>{faction.label}</option>)}
            <option value="vehicle">Vehicles</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-warm-gray"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : templates.length === 0 ? (
        <button
          type="button"
          onClick={createFodder}
          className="w-full rounded-lg border border-moss-green/20 bg-parchment/50 p-5 text-center transition-colors hover:border-moss-green/40"
        >
          <UsersRound className="mx-auto mb-2 h-8 w-8 text-brand-ink/40" />
          <p className="mb-1 text-sm font-medium text-brand-ink">Create your first fodder template</p>
          <p className="text-xs text-warm-gray">The template supplies the sheet, base name, art and spawn defaults.</p>
        </button>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-moss-green/15 bg-parchment/40 p-5 text-center text-sm text-warm-gray">
          No fodder templates match this filter.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((template) => {
            const data = twData(template);
            const stats = data.stats;
            const fodder = data.fodder;
            const weapons = (data.weapons ?? []).slice(0, 2).map((weapon) => weapon.name).join(' · ');
            const busy = busyId === template.id;
            return (
              <article key={template.id} className="rounded-xl border border-moss-green/20 bg-parchment/50 p-4">
                <div className="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
                  <div className="h-28 w-28 overflow-hidden rounded-xl bg-moss-green/10">
                    {template.tokenImageUrl ? (
                      <img src={template.tokenImageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-3xl font-bold text-brand-ink/35">{template.name.charAt(0)}</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-semibold text-brand-ink">{template.name}</h3>
                        <p className="mt-0.5 truncate text-xs text-warm-gray">
                          {titleCase(data.faction)} · {titleCase(data.profile)}{data.unitId ? ` · ${data.unitId}` : ''}
                        </p>
                      </div>
                      {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-warm-gray" />}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-brand-ink/85">
                      {stats && <span className="rounded-md bg-moss-green/10 px-2 py-1"><strong>HP</strong> {stats.hpMax}</span>}
                      {stats && <span className="rounded-md bg-moss-green/10 px-2 py-1"><strong>Shield</strong> {stats.shieldMax}</span>}
                      <span className="rounded-md bg-moss-green/10 px-2 py-1"><strong>Size</strong> {fodder?.tokenSize ?? 1}×{fodder?.tokenSize ?? 1}</span>
                    </div>
                    {weapons && <p className="mt-2 truncate text-xs text-warm-gray" title={weapons}>{weapons}</p>}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="block text-xs font-medium text-warm-gray">
                    <span className="mb-1 block">Faction</span>
                    <select
                      value={data.faction ?? ''}
                      disabled={busy}
                      onChange={(event) => void updateData(template, (current) => ({
                        ...current,
                        faction: (event.target.value || undefined) as SquadCommandFaction | undefined,
                      }))}
                      className="w-full rounded-lg border border-moss-green/20 bg-paper px-2.5 py-2 text-sm text-brand-ink"
                    >
                      <option value="">Unset</option>
                      {FACTIONS.map((faction) => <option key={faction.value} value={faction.value}>{faction.label}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-warm-gray">
                    <span className="mb-1 block">Team</span>
                    <select
                      value={fodder?.disposition ?? ''}
                      disabled={busy}
                      onChange={(event) => void updateData(template, (current) => ({
                        ...current,
                        fodder: {
                          ...current.fodder,
                          disposition: (event.target.value || undefined) as SquadCommandFodderDisposition | undefined,
                        },
                      }))}
                      className="w-full rounded-lg border border-moss-green/20 bg-paper px-2.5 py-2 text-sm text-brand-ink"
                    >
                      <option value="">Default</option>
                      {DISPOSITIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-warm-gray">
                    <span className="mb-1 block">Token Size</span>
                    <select
                      value={fodder?.tokenSize ?? 1}
                      disabled={busy}
                      onChange={(event) => void updateData(template, (current) => ({
                        ...current,
                        fodder: { ...current.fodder, tokenSize: Number(event.target.value) },
                      }))}
                      className="w-full rounded-lg border border-moss-green/20 bg-paper px-2.5 py-2 text-sm text-brand-ink"
                    >
                      {[1, 2, 3, 4, 5, 6].map((size) => <option key={size} value={size}>{size}×{size}</option>)}
                    </select>
                  </label>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-moss-green/10 pt-3 sm:grid-cols-4">
                  <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-moss-green/15 bg-paper/60 px-2 py-1.5 text-xs font-semibold text-brand-ink hover:bg-moss-green/10">
                    <ImagePlus className="h-4 w-4" />
                    {template.tokenImageUrl ? 'Change Art' : 'Set Art'}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      disabled={busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        void uploadArt(template, file);
                      }}
                    />
                  </label>
                  <button type="button" disabled={busy} onClick={() => setEditing(template)} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-moss-green/15 bg-paper/60 px-2 py-1.5 text-xs font-semibold text-brand-ink hover:bg-moss-green/10 disabled:opacity-50">
                    <FileText className="h-4 w-4" /> Sheet
                  </button>
                  <button type="button" disabled={busy} onClick={() => void rename(template)} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-moss-green/15 bg-paper/60 px-2 py-1.5 text-xs font-semibold text-brand-ink hover:bg-moss-green/10 disabled:opacity-50">
                    <Pencil className="h-4 w-4" /> Rename
                  </button>
                  <button type="button" disabled={busy} onClick={() => void duplicate(template)} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-moss-green/15 bg-paper/60 px-2 py-1.5 text-xs font-semibold text-brand-ink hover:bg-moss-green/10 disabled:opacity-50">
                    <Copy className="h-4 w-4" /> Duplicate
                  </button>
                </div>
                <div className="mt-2 flex justify-end">
                  <button type="button" disabled={busy} onClick={() => void remove(template)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-500/10 disabled:opacity-50">
                    <Trash2 className="h-4 w-4" /> Delete Template
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-[11px] text-warm-gray">
        Spawned copies remember their source template but are independent snapshots. Changing a master affects only future spawns.
      </p>

      {editing && (
        <CharacterTemplateEditorModal
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { void load(); }}
        />
      )}
    </section>
  );
}
