import { describe, it, expect } from 'vitest';
import type { Drawing } from '@/types/drawings';
import { zoneBounds, zoneCornerAt, moveZone, resizeZone } from '../zoneEditing';
const base: Drawing = {
  id:'example-zone', authorId:'gm', audience:'DM', layer:'MARKUP', kind:'rect',
  zoneType:'light-cover', fillOpacity:30, color:'#e7ad42', fillColor:'#e7ad42',
  width:3, rotation:0, sortKey:0, points:[[100,100],[300,200]], text:null,createdAt:'2026-11-13T12:00:00Z',
};
describe('zone editing geometry', () => {
  it('moves without changing width, category or saved identity', () => {
    const moved=moveZone(base,50,-20);
    expect(moved.points).toEqual([[150,80],[350,180]]);
    expect(moved.id).toBe(base.id);
    expect(moved.zoneType).toBe(base.zoneType);
    expect(zoneBounds(moved)).toEqual({minX:150,minY:80,maxX:350,maxY:180});
  });
  it('finds corner handles in map pixels', () => {
    expect(zoneCornerAt({x:101,y:103},base,6)).toBe('nw');
    expect(zoneCornerAt({x:200,y:150},base,6)).toBe(null);
  });
  it('resizes a rectangle about the opposite corner and keeps a minimum size', () => {
    const bigger=resizeZone(base,'se',{x:450,y:240});
    expect(bigger.points).toEqual([[100,100],[450,240]]);
    const small=resizeZone(base,'se',{x:90,y:80});
    expect(small.points).toEqual([[100,100],[105,105]]);
  });
  it('preserves polygon shape relative to its bounding box when resized', () => {
    const triangle={...base,kind:'polygon',points:[[100,100],[300,100],[200,200]] as [number,number][]};
    expect(resizeZone(triangle,'se',{x:500,y:300}).points).toEqual([[100,100],[500,100],[300,300]]);
  });
});
