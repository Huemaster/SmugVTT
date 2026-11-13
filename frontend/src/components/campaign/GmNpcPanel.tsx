import { useEffect, useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Save, Search, Star, Trash2, X } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useToast } from '@/contexts/ToastContext';
import api from '@/services/api';
import Button from '@/components/ui/Button';
import type { CampaignNpc, CampaignNpcAction } from '@/types/fork';
import { apiErrorMessage } from '@/utils/errors';

function actionsToText(actions: CampaignNpcAction[]): string {
  return actions
    .map((action) => `${action.name}${action.description ? ` | ${action.description}` : ''}`)
    .join('\n');
}

function textToActions(text: string): CampaignNpcAction[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [namePart, ...descriptionParts] = line.split('|');
      const name = namePart.trim();
      const description = descriptionParts.join('|').trim();
      return {
        id: `action-${index + 1}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'action'}`,
        name,
        ...(description ? { description } : {}),
      };
    });
}

interface EditState {
  name: string;
  tags: string;
  gmNotes: string;
  notes: string;
  actions: string;
}

export default function GmNpcPanel() {
  const { campaign, userRole } = useCampaign();
  const { showToast } = useToast();
  const campaignId = campaign?.id ?? '';
  const [npcs, setNpcs] = useState<CampaignNpc[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [selectedActions, setSelectedActions] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!campaignId || userRole !== 'DM') return;
    setLoading(true);
    try {
      const result = await api.listCampaignNpcs(campaignId);
      setNpcs(result.npcs);
    } catch (error) {
      showToast(apiErrorMessage(error) ?? 'Could not load GM NPCs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [campaignId, userRole]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = needle
      ? npcs.filter((npc) =>
          npc.name.toLowerCase().includes(needle) ||
          npc.tags.some((tag) => tag.toLowerCase().includes(needle))
        )
      : npcs;
    return [...rows].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  }, [npcs, search]);

  if (userRole !== 'DM') return null;

  const createNpc = async () => {
    const name = newName.trim();
    if (!name || !campaignId) return;
    setCreating(true);
    try {
      const result = await api.createCampaignNpc(campaignId, { name });
      setNpcs((current) => [...current, result.npc]);
      setNewName('');
      showToast('NPC created', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) ?? 'Could not create NPC', 'error');
    } finally {
      setCreating(false);
    }
  };

  const beginEdit = (npc: CampaignNpc) => {
    setEditingId(npc.id);
    setEdit({
      name: npc.name,
      tags: npc.tags.join(', '),
      gmNotes: npc.gmNotes ?? '',
      notes: npc.notes ?? '',
      actions: actionsToText(npc.actions ?? []),
    });
  };

  const saveEdit = async (npc: CampaignNpc) => {
    if (!edit) return;
    setBusyId(npc.id);
    try {
      const result = await api.updateCampaignNpc(campaignId, npc.id, {
        name: edit.name.trim() || npc.name,
        tags: edit.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        gmNotes: edit.gmNotes,
        notes: edit.notes,
        actions: textToActions(edit.actions),
      });
      setNpcs((current) => current.map((row) => row.id === npc.id ? result.npc : row));
      setEditingId(null);
      setEdit(null);
      showToast('NPC saved', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) ?? 'Could not save NPC', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const patchNpc = async (npc: CampaignNpc, patch: Partial<CampaignNpc>) => {
    setBusyId(npc.id);
    try {
      const result = await api.updateCampaignNpc(campaignId, npc.id, patch);
      setNpcs((current) => current.map((row) => row.id === npc.id ? result.npc : row));
    } catch (error) {
      showToast(apiErrorMessage(error) ?? 'Could not update NPC', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const cloneNpc = async (npc: CampaignNpc) => {
    setBusyId(npc.id);
    try {
      const result = await api.cloneCampaignNpc(campaignId, npc.id);
      setNpcs((current) => [...current, result.npc]);
      showToast('NPC cloned', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) ?? 'Could not clone NPC', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const deleteNpc = async (npc: CampaignNpc) => {
    if (!window.confirm(`Delete NPC "${npc.name}"? This removes the fork NPC record, not any token already placed on a map.`)) return;
    setBusyId(npc.id);
    try {
      await api.deleteCampaignNpc(campaignId, npc.id);
      setNpcs((current) => current.filter((row) => row.id !== npc.id));
      showToast('NPC deleted', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) ?? 'Could not delete NPC', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const performAction = async (npc: CampaignNpc) => {
    const actionId = selectedActions[npc.id] || npc.actions?.[0]?.id;
    if (!actionId) return;
    setBusyId(npc.id);
    try {
      await api.performCampaignNpcAction(campaignId, npc.id, actionId);
      showToast(`${npc.name} acted`, 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) ?? 'Could not perform NPC action', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <div className="shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-ink">GM NPCs</h3>
            <p className="text-xs text-ink-muted">Separate from player Characters. Players cannot list this roster.</p>
          </div>
          <span className="text-xs text-ink-muted">{npcs.length}</span>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            className="input-cozy min-w-0 flex-1"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void createNpc();
            }}
            placeholder="New NPC name"
          />
          <Button size="sm" icon={Plus} loading={creating} disabled={!newName.trim()} onClick={() => void createNpc()}>
            Add
          </Button>
        </div>

        <label className="relative mt-2 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            className="input-cozy w-full pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search NPCs or tags"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {loading && <p className="py-6 text-center text-sm text-ink-muted">Loading NPCs…</p>}
        {!loading && filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-muted">No GM NPCs yet.</p>
        )}

        {filtered.map((npc) => {
          const activeEdit = editingId === npc.id ? edit : null;
          const busy = busyId === npc.id;
          return (
            <div key={npc.id} className="rounded-cozy border border-ink/10 bg-paper p-3">
              {activeEdit ? (
                <div className="space-y-2">
                  <input
                    className="input-cozy w-full"
                    value={activeEdit.name}
                    onChange={(event) => setEdit({ ...activeEdit, name: event.target.value })}
                    placeholder="NPC name"
                  />
                  <input
                    className="input-cozy w-full"
                    value={activeEdit.tags}
                    onChange={(event) => setEdit({ ...activeEdit, tags: event.target.value })}
                    placeholder="Tags, comma separated"
                  />
                  <textarea
                    className="input-cozy min-h-20 w-full"
                    value={activeEdit.gmNotes}
                    onChange={(event) => setEdit({ ...activeEdit, gmNotes: event.target.value })}
                    placeholder="GM-only notes"
                  />
                  <textarea
                    className="input-cozy min-h-16 w-full"
                    value={activeEdit.notes}
                    onChange={(event) => setEdit({ ...activeEdit, notes: event.target.value })}
                    placeholder="Public-facing notes for later reveal/cast support"
                  />
                  <div>
                    <p className="mb-1 text-xs text-ink-muted">Actions — one per line: Name | optional description</p>
                    <textarea
                      className="input-cozy min-h-24 w-full font-mono text-xs"
                      value={activeEdit.actions}
                      onChange={(event) => setEdit({ ...activeEdit, actions: event.target.value })}
                      placeholder={'Attack | Makes a basic attack\nRetreat | Falls back to cover'}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={X}
                      onClick={() => { setEditingId(null); setEdit(null); }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" icon={Save} loading={busy} onClick={() => void saveEdit(npc)}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <strong className="truncate text-ink">{npc.name}</strong>
                        {npc.revealed ? (
                          <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] text-success-ink">Revealed</span>
                        ) : (
                          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-ink-muted">Hidden</span>
                        )}
                      </div>
                      {npc.tags.length > 0 && <p className="mt-1 text-xs text-ink-muted">{npc.tags.join(' • ')}</p>}
                    </div>
                    <button
                      type="button"
                      title={npc.favorite ? 'Unfavorite' : 'Favorite'}
                      className="rounded p-1 text-ink-muted hover:bg-ink/5 hover:text-ink"
                      onClick={() => void patchNpc(npc, { favorite: !npc.favorite })}
                    >
                      <Star className={`h-4 w-4 ${npc.favorite ? 'fill-current' : ''}`} />
                    </button>
                  </div>

                  {npc.gmNotes && <p className="mt-2 whitespace-pre-wrap text-xs text-ink-secondary">{npc.gmNotes}</p>}

                  {(npc.actions?.length ?? 0) > 0 && (
                    <div className="mt-3 flex gap-2">
                      <select
                        className="input-cozy min-w-0 flex-1"
                        value={selectedActions[npc.id] ?? npc.actions[0].id}
                        onChange={(event) => setSelectedActions((current) => ({ ...current, [npc.id]: event.target.value }))}
                      >
                        {npc.actions.map((action) => <option key={action.id} value={action.id}>{action.name}</option>)}
                      </select>
                      <Button size="sm" loading={busy} onClick={() => void performAction(npc)}>Act</Button>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="secondary" icon={Pencil} onClick={() => beginEdit(npc)}>Edit</Button>
                    <Button size="sm" variant="secondary" icon={Copy} loading={busy} onClick={() => void cloneNpc(npc)}>Clone</Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void patchNpc(npc, { revealed: !npc.revealed })}
                    >
                      {npc.revealed ? 'Hide' : 'Mark Revealed'}
                    </Button>
                    <Button size="sm" variant="danger" icon={Trash2} loading={busy} onClick={() => void deleteNpc(npc)}>
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
