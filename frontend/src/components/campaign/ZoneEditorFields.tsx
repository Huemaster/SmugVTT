/** GM properties for an existing map zone, shared by desktop and compact Draw tools. */
import { useEffect, useState } from 'react';
import type { Drawing } from '@/types/drawings';
import { ZONE_PRESETS } from './map/battlefieldZones';

export default function ZoneEditorFields({ selectedZone, onUpdate, onDuplicate, onDelete, onActivate }: {
  selectedZone: Drawing | null;
  onUpdate?: (zone: Drawing) => void;
  onDuplicate?: (zone: Drawing) => void;
  onDelete?: (zone: Drawing) => void;
  onActivate?: (zone: Drawing) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setConfirmDelete(false); }, [selectedZone?.id]);
  if (!selectedZone) return <p className="text-xs text-ink-muted">Select a colored zone on the map to edit it.</p>;
  const known=ZONE_PRESETS.find(z => z.id===selectedZone.zoneType);
  const update = (patch: Partial<Drawing>) => onUpdate?.({ ...selectedZone, ...patch });
  const btn='rounded border border-ink/30 px-2 py-1.5 text-xs hover:bg-ink/10';
  return <section aria-label="Selected zone properties" className="flex flex-col gap-2 rounded border border-brand/40 p-2">
    <strong className="text-xs">Selected: {known?.label ?? 'Battlefield Zone'}</strong>
    <label className="flex items-center gap-2 text-xs">Type
      <select aria-label="Selected zone type" value={selectedZone.zoneType ?? ''}
        onChange={e => {
          const preset=ZONE_PRESETS.find(z=>z.id===e.target.value);
          if (preset) update({ zoneType:preset.id, color:preset.color, fillColor:preset.color });
        }} className="rounded border border-ink/20 bg-paper px-2 py-1 text-ink">
        {ZONE_PRESETS.map(z=><option key={z.id} value={z.id}>{z.label}</option>)}
      </select>
    </label>
    <label className="flex items-center gap-2 text-xs">Color
      <input aria-label="Selected zone color" type="color" value={selectedZone.color} onChange={e=>update({color:e.target.value,fillColor:e.target.value})}/>
    </label>
    <label className="flex items-center gap-2 text-xs">Opacity
      <select aria-label="Selected zone opacity" value={selectedZone.fillOpacity ?? 30}
        onChange={e=>update({fillOpacity:Number(e.target.value)})} className="rounded border border-ink/20 bg-paper px-2 py-1 text-ink">
        {[10,15,20,25,30,35,40,45,50,55,60,65,70].map(v=><option key={v} value={v}>{v}%</option>)}
      </select>
    </label>
    <span className="text-[11px] text-ink-muted">{selectedZone.audience==='DM' ? 'GM-only zone' : 'Visible to everyone'} · Drag the zone or its white corners to move/resize. Positional cover, smoke and elevation apply to Squad Command. AoE effects require GM approval.</span>
    <div className="flex flex-wrap gap-1">
      {(selectedZone.zoneType === 'healing' || selectedZone.zoneType === 'hazard') && <button type="button" className={btn+' border-green-500/60 font-semibold'} onClick={()=>onActivate?.(selectedZone)}>{selectedZone.zoneType === 'healing' ? 'Activate healing AoE…' : 'Review hazard…'}</button>}
      <button type="button" className={btn} onClick={()=>onDuplicate?.(selectedZone)}>Duplicate</button>
      {confirmDelete ? <>
        <button type="button" className={btn+' text-red-600'} onClick={()=>{onDelete?.(selectedZone);setConfirmDelete(false);}}>Confirm delete</button>
        <button type="button" className={btn} onClick={()=>setConfirmDelete(false)}>Cancel</button>
      </> : <button type="button" className={btn+' text-red-600'} onClick={()=>setConfirmDelete(true)}>Delete zone</button>}
    </div>
  </section>;
}
