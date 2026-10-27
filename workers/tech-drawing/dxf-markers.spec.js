import { describe, expect, it } from 'vitest';
import { dxfPairs, spotMarkersOf, addSpotMarker, renameSpotMarker, removeSpotMarker, defaultMarkerHeight, pairsToText } from './dxf-markers.js';
import { composeDxfPlacement } from './placement.js';

const line = (x1, y1, x2, y2, layer = 'OUTLINE') => (
  ['0', 'LINE', '8', layer, '10', String(x1), '20', String(y1), '11', String(x2), '21', String(y2)]
);
const spot = (name, x, y, height = '5.0', layer = 'SPOT') => (
  ['0', 'TEXT', '8', layer, '10', String(x), '20', String(y), '30', '0.0', '40', height, '1', `{spot:${name}}`]
);
const dxf = (...entities) => ['0', 'SECTION', '2', 'ENTITIES', ...entities.flat(), '0', 'ENDSEC', '0', 'EOF'].join('\n') + '\n';

describe('dxf-markers (SPEC §24 spot vocabulary)', () => {
  it('reads markers with position, height, and layer', () => {
    const markers = spotMarkersOf(dxf(line(0, 0, 10, 10), spot('frame', 100, 200, '4.0', 'ANCHORS'), spot('logo', 10, 20)));
    expect(markers).toEqual([
      { name: 'frame', x: 100, y: 200, height: 4, layer: 'ANCHORS', record: expect.anything() },
      { name: 'logo', x: 10, y: 20, height: 5, layer: 'SPOT', record: expect.anything() }
    ]);
  });

  it('adds a marker that places through the engine and refuses duplicates and brace names', () => {
    const template = dxf(line(0, 0, 10, 10), spot('frame', 100, 200, '4.0'));
    const authored = addSpotMarker(template, { name: 'logo', x: 10, y: 20, height: 4 });
    expect(spotMarkersOf(authored).map(marker => marker.name)).toEqual(['frame', 'logo']);
    expect(authored).toContain('1\n{spot:logo}');
    // The authored template still places: markers die at composition.
    const { dxf: composed } = composeDxfPlacement(authored, [
      { name: 'frame', text: dxf(line(0, 0, 1, 1)) },
      { name: 'logo', text: dxf(line(0, 0, 1, 1)) }
    ]);
    expect(composed).not.toContain('{spot:');

    expect(() => addSpotMarker(template, { name: 'frame', x: 1, y: 1 })).toThrow(/already exists/);
    expect(() => addSpotMarker(template, { name: 'a}b', x: 1, y: 1 })).toThrow(/not a valid anchor name/);
  });

  it('renames and remove markers in place, keeping the rest verbatim', () => {
    const template = dxf(line(0, 0, 10, 10), spot('frame', 100, 200), spot('logo', 10, 20));
    const renamed = renameSpotMarker(template, 'logo', 'brand');
    expect(spotMarkersOf(renamed).map(marker => marker.name)).toEqual(['frame', 'brand']);
    expect(renamed).toContain('0\nLINE');
    const removed = removeSpotMarker(renamed, 'frame');
    expect(spotMarkersOf(removed).map(marker => marker.name)).toEqual(['brand']);
    expect(() => renameSpotMarker(template, 'ghost', 'x')).toThrow(/ghost not found/);
    expect(() => removeSpotMarker(template, 'ghost')).toThrow(/ghost not found/);
  });

  it('derives the default height from an existing marker, then the header extents', () => {
    expect(defaultMarkerHeight(dxf(spot('a', 0, 0, '3.5')))).toBe(3.5);
    const header = [
      '0', 'SECTION', '2', 'HEADER',
      '9', '$EXTMIN', '10', '0.0', '20', '0.0',
      '9', '$EXTMAX', '10', '400.0', '20', '300.0',
      '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES', '0', 'ENDSEC', '0', 'EOF'
    ].join('\n') + '\n';
    expect(defaultMarkerHeight(header)).toBe(8);
    expect(defaultMarkerHeight(dxf(line(0, 0, 1, 1)))).toBe(5);
  });

  it('round-trips the pair model through pairsToText', () => {
    const text = dxf(line(0, 0, 10, 10));
    expect(pairsToText(JSON.parse(JSON.stringify(dxfPairs(text))))).toBe(text);
  });
});
