import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PEN_BY_OCCS_LAYER_CODE,
  loadOccsLayerStandardSeeds,
  parameterNames,
  penTemplateDtoId,
  toLayerStandardSeed
} from './occs-layer-standards.js';

describe('OCCS layer standard seed mapper', () => {
  it('extracts parameter names from registry parameter objects', () => {
    expect(parameterNames({
      cutType: 'through',
      toolOffset: { mode: 'outside', value: 'toolOffset' }
    })).toEqual(['cutType', 'toolOffset']);
  });

  it('maps OCCS layer metadata into v24 layer standard seed data', () => {
    const seed = toLayerStandardSeed({
      id: 'fold.route',
      group: 'fold',
      kind: 'production',
      purpose: 'fold_routing',
      production: true,
      allowedGeometry: ['path'],
      aliases: ['3_1_Фрезеровка_90'],
      defaultExport: {
        dxfLayer: '3_1_Фрезеровка_90',
        svgClass: 'occs-fold-route'
      },
      parameters: {
        routeType: 'v_groove'
      },
      description: 'Fold route'
    }, {
      occsLayerRegistry: '0.1',
      id: 'occs-default-layers-ru'
    });

    expect(seed.code).toBe('fold.route');
    expect(seed.category).toBe('FOLD');
    expect(seed.defaultPen).toBe('OCCS Fold Amber Dashed 0.35mm');
    expect(seed.i18n.ru.nameTemplate).toBe('3_1_Фрезеровка_90');
    expect(seed.parameters).toEqual(['routeType']);
    expect(seed.source).toEqual({
      registry: '0.1',
      registryId: 'occs-default-layers-ru'
    });
  });

  it('assigns distinctive default pens to canonical OCCS production layers', () => {
    expect(DEFAULT_PEN_BY_OCCS_LAYER_CODE['cut.outer']).toBe('OCCS Cut Red 0.6mm');
    expect(DEFAULT_PEN_BY_OCCS_LAYER_CODE['dimension.cassette']).toBe('OCCS Dimension Violet Dotted 0.25mm');
    expect(toLayerStandardSeed({ id: 'cut.outer', group: 'cut' }).defaultPen).toBe('OCCS Cut Red 0.6mm');
    expect(toLayerStandardSeed({ id: 'dimension.cassette', group: 'dimension' }).defaultPen)
      .toBe('OCCS Dimension Violet Dotted 0.25mm');
  });

  it('resolves layer default pens to frontend pen DTO ids instead of raw Mongo ids', () => {
    expect(penTemplateDtoId({
      _id: '64f000000000000000000001',
      identity: { uid: 'OCCS Cut Red 0.6mm', name: 'OCCS Cut Red 0.6mm' }
    })).toBe('OCCS Cut Red 0.6mm');
  });

  it('loads canonical layer codes from docs/specs/Cassette spec/layers.json', async () => {
    const seeds = await loadOccsLayerStandardSeeds();
    const codes = seeds.map(seed => seed.code);

    expect(codes).toContain('contour.flat_pattern.face_and_returns');
    expect(codes).toContain('fold.route');
    expect(seeds.find(seed => seed.code === 'fold.route')?.source.registry).toBe('0.1');
  });
});
