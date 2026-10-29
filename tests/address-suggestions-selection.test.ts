import {describe, expect, it} from 'vitest';
import {grahovoAddressCatalog} from '../src/data/grahovo-address-catalog';
import {intercitySettlements} from '../src/data/intercity-settlements';
import {mergeAddressSuggestions, selectUnambiguousAddress} from '../src/domain/address-suggestions-selection';
import type {Address} from '../src/domain/models';

const house = grahovoAddressCatalog.find(a => a.label === 'с. Грахово, ул. Ачинцева, 5')!;
describe('address search submission', () => {
  it('chooses a mapped house despite a duplicate street-centre geocoder result', () => {
    expect(house).toBeDefined();
    const approximate: Address = {...house,id:'remote-duplicate',coordinatePrecision:'approximate',coordinates:{latitude:56.05,longitude:51.96}};
    expect(mergeAddressSuggestions([approximate],[house])).toEqual([house]);
    expect(selectUnambiguousAddress('ачинцева 5',[approximate,house],true)).toEqual(house);
  });
  it('keeps an organisation separately but an explicit house request chooses its known house', () => {
    const office: Address = {...house,id:'office',placeId:'office',label:'МФЦ Граховского района, '+house.label,coordinates:{latitude:56.048,longitude:51.958}};
    expect(mergeAddressSuggestions([house],[office])).toHaveLength(2);
    expect(selectUnambiguousAddress('ачинцева 5',[office,house],true)).toEqual(house);
  });
  it('accepts the city as a destination without choosing an arbitrary street', () => {
    const city = intercitySettlements.find(a=>a.label==='г. Можга')!;
    expect(selectUnambiguousAddress('в можгу',intercitySettlements,false)).toEqual(city);
    expect(selectUnambiguousAddress('в можгу',intercitySettlements,true)).toBeNull();
  });
  it('requires a choice for the same house number in different villages', () => {
    const a: Address = {...house,label:'д. Бемыж, ул. Советская, 12',houseNumber:'12'};
    const b: Address = {...a,id:'second-village',label:'д. Котловка, ул. Советская, 12',coordinates:{latitude:56.2,longitude:52}};
    expect(mergeAddressSuggestions([a],[b])).toHaveLength(2);
    expect(selectUnambiguousAddress('советская 12',[a,b],true)).toBeNull();
  });
  it('does not silently accept an unmapped house or a different house number', () => {
    expect(selectUnambiguousAddress('ачинцева 5',[{...house,coordinatePrecision:'approximate'}],true)).toBeNull();
    expect(selectUnambiguousAddress('ачинцева 55',[house],true)).toBeNull();
  });
});
