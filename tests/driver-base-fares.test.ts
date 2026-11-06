import { describe, expect, it, vi } from 'vitest';

import type { Address } from '../src/domain/models';
import { calculateFareMinor, calculateMultiStopFareMinor, classifyPricingScope, defaultPricingRules } from '../src/domain/pricing';
import { getMultiStopPricedRouteMetrics, type RouteMetrics } from '../server/routing';

const grahovo: Address = {id:'g',label:'с. Грахово',coordinates:{latitude:56.04758,longitude:51.95842}};
const selyanur: Address = {id:'s',label:'д. Селянур',details:'Граховский район',coordinates:{latitude:56.0503949,longitude:51.7220116}};
const porshur: Address = {id:'p',label:'д. Поршур',details:'Граховский район',coordinates:{latitude:56.0263962,longitude:51.7065836}};
const kotlovka: Address = {id:'k',label:'д. Котловка',details:'Граховский район',coordinates:{latitude:56.1180852,longitude:52.0150708}};
const yagiKaksi: Address = {id:'y',label:'д. Яги-Какси',details:'Граховский район',coordinates:{latitude:56.0906036,longitude:51.9506647}};
const elabuga: Address = {id:'e',label:'г. Елабуга',coordinates:{latitude:55.76,longitude:52.05}};
const rules = {...defaultPricingRules,districtPerKilometer07To22Minor:6_000,districtPerKilometer22To02Minor:10_000,districtPerKilometer02To07Minor:15_000};
const distances: Record<string,number> = {'g:s':23327,'s:g':23500,'g:p':25950,'p:g':26050,'s:p':3359,'p:s':3359,'g:k':11709,'k:g':11800,'g:y':4989,'y:g':5100,'g:e':89001,'e:g':90002};
const points = [grahovo,selyanur,porshur,kotlovka,yagiKaksi,elabuga];
function resolver() {
  return vi.fn(async (origin, destination): Promise<RouteMetrics> => {
    const a=points.find(point=>point.coordinates.latitude===origin.latitude)!.id;
    const b=points.find(point=>point.coordinates.latitude===destination.latitude)!.id;
    const distanceMeters=distances[`${a}:${b}`];
    if (distanceMeters===undefined) throw new Error(`Unexpected road ${a}:${b}`);
    return {distanceMeters,durationSeconds:600,source:'osrm',coordinates:[origin,destination]};
  });
}
async function price(pickup:Address,destinations:Address[],time='03:00') {
  const resolve=resolver();
  const route=await getMultiStopPricedRouteMetrics(pickup,destinations,resolve);
  const segments=route.pricingSegments.map(segment=>({...segment,distanceMeters:segment.route.distanceMeters}));
  const amount=calculateMultiStopFareMinor(segments,'economy',false,rules,new Date(`2026-11-03T${time}:00Z`));
  return {amount,route,resolve};
}

describe('fares for a driver based in Grahovo',()=>{
  it('charges Grahovo–Selyanur plus Selyanur–Porshur and resolves each road only once',async()=>{
    const result=await price(selyanur,[porshur]);
    expect(result.amount).toBe(160_000);
    expect(result.route.tripRoute.distanceMeters).toBe(3359);
    expect(result.route.pricingDistanceMeters).toBe(23327+3359);
    expect(result.route.driverApproachRoute?.distanceMeters).toBe(23327);
    expect(result.resolve).toHaveBeenCalledTimes(2);
  });
  it.each([porshur,elabuga])('prices $label–Grahovo exactly like the outward journey despite different road lengths',async remote=>{
    const outward=await price(grahovo,[remote]);
    const inbound=await price(remote,[grahovo]);
    expect(inbound.amount).toBe(outward.amount);
    expect(inbound.route.driverApproachRoute).toBeNull();
    expect(inbound.route.pricingDistanceMeters).toBe(outward.route.pricingDistanceMeters);
    expect(inbound.route.tripRoute.coordinates[0]).toEqual(remote.coordinates);
  });
  it('prices a return with intermediate stops using the same outward itinerary',async()=>{
    const outward=await price(grahovo,[porshur,selyanur]);
    const inbound=await price(selyanur,[porshur,grahovo]);
    expect(outward.amount).toBe(176_000);
    expect(inbound.amount).toBe(outward.amount);
    expect(inbound.route.tripRoute.coordinates[0]).toEqual(selyanur.coordinates);
    expect(inbound.route.segments.at(-1)!.destination).toEqual(grahovo);
  });
  it.each([['03:00',85_000],['18:00',125_000],['22:00',195_000]] as const)('uses the requested Kotlovka fare at %s in either direction',async(time,expected)=>{
    expect((await price(grahovo,[kotlovka],time)).amount).toBe(expected);
    expect((await price(kotlovka,[grahovo],time)).amount).toBe(expected);
  });
  it.each([
    ['02:59',80_000], ['03:00',50_000], ['17:59',50_000],
    ['18:00',60_000], ['20:59',60_000], ['21:00',80_000],
  ] as const)('uses the fixed Yagi-Kaksi fare at %s UTC in either direction',async(time,expected)=>{
    expect((await price(grahovo,[yagiKaksi],time)).amount).toBe(expected);
    expect((await price(yagiKaksi,[grahovo],time)).amount).toBe(expected);
    const elsewhere = {...yagiKaksi,details:undefined,coordinates:elabuga.coordinates};
    expect(classifyPricingScope(grahovo,elsewhere)).toBe('intercity');
    expect(calculateFareMinor(80_000,'economy','intercity',rules,new Date('2026-11-03T03:00:00Z'),[grahovo,elsewhere])).toBe(400_000);
  });
  it('uses the Kotlovka fare for the nearby Baba Yaga residence, including an address without the village name', async () => {
    const residence = {...kotlovka, label:'Резиденция Бабы Яги'};
    const result=await price(grahovo,[residence]);
    expect(result.amount).toBe(85_000);
    const actualResidence = {...residence, details:undefined, coordinates:{latitude:56.1169,longitude:52.012}};
    expect(classifyPricingScope(grahovo,actualResidence)).toBe('district');
    expect(calculateFareMinor(11_400,'economy','district',rules,new Date('2026-11-03T03:00:00Z'),[grahovo,actualResidence])).toBe(85_000);
    const elsewhere = {...actualResidence,coordinates:elabuga.coordinates};
    expect(classifyPricingScope(grahovo,elsewhere)).toBe('intercity');
    expect(calculateFareMinor(80_000,'economy','intercity',rules,new Date('2026-11-03T03:00:00Z'),[grahovo,elsewhere])).toBe(400_000);
  });
});
