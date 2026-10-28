import { describe, expect, it } from 'vitest';
import { composeDxfPlacement } from './placement.js';
import { services } from './services.js';

const b64 = value => Buffer.from(value, 'utf8').toString('base64');
const pairText = pairs => pairs.map(([code, value]) => `${code}\n${value}`).join('\n') + '\n';

const dxf = body => pairText([
  ['0', 'SECTION'], ['2', 'ENTITIES'], ...body, ['0', 'ENDSEC'], ['0', 'EOF']
]);

const spot = (name, x, y, handle) => ([
  ['0', 'TEXT'], ['5', handle], ['8', 'SLOTS'], ['10', x], ['20', y], ['40', '5'], ['1', `{spot:${name}}`]
]);

const line = (x1, y1, x2, y2, handle) => ([
  ['0', 'LINE'], ['5', handle], ['8', 'PARTS'], ['10', x1], ['20', y1], ['11', x2], ['21', y2]
]);

const TEMPLATE = dxf([
  ...spot('frame', 100, 200, 'A1'),
  ...spot('logo', 300, 400, 'A2'),
  ...line(0, 0, 10, 10, 'A3')
]);

const FRAME_PART = dxf(line(10, 10, 110, 10, 'B1'));
const LOGO_PART = dxf(line(50, 50, 90, 90, 'B2'));

function linesOf(text) {
  const lines = text.split('\n');
  const records = [];
  for (let index = 0; index < lines.length - 1; index += 2) {
    if (lines[index].trim() === '0') records.push({ type: lines[index + 1].trim(), pairs: [] });
    else if (records.length) records[records.length - 1].pairs.push([Number(lines[index]), lines[index + 1]]);
  }
  return records;
}

