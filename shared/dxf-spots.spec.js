import { describe, expect, it } from 'vitest';
import { spotNamesOf } from './dxf-spots.js';

const dxf = (...entities) => ['0', 'SECTION', '2', 'ENTITIES', ...entities.flat(), '0', 'ENDSEC', '0', 'EOF'].join('\n') + '\n';
const spot = (name, x = '0.0', y = '0.0') => ['0', 'TEXT', '8', 'SPOT', '10', x, '20', y, '40', '5.0', '1', `{spot:${name}}`];
const label = (text) => ['0', 'TEXT', '8', 'NOTES', '10', '1.0', '20', '1.0', '40', '5.0', '1', text];

describe('dxf spot markers (SPEC §24 dialog read)', () => {
  it('reads every spot name from the ENTITIES section in order', () => {
    expect(spotNamesOf(dxf(
      label('SHEET A'),
      spot('frame', '10', '20'),
      spot('logo', '30', '40')
    ))).toEqual(['frame', 'logo']);
  });

  it('ignores ordinary text, geometry, and markers outside ENTITIES', () => {
    const text = [
      '0', 'SECTION', '2', 'HEADER',
      '9', '$EXTMIN', '10', '0.0', '20', '0.0',
      '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      ...label('notes: {spot:not-a-marker}'),
      ...spot('real'),
      '0', 'ENDSEC', '0', 'EOF'
    ].join('\n') + '\n';
    expect(spotNamesOf(text)).toEqual(['real']);
  });

  it('returns empty for payloads without markers or ENTITIES', () => {
    expect(spotNamesOf('0\nEOF\n')).toEqual([]);
    expect(spotNamesOf('')).toEqual([]);
    expect(spotNamesOf(null)).toEqual([]);
  });
});
