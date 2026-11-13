/** Battlefield zones are saved Drawings, NOT token statuses. Never write passive
 * effects into a character record: leaving, hiding or deleting the area must
 * update the result immediately. Map coordinates are top-left pixels; tokens
 * use bottom-left grid coordinates. */
import type { Drawing } from '@/types/drawings';
import type { Token } from '@/types';
import { gridYToCentrePx } from './coords';
import { ZONE_PRESETS } from './battlefieldZones';

export interface ZoneEffects {
  cover: 0 | 1 | 2;
  obscured: boolean;
  highGround: boolean;
  lowGround: boolean;
  inHealing: boolean;
  inHazard: boolean;
  zoneIds: string[];
}
export type ZonePoint = { x: number; y: number };
const EPS = 0.00001;
const zero = (): ZoneEffects => ({ cover: 0, obscured: false, highGround: false, lowGround: false, inHealing: false, inHazard: false, zoneIds: [] });
export function zoneContains(zone: Drawing, at: ZonePoint): boolean {
  if (!zone.zoneType || !['rect', 'ellipse', 'polygon'].includes(zone.kind) || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return false;
  const pts = zone.points;
  if (pts.length < (zone.kind === 'polygon' ? 3 : 2)) return false;
  // Drawing geometry can be rotated around its bounds. Unrotate the query point.
  const xs = pts.map(p => p[0]); const ys = pts.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const angle = -(zone.rotation || 0) * Math.PI / 180;
  const dx = at.x - cx, dy = at.y - cy;
  const p = { x: cx + dx * Math.cos(angle) - dy * Math.sin(angle), y: cy + dx * Math.sin(angle) + dy * Math.cos(angle) };
  if (zone.kind === 'rect') return p.x >= Math.min(pts[0][0], pts[1][0]) - EPS && p.x <= Math.max(pts[0][0], pts[1][0]) + EPS && p.y >= Math.min(pts[0][1], pts[1][1]) - EPS && p.y <= Math.max(pts[0][1], pts[1][1]) + EPS;
  if (zone.kind === 'ellipse') {
    const rx = Math.abs(pts[1][0] - pts[0][0]) / 2, ry = Math.abs(pts[1][1] - pts[0][1]) / 2;
    return rx > EPS && ry > EPS && ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 <= 1 + EPS;
  }
  // Even-odd polygon; points on boundaries are also inside.
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j], b = pts[i];
    const cross = (p.x-a[0])*(b[1]-a[1])-(p.y-a[1])*(b[0]-a[0]);
    if (Math.abs(cross) <= EPS * Math.max(1,Math.hypot(b[0]-a[0],b[1]-a[1])) &&
      p.x >= Math.min(a[0],b[0])-EPS && p.x <= Math.max(a[0],b[0])+EPS &&
      p.y >= Math.min(a[1],b[1])-EPS && p.y <= Math.max(a[1],b[1])+EPS) return true;
    if ((a[1] > p.y) !== (b[1] > p.y) && p.x < (b[0] - a[0]) * (p.y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function tokenCentreOnMap(token: Token, gridSize: number, mapHeight: number): ZonePoint {
  return { x: (token.position.x + token.size.width / 2) * gridSize,
    y: gridYToCentrePx(token.position.y, token.size.height, mapHeight, gridSize) };
}
export function zonesAt(zones: readonly Drawing[], at: ZonePoint): Drawing[] { return zones.filter(z => !!z.zoneType && zoneContains(z, at)); }
export function effectsAt(zones: readonly Drawing[], at: ZonePoint): ZoneEffects {
  const r = zero();
  for (const z of zonesAt(zones, at)) {
    r.zoneIds.push(z.id);
    switch (z.zoneType) {
      case 'light-cover': r.cover = Math.max(r.cover, 1) as 0 | 1 | 2; break;
      case 'heavy-cover': r.cover = 2; break;
      case 'smoke': case 'obscured': r.obscured = true; break;
      case 'high-ground': r.highGround = true; break;
      case 'low-ground': r.lowGround = true; break;
      case 'healing': r.inHealing = true; break;
      case 'hazard': r.inHazard = true; break;
    }
  }
  return r;
}
export function effectsForToken(zones: readonly Drawing[], token: Token, gridSize: number, mapHeight: number): ZoneEffects {
  return effectsAt(zones, tokenCentreOnMap(token, gridSize, mapHeight));
}
export function tokensWithinZone(zone: Drawing, tokens: readonly Token[], gridSize: number, mapHeight: number): Token[] {
  return tokens.filter(t => t.visible && zoneContains(zone, tokenCentreOnMap(t, gridSize, mapHeight)));
}
export function zoneName(zone: Drawing): string { return ZONE_PRESETS.find(p => p.id === zone.zoneType)?.label ?? 'Battlefield Zone'; }
export function zoneExplanation(type: string | null | undefined): string {
  switch (type) {
    case 'light-cover': return 'Squad Command: +1 Cover AV to occupants. Does not stack with heavy cover.';
    case 'heavy-cover': return 'Squad Command: +2 Cover AV to occupants. Strongest cover applies.';
    case 'high-ground': return 'Squad Command: higher firing position; +1 accuracy where applicable.';
    case 'low-ground': return 'Lower elevation; terrain disadvantage depends on the chosen rules.';
    case 'smoke': return 'Obscures occupants; ranged attacks without Smart Sight suffer an adverse targeting edge.';
    case 'obscured': return 'Obscures occupants; targeting is harder without an appropriate sight ability.';
    case 'healing': return 'One-shot area healing: the GM chooses an amount and confirms targets. No healing over time or movement trigger.';
    case 'hazard': return 'Marked danger area; GM confirms any damage or condition. No automatic repeated damage.';
    default: return 'Map annotation only.';
  }
}
