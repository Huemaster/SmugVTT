import {describe, it, expect} from 'vitest';
import type {Drawing} from '@/types/drawings';
import type {Token} from '@/types';
import {zoneContains, zonesAt, effectsAt, effectsForToken, tokensWithinZone} from '../zoneMechanics';
const shape=(zoneType:string, kind:'rect'|'ellipse'|'polygon'='rect', points:Array<[number,number]>=[[100,100],[200,200]]):Drawing=>({
  id:zoneType, authorId:'gm', audience:'ALL',layer:'MARKUP', kind, zoneType, fillOpacity:30,
  color:'#e7ad42',fillColor:'#e7ad42',width:3,rotation:0,sortKey:0,points,text:null,createdAt:'2026-01-01',
});
const token=(x:number,y:number):Token=>({id:'test',name:'Example',characterId:null,position:{x,y},size:{width:1,height:1},visible:true} as Token);
describe('saved drawing battlefield geometry',()=>{
  it('tests rectangle, ellipse and polygon, including edges',()=>{
    expect(zoneContains(shape('light-cover'),{x:100,y:100})).toBe(true);
    expect(zoneContains(shape('light-cover'),{x:99,y:100})).toBe(false);
    expect(zoneContains(shape('smoke','ellipse'),{x:151,y:151})).toBe(true);
    expect(zoneContains(shape('smoke','ellipse'),{x:100,y:100})).toBe(false);
    const triangle=shape('high-ground','polygon',[[100,100],[200,100],[150,200]]);
    expect(zoneContains(triangle,{x:150,y:140})).toBe(true);
    expect(zoneContains(triangle,{x:190,y:180})).toBe(false);
  });
  it('uses strongest cover, coexists with smoke and does not persist a status',()=>{
    const drawings=[shape('light-cover'),shape('heavy-cover'),shape('smoke')];
    const before=JSON.stringify(drawings);
    const effects=effectsAt(drawings,{x:150,y:150});
    expect(effects.cover).toBe(2);expect(effects.obscured).toBe(true);
    expect(effects.zoneIds).toEqual(['light-cover','heavy-cover','smoke']);
    expect(JSON.stringify(drawings)).toBe(before);
    expect(effectsAt(drawings,{x:250,y:250}).cover).toBe(0);
  });
  it('converts bottom-origin token grid positions to top-origin map pixels',()=>{
    // 10x10 grid, 50px cells: bottom-row token centre y=475.
    const lower=shape('healing','rect',[[0,450],[100,500]]);
    expect(effectsForToken([lower],token(0,0),50,10).inHealing).toBe(true);
    expect(effectsForToken([lower],token(0,9),50,10).inHealing).toBe(false);
    expect(tokensWithinZone(lower,[token(0,0),token(0,9)],50,10)).toHaveLength(1);
  });
  it('filters zones by visible geometry; hidden/GM audience must be filtered by caller',()=>{
    const a=shape('healing');
    expect(zonesAt([a],{x:120,y:120})).toHaveLength(1);
    expect(zonesAt([a],{x:300,y:300})).toHaveLength(0);
  });
});
