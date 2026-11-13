/**
 * SmugVTT Tactical Zone Core, v0.8.0b development candidate.
 * Pure functions only: NO API calls, localStorage, React, permissions, or UI state.
 * Map coordinates are PIXELS from the top-left; convert token bottom-origin
 * coordinates at the integration boundary. Do NOT infer statuses or apply
 * healing/damage just from overlapping a zone.
 *
 * Copyright 2026 SmugVTT contributors. SPDX-License-Identifier: AGPL-3.0-only
 * Contains no code copied from the upstream CozyVTT renderer.
 */
export type Vec = Readonly<{x: number; y: number}>;
export type ZoneKind = 'light_cover' | 'heavy_cover' | 'high_ground' | 'obscured' | 'smoke' | 'healing' | 'hazard';
export type ShapeKind = 'rectangle' | 'ellipse' | 'polygon' | 'line';
export type ZoneAudience = 'all' | 'gm';
export interface BattlefieldZone {
  id: string;
  mapId: string;
  kind: ZoneKind;
  shape: ShapeKind;
  points: Vec[];
  /** Primarily a visual designation; no automatic healing or damage. */
  label?: string;
  /** Lines are boundaries/annotations, not areas conferring status. */
  lineWidth?: number;
  audience: ZoneAudience;
  createdAt: string;
  updatedAt: string;
}
export interface ZoneEffects {
  cover: 0 | 1 | 2;
  obscured: boolean;
  onHighGround: boolean;
  healingArea: boolean;
  hazardArea: boolean;
  zoneIds: string[];
}
export interface ZoneCombatContext {
  /** Only effective if the attacker is higher than target. */
  attackerHighGround: boolean;
  targetHighGround: boolean;
  /** Defender gets best cover rather than stacking multiple zones. */
  targetCover: 0 | 1 | 2;
  /** Smoke and obscured stack only as a boolean. */
  targetObscured: boolean;
  contributingZoneIds: string[];
}
export const ZONE_TYPES: Readonly<Record<ZoneKind, {name:string;color:string; fill:string; area:boolean}>> = {
  light_cover: {name:'Light Cover',color:'#32a96b',fill:'#32a96b',area:true},
  heavy_cover: {name:'Heavy Cover',color:'#328acf',fill:'#328acf',area:true},
  high_ground: {name:'High Ground',color:'#dba138',fill:'#dba138',area:true},
  obscured: {name:'Obscured',color:'#8376b8',fill:'#8376b8',area:true},
  smoke: {name:'Smoke',color:'#929aa2',fill:'#929aa2',area:true},
  healing: {name:'Healing AoE',color:'#42c777',fill:'#42c777',area:true},
  hazard: {name:'Hazard / Custom AoE',color:'#c95858',fill:'#c95858',area:true},
};
const EPS = 1e-7;
export const isFinitePoint = (p: unknown): p is Vec => {
  if (!p || typeof p !== 'object') return false;
  const v = p as Partial<Vec>;
  return typeof v.x === 'number' && Number.isFinite(v.x) && typeof v.y === 'number' && Number.isFinite(v.y);
};
const distSquared = (a: Vec, b: Vec) => (a.x-b.x)**2+(a.y-b.y)**2;
function signedArea(pts: readonly Vec[]): number {
  return pts.reduce((a,p,i)=>a + p.x*pts[(i+1)%pts.length].y - pts[(i+1)%pts.length].x*p.y,0)/2;
}
function onSegment(a:Vec,b:Vec,p:Vec,tolerance=EPS):boolean {
  const cross = (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
  return Math.abs(cross) <= tolerance * Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)) &&
    p.x>=Math.min(a.x,b.x)-tolerance && p.x<=Math.max(a.x,b.x)+tolerance &&
    p.y>=Math.min(a.y,b.y)-tolerance && p.y<=Math.max(a.y,b.y)+tolerance;
}
function orient(a:Vec,b:Vec,c:Vec):number { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); }
function segmentsIntersect(a:Vec,b:Vec,c:Vec,d:Vec):boolean {
  const s1=orient(a,b,c),s2=orient(a,b,d),s3=orient(c,d,a),s4=orient(c,d,b);
  if (Math.abs(s1)<EPS && onSegment(a,b,c)) return true;
  if (Math.abs(s2)<EPS && onSegment(a,b,d)) return true;
  if (Math.abs(s3)<EPS && onSegment(c,d,a)) return true;
  if (Math.abs(s4)<EPS && onSegment(c,d,b)) return true;
  return (s1>0)!==(s2>0) && (s3>0)!==(s4>0);
}
/** Reject polygon self-intersections; a bowtie is not a sealed battlefield area. */
export function polygonIsSimple(pts:readonly Vec[]):boolean {
  if (pts.length<3) return false;
  for (let i=0;i<pts.length;i++) {
    const a=pts[i],b=pts[(i+1)%pts.length];
    if (distSquared(a,b)<EPS) return false;
    for(let j=i+1;j<pts.length;j++) {
      if (j===i+1 || (i===0&&j===pts.length-1)) continue;
      if(segmentsIntersect(a,b,pts[j],pts[(j+1)%pts.length])) return false;
    }
  }
  return Math.abs(signedArea(pts))>EPS;
}
/** Valid closed shapes are the only ones eligible for faint textured fill. */
export function zoneIsSealed(zone: Pick<BattlefieldZone,'shape'|'points'>):boolean {
  const {shape,points:p}=zone;
  if (!p.every(isFinitePoint)) return false;
  if (shape==='rectangle'||shape==='ellipse') return p.length===2 && Math.abs(p[0].x-p[1].x)>EPS && Math.abs(p[0].y-p[1].y)>EPS;
  if (shape==='polygon') {
    // Ignore an optional closing point equal to the first; normalize on save.
    const pts = p.length>3 && distSquared(p[0],p[p.length-1])<EPS ? p.slice(0,-1) : p;
    return polygonIsSimple(pts);
  }
  return false;
}
export function zoneIsValid(zone: Pick<BattlefieldZone,'shape'|'points'>):boolean {
  if (zone.shape==='line') return zone.points.length===2 && zone.points.every(isFinitePoint) && distSquared(zone.points[0],zone.points[1])>EPS;
  return zoneIsSealed(zone);
}
/** Edges count as inside. Line zones do NOT grant spatial effects. */
export function containsPoint(zone: Pick<BattlefieldZone,'shape'|'points'>,pt:Vec):boolean {
  if (!zoneIsSealed(zone) || !isFinitePoint(pt)) return false;
  const p=zone.points;
  if(zone.shape==='rectangle')return pt.x>=Math.min(p[0].x,p[1].x)-EPS&&pt.x<=Math.max(p[0].x,p[1].x)+EPS&&pt.y>=Math.min(p[0].y,p[1].y)-EPS&&pt.y<=Math.max(p[0].y,p[1].y)+EPS;
  if(zone.shape==='ellipse') {
    const cx=(p[0].x+p[1].x)/2,cy=(p[0].y+p[1].y)/2,rx=Math.abs(p[1].x-p[0].x)/2,ry=Math.abs(p[1].y-p[0].y)/2;
    return ((pt.x-cx)/rx)**2+((pt.y-cy)/ry)**2<=1+EPS;
  }
  const pts = p.length>3 && distSquared(p[0],p[p.length-1])<EPS ? p.slice(0,-1) : p;
  let inside=false;
  for (let i=0,j=pts.length-1;i<pts.length;j=i++) {
    if(onSegment(pts[j],pts[i],pt)) return true;
    const a=pts[i],b=pts[j];
    if((a.y>pt.y)!==(b.y>pt.y) && pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
export function effectsAt(zones:readonly BattlefieldZone[], position:Vec, mapId?:string):ZoneEffects {
  const state:ZoneEffects = {cover:0,obscured:false,onHighGround:false,healingArea:false,hazardArea:false,zoneIds:[]};
  for(const z of zones) {
    if(mapId && z.mapId!==mapId)continue;
    if(!containsPoint(z,position))continue;
    state.zoneIds.push(z.id);
    if(z.kind==='light_cover')state.cover=Math.max(state.cover,1) as 0|1|2;
    if(z.kind==='heavy_cover')state.cover=2;
    if(z.kind==='obscured'||z.kind==='smoke')state.obscured=true;
    if(z.kind==='high_ground')state.onHighGround=true;
    if(z.kind==='healing')state.healingArea=true;
    if(z.kind==='hazard')state.hazardArea=true;
  }
  return state;
}
/** No healing/damage is triggered here: ability resolver owns that event. */
export function combatContextAt(zones:readonly BattlefieldZone[], attacker:Vec, target:Vec, mapId:string):ZoneCombatContext {
  const a=effectsAt(zones,attacker,mapId), t=effectsAt(zones,target,mapId);
  return {attackerHighGround:a.onHighGround,targetHighGround:t.onHighGround,targetCover:t.cover,targetObscured:t.obscured,contributingZoneIds:[...new Set([...a.zoneIds,...t.zoneIds])]};
}
export function moveZone<T extends BattlefieldZone>(zone:T, dx:number,dy:number):T {
  if(!Number.isFinite(dx)||!Number.isFinite(dy)) throw new Error('Invalid zone movement');
  return {...zone, points:zone.points.map(p=>({x:p.x+dx,y:p.y+dy})),updatedAt:new Date().toISOString()};
}
/** Keep zones within the owning map and avoid side effects from malformed JSON. */
export function parseZones(raw:unknown, mapId:string):BattlefieldZone[] {
  if(!Array.isArray(raw)) return [];
  const result:BattlefieldZone[]=[];
  for(const item of raw.slice(0,500)) {
    if(!item || typeof item!=='object') continue;
    const z=item as Partial<BattlefieldZone>;
    if(typeof z.id!=='string'||z.id.length>128||z.id.length<1||z.mapId!==mapId ||
      !Object.prototype.hasOwnProperty.call(ZONE_TYPES,z.kind as string)||!['rectangle','ellipse','polygon','line'].includes(z.shape??'')||
      !Array.isArray(z.points)||z.points.length>256 || !zoneIsValid({shape:z.shape!,points:z.points}))continue;
    if(z.audience!=='all'&&z.audience!=='gm')continue;
    result.push({id:z.id,mapId,kind:z.kind!,shape:z.shape!,points:z.points.map(p=>({x:p.x,y:p.y})),audience:z.audience,
      label:typeof z.label==='string'?z.label.slice(0,100):undefined,
      lineWidth:typeof z.lineWidth==='number'&&z.lineWidth>=0&&z.lineWidth<=64?z.lineWidth:undefined,
      createdAt:typeof z.createdAt==='string'?z.createdAt:new Date(0).toISOString(),
      updatedAt:typeof z.updatedAt==='string'?z.updatedAt:new Date(0).toISOString()});
  }
  return result;
}