describe('composeDxfPlacement', () => {
  it('places each part at its spot anchor, translating to the part extents minimum', () => {
    const { dxf } = composeDxfPlacement(TEMPLATE, [
      { name: 'frame', text: FRAME_PART },
      { name: 'logo', text: LOGO_PART }
    ]);
    const records = linesOf(dxf);
    expect(dxf).not.toContain('{spot:');
    // Template line preserved verbatim.
    expect(records.filter(entry => entry.type === 'LINE').length).toBe(3);
    // Frame part min x/y (10,10) translated to anchor (100,200): (100,200) -> (200,200).
    const frameLine = records.filter(entry => entry.type === 'LINE').find(entry => entry.pairs.some(([, value]) => value === '200'));
    expect(frameLine.pairs).toEqual(expect.arrayContaining([[10, '100'], [20, '200'], [11, '200'], [21, '200']]));
    // Logo part min (50,50) to anchor (300,400): (300,400) -> (340,440).
    const logoLine = records.filter(entry => entry.type === 'LINE').find(entry => entry.pairs.some(([, value]) => value === '400'));
    expect(logoLine.pairs).toEqual(expect.arrayContaining([[10, '300'], [20, '400']]));
  });

  it('places explicitly assigned parts regardless of their names', () => {
    const { dxf } = composeDxfPlacement(TEMPLATE, [
      { name: 'whatever', spot: 'frame', text: FRAME_PART },
      { name: 'other-name', spot: 'logo', text: LOGO_PART }
    ]);
    const records = linesOf(dxf);
    expect(dxf).not.toContain('{spot:');
    expect(records.filter(entry => entry.type === 'LINE').length).toBe(3);
  });

  it('mixes explicit assignments with name matches', () => {
    const { dxf } = composeDxfPlacement(TEMPLATE, [
      { name: 'frame', text: FRAME_PART },
      { name: 'unrelated', spot: 'logo', text: LOGO_PART }
    ]);
    expect(dxf).not.toContain('{spot:');
  });

  it('refuses a part assigned to a spot the template does not carry, a double assignment, and a name collision', () => {
    const ghost = composeDxfPlacement(TEMPLATE, [
      { name: 'frame', spot: 'no-such-spot', text: FRAME_PART }
    ]);
    expect(ghost.failures).toEqual([
      { name: 'no-such-spot', message: 'part frame is assigned to spot no-such-spot, which the template does not carry' },
      { name: 'frame', message: 'spot frame has no matching part' },
      { name: 'logo', message: 'spot logo has no matching part' }
    ]);
    const doubled = composeDxfPlacement(TEMPLATE, [
      { name: 'a', spot: 'logo', text: FRAME_PART },
      { name: 'b', spot: 'logo', text: LOGO_PART }
    ]);
    expect(doubled.failures).toContainEqual({ name: 'logo', message: 'spot logo is assigned more than one part' });
    const collided = composeDxfPlacement(TEMPLATE, [
      { name: 'x', spot: 'logo', text: FRAME_PART },
      { name: 'logo', text: LOGO_PART }
    ]);
    expect(collided.failures).toContainEqual({ name: 'logo', message: 'part logo has no free spot (its name is already claimed)' });
  });

  it('refuses spots without a part and parts without a spot, naming both', () => {
    const missing = composeDxfPlacement(TEMPLATE, [{ name: 'frame', text: FRAME_PART }]);
    expect(missing.failures).toEqual([{ name: 'logo', message: 'spot logo has no matching part' }]);
    const spare = composeDxfPlacement(TEMPLATE, [
      { name: 'frame', text: FRAME_PART }, { name: 'logo', text: LOGO_PART }, { name: 'spare', text: FRAME_PART }
    ]);
    expect(spare.failures).toEqual([{ name: 'spare', message: 'part spare has no matching spot' }]);
  });

  it('refuses a template without spot markers and one without an ENTITIES section', () => {
    expect(() => composeDxfPlacement(dxf(line(0, 0, 1, 1, 'A1')), [{ name: 'x', text: FRAME_PART }]))
      .toThrow(/no \{spot:name\} markers/);
    expect(() => composeDxfPlacement('0\nEOF\n', [{ name: 'x', text: FRAME_PART }]))
      .toThrow(/no ENTITIES section/);
  });

  it('rounds translated coordinates to six decimals', () => {
    const part = dxf(line('1', '0', '2', '1', 'B1'));
    const { dxf: composed } = composeDxfPlacement(dxf(spot('x', '2.0000005', '0', 'A1')), [{ name: 'x', text: part }]);
    expect(composed).toContain('2.000001');
  });
});

describe('place-dxf service', () => {
  it('returns the composed DXF as the construction payload', async () => {
    const output = await services['place-dxf']({
      refs: {
        template: { name: 'sheet.dxf', payloadBase64: b64(TEMPLATE) },
        parts: [
          { name: 'frame', payloadBase64: b64(FRAME_PART) },
          { name: 'logo', payloadBase64: b64(LOGO_PART) }
        ]
      },
      draft: { name: 'Site plan' }
    });
    expect(output.payload.mime).toBe('application/dxf');
    expect(output.payload.name).toBe('Site plan.dxf');
    const composed = Buffer.from(output.payload.base64, 'base64').toString('utf8');
    expect(composed).not.toContain('{spot:');
    expect(linesOf(composed).filter(entry => entry.type === 'LINE').length).toBe(3);
  });

  it('answers an offender-named refusal as the structured failures body', async () => {
    const output = await services['place-dxf']({
      refs: {
        template: { payloadBase64: b64(TEMPLATE) },
        parts: [{ name: 'frame', payloadBase64: b64(FRAME_PART) }]
      }
    });
    expect(output).toEqual({ failures: [{ name: 'logo', message: 'spot logo has no matching part' }] });
  });

  it('refuses empty parts and missing payloads', async () => {
    await expect(services['place-dxf']({ refs: { template: { payloadBase64: b64(TEMPLATE) } } }))
      .rejects.toThrow(/requires parts/);
    await expect(services['place-dxf']({
      refs: { template: { payloadBase64: b64(TEMPLATE) }, parts: [{ name: 'frame' }] }
    })).rejects.toThrow(/every part to carry a payload/);
  });
});
