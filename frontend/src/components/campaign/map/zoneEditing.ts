/** Pure, game-system-agnostic geometry for GM battlefield zone editing. */
import type { Drawing } from '@/types/drawings';
export type ZoneCorner = 'nw' | 'ne' | 'sw' | 'se';
export type ZoneBounds = { minX: number; minY: number; maxX: number; maxY: number };
export function zoneBounds(zone: Pick<Drawing, 'points'>): ZoneBounds {
  const xs = zone.points.map(p => p[0]); const ys = zone.points.map(p => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
export function zoneCorners(zone: Pick<Drawing, 'points'>): Record<ZoneCorner, [number,number]> {
  const b = zoneBounds(zone);
  return { nw: [b.minX,b.minY], ne:[b.maxX,b.minY], sw:[b.minX,b.maxY], se:[b.maxX,b.maxY] };
}
export function zoneCornerAt(p: {x:number;y:number}, z: Pick<Drawing,'points'>, tol:number): ZoneCorner | null {
  for (const [id,[x,y]] of Object.entries(zoneCorners(z))) {
    if (Math.hypot(p.x-x,p.y-y) <= tol) return id as ZoneCorner;
  }
  return null;
}
export function moveZone(zone: Drawing, dx:number, dy:number): Drawing {
  return { ...zone, points: zone.points.map(([x,y]): [number,number] => [Math.round(x+dx), Math.round(y+dy)]) };
}
export function resizeZone(zone: Drawing, corner: ZoneCorner, pointer:{x:number;y:number}): Drawing {
  const b=zoneBounds(zone); const xs={nw:b.maxX,ne:b.minX,sw:b.maxX,se:b.minX};
  const ys={nw:b.maxY,ne:b.maxY,sw:b.minY,se:b.minY};
  const fixedX=xs[corner],fixedY=ys[corner];
  const targetX=Math.round(pointer.x),targetY=Math.round(pointer.y);
  // Prevent inverted or zero-area zones; corner stays on its own side.
  const minSide=5;
  const start=zoneCorners(zone)[corner];
  const signedX=start[0]<fixedX?-1:1,signedY=start[1]<fixedY?-1:1;
  const endX=signedX<0?Math.min(targetX,fixedX-minSide):Math.max(targetX,fixedX+minSide);
  const endY=signedY<0?Math.min(targetY,fixedY-minSide):Math.max(targetY,fixedY+minSide);
  const w=b.maxX-b.minX,h=b.maxY-b.minY;
  if (w < 1 || h < 1) return zone;
  const newMinX=Math.min(fixedX,endX),newMaxX=Math.max(fixedX,endX);
  const newMinY=Math.min(fixedY,endY),newMaxY=Math.max(fixedY,endY);
  return { ...zone, points: zone.points.map(([x,y]): [number,number] => [
    Math.round(newMinX + (x-b.minX)*((newMaxX-newMinX)/w)),
    Math.round(newMinY + (y-b.minY)*((newMaxY-newMinY)/h)),
  ]) };
}
