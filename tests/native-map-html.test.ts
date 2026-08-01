import { describe, expect, it } from 'vitest';

import { buildNativeMapHtml } from '../src/components/map/native-map-html';

describe('native map route overlays', () => {
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

  it('uses the shared transparent car silhouette for the driver', () => {
    const html = buildNativeMapHtml('test-key');

    expect(html).toContain("if(kind==='driver'){");
    expect(html).toContain('el.innerHTML=');
    expect(html).toContain('.marker.driver{width:28px;height:40px;border:0');
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
});
