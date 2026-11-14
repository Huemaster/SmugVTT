/** Canvas 2D rendering for SmugVTT tactical zones. Draw in map-pixel coordinates
 * after the host has applied its existing pan/zoom viewport transform.
 * Does not alter visibility, permissions, hit testing, or the shared combat resolver.
 * Copyright 2026 SmugVTT contributors. SPDX-License-Identifier: AGPL-3.0-only.
 */
import { type BattlefieldZone, type Vec, ZONE_TYPES, zoneIsSealed, zoneIsValid } from './battlefieldZones.js';

export type RenderOptions = {show:boolean; isGM:boolean; selectedId?:string|null; grain?:boolean};
const patterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern | null>();
const grainPoints:readonly Vec[] = Object.freeze(Array.from({length:4},(_,i)=>({x:(i*19+3)%23,y:(i*29+7)%23})));
/** Stable procedural grain; avoid regenerated random patterns each frame. */
function grainPattern(ctx:CanvasRenderingContext2D):CanvasPattern|null {
  if(patterns.has(ctx)) return patterns.get(ctx) ?? null;
  if(typeof document==='undefined')return null;
  const c=document.createElement('canvas'); c.width=24;c.height=24;
  const x=c.getContext('2d');if(!x)return null;
  x.fillStyle='rgba(255,255,255,0.25)';
  for(const p of grainPoints)x.fillRect(p.x,p.y,1,1);
  x.fillStyle='rgba(0,0,0,0.30)';
  for(let i=0;i<7;i++)x.fillRect((i*11+5)%24,(i*7+11)%24,1,1);
  const p=ctx.createPattern(c,'repeat'); patterns.set(ctx,p); return p;
}
export function pathForZone(ctx:CanvasRenderingContext2D,z:Pick<BattlefieldZone,'shape'|'points'>):boolean {
  if(!zoneIsValid(z))return false;
  const p=z.points;
  ctx.beginPath();
  if(z.shape==='rectangle') {
    ctx.rect(Math.min(p[0].x,p[1].x),Math.min(p[0].y,p[1].y),Math.abs(p[1].x-p[0].x),Math.abs(p[1].y-p[0].y));
  }else if(z.shape==='ellipse') {
    ctx.ellipse((p[0].x+p[1].x)/2,(p[0].y+p[1].y)/2,Math.abs(p[1].x-p[0].x)/2,Math.abs(p[1].y-p[0].y)/2,0,0,Math.PI*2);
  }else {
    ctx.moveTo(p[0].x,p[0].y);
    for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y);
    if(z.shape==='polygon')ctx.closePath();
  }
  return true;
}
export function drawBattlefieldZones(ctx:CanvasRenderingContext2D,zones:readonly BattlefieldZone[],opts:RenderOptions):void {
  if(!opts.show)return;
  const pat=opts.grain===false?null:grainPattern(ctx);
  for(const z of zones) {
    if(z.audience==='gm'&&!opts.isGM)continue;
    if(!zoneIsValid(z))continue;
    const color=ZONE_TYPES[z.kind].color;
    ctx.save();
    if(!pathForZone(ctx,z)) {ctx.restore();continue;}
    if(zoneIsSealed(z)) {
      ctx.globalAlpha=.15;
      ctx.fillStyle=ZONE_TYPES[z.kind].fill;
      ctx.fill();
      if(pat) {
        ctx.globalAlpha=.42;
        ctx.fillStyle=pat;
        ctx.fill();
      }
    }
    ctx.globalAlpha=z.audience==='gm'?.65:1;
    ctx.lineWidth=opts.selectedId===z.id?3.5:Math.max(1.5,z.lineWidth??2);
    ctx.strokeStyle=color;
    ctx.setLineDash(z.audience==='gm'?[7,4]:[]);
    ctx.stroke();
    ctx.restore();
  }
}
