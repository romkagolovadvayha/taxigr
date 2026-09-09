import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';

import {
  buildNativeMapHtml,
  serializeNativeMapState,
} from '../src/components/map/native-map-html';

describe('native map route overlays', () => {
  it('opens the selected street at zoom 19 and preserves the camera while choosing a house', async () => {
    const street = { latitude: 56.115589, longitude: 52.125607 };
    const updates: Record<string, unknown>[] = [];
    const initial: Record<string, unknown>[] = [];
    const listeners: Record<string, (event: { data: string }) => void> = {};
    const element = () => ({
      style: {}, dataset: {}, clientWidth: 390, clientHeight: 360,
      appendChild() {}, setAttribute() {}, classList: { toggle() {} },
    });
    class MapStub {
      constructor(_element: unknown, props: Record<string, unknown>) { initial.push(props); }
      addChild() {}
      removeChild() {}
      update(props: Record<string, unknown>) { updates.push(props); }
    }
    const script = [...buildNativeMapHtml('test-key', 'light', street)
      .matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
      .map((match) => match[1]!.trim()).find(Boolean)!;
    runInNewContext(script, {
      document: { documentElement: element(), body: element(), getElementById: element, createElement: element, addEventListener() {} },
      window: { matchMedia: () => ({ matches: true }), addEventListener: (name: string, callback: typeof listeners[string]) => { listeners[name] = callback; } },
      ymaps3: {
        ready: Promise.resolve(), YMap: MapStub, YMapDefaultSchemeLayer: class {},
        YMapDefaultFeaturesLayer: class {}, YMapListener: class {}, YMapMarker: class {}, YMapFeature: class {},
      },
      ReactNativeWebView: { postMessage() {} },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(initial[0]).toMatchObject({
      location: { center: [52.125607, 56.115589], zoom: 19 },
      zoomRange: { min: 6, max: 19 },
    });
    const send = (state: object) => listeners.message!({ data: JSON.stringify(state) });
    send({ selectionCenter: street, coordinateSelectionEnabled: true });
    const movements = () => updates.filter((update) => update.location);
    expect(movements()).toHaveLength(1);
    // A tap adds a marker, without undoing the passenger's pan/zoom.
    send({ selectionCenter: { ...street }, coordinateSelectionEnabled: true,
      pickup: { id: 'house', label: 'Дом', coordinates: { latitude: 56.1158, longitude: 52.1258 } } });
    expect(movements()).toHaveLength(1);
    send({ selectionCenter: { latitude: 56.05, longitude: 51.96 }, coordinateSelectionEnabled: true });
    expect(movements().at(-1)).toMatchObject({ location: { center: [51.96, 56.05], zoom: 19 } });
    send({});
    expect(updates).toContainEqual({ zoomRange: { min: 6, max: 17 } });
  });

  it('contains compact zoom-aware points and arrival callouts', () => {
    const html = buildNativeMapHtml('test-key');

    expect(html).toContain('.route-dot');
    expect(html).toContain('close-route-zoom');
    expect(html).toContain('destinationArrivalLabel');
    expect(html).not.toContain("el.textContent='А'");
    expect(html).not.toContain("el.textContent='Б'");
  });

  it('anchors both markers to the rendered route endpoints', () => {
    const html = buildNativeMapHtml('test-key');

    expect(html).toContain('pickupMarkerCoordinates=routeCoordinates');
    expect(html).toContain('routeCoordinates[0]');
    expect(html).toContain('destinationMarkerCoordinates=routeCoordinates');
    expect(html).toContain('routeCoordinates[routeCoordinates.length-1]');
  });

  it('renders numbered intermediate destination markers and serializes their order', () => {
    const html = buildNativeMapHtml('test-key');
    const destinations = [
      {
        id: 'first',
        label: 'Первая остановка',
        coordinates: { latitude: 56.04, longitude: 51.95 },
      },
      {
        id: 'final',
        label: 'Финиш',
        coordinates: { latitude: 56.05, longitude: 51.96 },
      },
    ];

    expect(html).toContain('destinations.forEach((destination,index)');
    expect(html).toContain("isFinal?'destination':'stop'");
    expect(html).toContain("destinations.length>1?(index+1)+' · Финиш':'Финиш'");
    expect(html).toContain("?'Старт · '+Math.round(state.pickupEtaMinutes)+' мин'");
    expect(JSON.parse(serializeNativeMapState({ destinations })).destinations).toEqual(
      destinations,
    );
  });

  it('uses the shared transparent PNG car for the driver', () => {
    const html = buildNativeMapHtml('test-key');

    expect(html).toContain("if(kind==='driver'){");
    expect(html).toContain('el.innerHTML=');
    expect(html).toContain('data:image/png;base64,iVBORw0KGgo');
    expect(html).toContain('.marker.driver{width:28px;height:40px;border:0');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain("el.textContent='🚕'");
  });

  it('supports live driver navigation and a route ending at pickup', () => {
    const html = buildNativeMapHtml('test-key');

    expect(html).toContain("state.routeTarget==='pickup'");
    expect(html).toContain('state.followZoom');
    expect(html).toContain('state.driverHeading*Math.PI/180');
    expect(html).toContain('if(!state.followDriver)');
  });

  it('keeps the embedded map script syntactically valid', () => {
    const html = buildNativeMapHtml('test-key');
    const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
      .map((match) => match[1]?.trim())
      .filter((script): script is string => Boolean(script));

    expect(inlineScripts).toHaveLength(1);
    expect(() => new Function(inlineScripts[0]!)).not.toThrow();
  });

  it('changes theme without recreating the map or moving a manually positioned camera', async () => {
    const updates: Record<string, unknown>[] = [];
    let mapCount = 0;
    const listeners: Record<string, (event: { data: string }) => void> = {};
    const element = () => ({
      style: {}, dataset: {}, clientWidth: 390, clientHeight: 844,
      appendChild() {}, setAttribute() {}, classList: { toggle() {} },
    });
    const root = element();
    class MapStub {
      constructor() { mapCount += 1; }
      addChild() {}
      removeChild() {}
      update(props: Record<string, unknown>) { updates.push(props); }
    }
    const html = buildNativeMapHtml('test-key');
    const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
      .map((match) => match[1]!.trim()).find(Boolean)!;
    runInNewContext(script, {
      document: { documentElement: root, body: element(), getElementById: element, createElement: element, addEventListener() {} },
      window: { matchMedia: () => ({ matches: true }), addEventListener: (name: string, callback: typeof listeners[string]) => { listeners[name] = callback; } },
      ymaps3: {
        ready: Promise.resolve(), YMap: MapStub, YMapDefaultSchemeLayer: class {},
        YMapDefaultFeaturesLayer: class {}, YMapListener: class {}, YMapMarker: class {}, YMapFeature: class {},
      },
      ReactNativeWebView: { postMessage() {} },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const routeCoordinates = [{ latitude: 56.0477, longitude: 51.9586 }, { latitude: 56.04576, longitude: 51.96165 }];
    const send = (colorScheme: 'light' | 'dark', route = routeCoordinates) => listeners.message!({ data: JSON.stringify({ colorScheme, routeCoordinates: route }) });
    send('light');
    expect(updates.filter((update) => update.location)).toHaveLength(1);
    send('dark');
    expect(mapCount).toBe(1);
    expect(updates.filter((update) => update.location)).toHaveLength(1);
    expect(updates.some((update) => update.theme === 'dark')).toBe(true);
    // A genuinely different route must still fit the viewport.
    send('dark', [routeCoordinates[0]!, { latitude: 56.1, longitude: 51.99 }]);
    expect(updates.filter((update) => update.location)).toHaveLength(2);
  });
});
