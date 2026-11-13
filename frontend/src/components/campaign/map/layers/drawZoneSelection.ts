/** Handles are rendered only in GM edit mode. World coordinates as map drawings. */
import type { Drawing } from '@/types/drawings';
import type { Viewport } from './types';
import { zoneBounds, zoneCorners } from '../zoneEditing';
export function drawZoneSelection(ctx: CanvasRenderingContext2D, zone: Drawing | null, viewport: Viewport): void {
  if (!zone?.zoneType) return;
  const b=zoneBounds(zone);
  ctx.save();
  ctx.strokeStyle='#ffffff'; ctx.lineWidth=2/viewport.zoom; ctx.setLineDash([8/viewport.zoom,5/viewport.zoom]);
  ctx.strokeRect(b.minX,b.minY,b.maxX-b.minX,b.maxY-b.minY);
  ctx.setLineDash([]);
  for (const [x,y] of Object.values(zoneCorners(zone))) {
    const side=10/viewport.zoom;
    ctx.fillStyle='#fff';ctx.fillRect(x-side/2,y-side/2,side,side);
    ctx.strokeStyle='#1f2937';ctx.strokeRect(x-side/2,y-side/2,side,side);
  }
  ctx.restore();
}
