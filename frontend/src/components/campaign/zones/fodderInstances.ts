/**
 * SmugVTT map-only fodder instance model: pure construction helpers.
 * This module does NOT write database records or silently migrate existing
 * character entries. The server's creation/deletion/promote transactions will
 * call equivalent audited logic after the actual source is available.
 *
 * Copyright 2026 SmugVTT contributors. SPDX-License-Identifier: AGPL-3.0-only
 */
export type FodderTeam = 'friendly'|'neutral'|'hostile';
export interface FodderSheetSnapshot {
  characterName: string;
  playerName?: string;
  isPlayerCharacter?: boolean;
  profile?: 'trooper'|'commander'|'vehicle';
  fodder?: {tokenSize?:number;disposition?:FodderTeam;isSpawned?:boolean};
  abilities?: Array<{id:string;name:string;[key:string]:unknown}>;
  [key:string]:unknown;
}
export interface FodderMasterTemplate<T extends FodderSheetSnapshot> {
  id:string; name:string; artUrl?:string|null; data:T;
}
export interface MapFodderInstance<T extends FodderSheetSnapshot> {
  id:string;
  mapId:string;
  kind:'fodder_instance';
  templateId:string;
  name:string;
  sequence:number;
  artUrl:string|null;
  /** These are never identities of player accounts. */
  controlledBy:'gm';
  disposition:FodderTeam;
  tokenSize:number;
  /** Snapshot is distinct from template and other spawned instances. */
  data:T;
}
const SPECIALS = new Set(['orbital_rail_cannon','medic','resolve','exalted','reaper']);
/** An atomic server-side sequence will eventually supply lastIssued; gaps are not reused. */
export function nextFodderNumber(name:string,lastIssued:number,existingNames:readonly string[]):number {
  const prefix=`${name.trim()} `;
  let max=Number.isSafeInteger(lastIssued)&&lastIssued>=0?lastIssued:0;
  for(const n of existingNames) {
    if(!n.startsWith(prefix))continue;
    const suffix=n.slice(prefix.length);
    if(!/^[1-9]\d*$/.test(suffix))continue;
    const k=Number(suffix);
    if(Number.isSafeInteger(k))max=Math.max(max,k);
  }
  if(max===Number.MAX_SAFE_INTEGER)throw new Error('Fodder sequence exhausted');
  return max+1;
}
export function createMapFodder<T extends FodderSheetSnapshot>(
 template:FodderMasterTemplate<T>, args:{id:string;mapId:string;sequence:number;freshBattleData:(source:T)=>T}
):MapFodderInstance<T> {
  if(!template.id||!args.id||!args.mapId||!template.name.trim()||!Number.isSafeInteger(args.sequence)||args.sequence<1)
    throw new Error('Invalid fodder template/instance identifiers');
  if(template.data.profile==='commander')throw new Error('Commander templates cannot spawn as fodder');
  const original=structuredClone(template.data);
  const fresh=args.freshBattleData(original);
  // New, independent sheet snapshot; do not trust template owner/PC fields.
  const data: T = {
    ...structuredClone(fresh),
    characterName:`${template.name.trim()} ${args.sequence}`,
    playerName:undefined,
    isPlayerCharacter:false,
    fodder:{...fresh.fodder,isSpawned:true},
    abilities:(fresh.abilities??[]).filter(a=>!SPECIALS.has(a.id)),
  };
  return {
    id:args.id,mapId:args.mapId,kind:'fodder_instance',templateId:template.id,
    name:data.characterName,sequence:args.sequence,
    artUrl:template.artUrl??null,controlledBy:'gm',
    disposition:data.fodder?.disposition??'neutral',
    tokenSize:Math.max(1,Math.min(20,Math.floor(data.fodder?.tokenSize??1))),
    data,
  };
}
export function mayAppearInJournal(unit:{kind:string}):boolean {
  return unit.kind!=='fodder_instance';
}
export function fodderForActiveMap<T extends FodderSheetSnapshot>(instances:readonly MapFodderInstance<T>[],mapId:string):MapFodderInstance<T>[] {
  return instances.filter(x=>x.mapId===mapId);
}
/** Pure promotion draft; server must atomically create permanent character and relink token. */
export function makeNpcPromotionDraft<T extends FodderSheetSnapshot>(unit:MapFodderInstance<T>) {
  return {name:unit.name,artUrl:unit.artUrl,sourceFodderId:unit.id,
    data:{...structuredClone(unit.data),characterName:unit.name,isPlayerCharacter:false,
      playerName:undefined,fodder:{...unit.data.fodder,isSpawned:false}}};
}
