// Palette trace (SPEC §20/§8): every authoring palette item walked through
// its real chain — record creation with the palette preset, port resolution
// against a projected registry domain, and lowering to the executable twin.
// This is the executable form of the palette audit: an item whose ports do
// not resolve typed, or whose twin does not exist, fails here instead of on
// the canvas.
import { describe, expect, it } from 'vitest';
import {
  PROCESS_DESIGNER_PALETTE_GROUPS,
  TYPE_AUTHORING_PALETTE_ITEMS,
  declarationNodePorts,
  servicesPaletteGroups,
  typeCatalogPaletteGroups
} from './designer.js';
import { getProcessNodeDefinition, resolveCatalogNodePorts } from './node-catalog.js';
import { createTypeRegistry, projectDomainFromView, resolveCtsRecord, frameworkTypes } from '../../cts/src/index.js';
import { cncTypePack } from '../../cts/src/pack/cnc.js';
import { cncDomain } from '../../domain-cnc/src/index.js';

function projectedDomain() {
  const registry = createTypeRegistry({ id: 'palette-trace' });
  for (const declaration of [...frameworkTypes, ...cncTypePack]) {
    registry.defineType(declaration);
  }
  return projectDomainFromView(registry, 'org-1', cncDomain, {
    packServices: [{
      id: 'nesting.solve',
      species: 'service',
      command: 'solveNestingValue',
      signature: {
        input: { base: 'record', fields: { polygons: { base: 'list', itemType: { base: 'json' } } } },
        output: { base: 'json' }
      },
      render: { label: 'Nesting solver', icon: 'pi pi-compass' }
    }]
  });
}

function recordFor(item) {
  return { id: `trace:${item.id}`, kind: item.kind, ...structuredClone(item.preset || {}) };
}

function assertTypedPorts(item, ports) {
  for (const port of [...ports.inputs, ...ports.outputs]) {
    expect(port.type?.base, `${item.id} port ${port.id} (${port.role})`).toBeTruthy();
    expect(['data', 'control'], `${item.id} port ${port.id} role`).includes(port.role);
  }
}

describe('palette trace', () => {
  const domain = projectedDomain();
  const typeView = domain.entities
    .filter(entity => domain.construction?.[entity.type])
    .map(entity => ({
      id: entity.type,
      class: entity.blocks.includes('specs') ? 'item' : 'file',
      label: entity.type,
      icon: 'pi pi-box',
      description: entity.type,
      constructible: true,
      via: 'genericCreate',
      constructOperators: []
    }));

  // Canvas-surface items (class/field/state/reference) carry no operation
  // kind; every kind-bearing item is traced.
  const operationItems = [
    ...servicesPaletteGroups(domain.serviceContracts || {}).flatMap(group => group.items),
    ...PROCESS_DESIGNER_PALETTE_GROUPS.flatMap(group => group.items),
    ...typeCatalogPaletteGroups(typeView).flatMap(group => group.items)
  ].filter(item => item.kind);

  it('every palette operation item resolves typed ports against the projected domain', () => {
    expect(operationItems.length).toBeGreaterThan(20);
    for (const item of operationItems) {
      const record = recordFor(item);
      const ports = resolveCatalogNodePorts(record, {
        domain,
        fieldSchemas: domain.fieldSchemas[record.typeId] || domain.fieldSchemas.sheet || []
      });
      assertTypedPorts(item, ports);
    }
  });

  it('every palette operation item lowers to a catalog-defined executable twin', () => {
    for (const item of operationItems) {
      const record = recordFor(item);
      const lowered = resolveCtsRecord(record, domain);
      expect(getProcessNodeDefinition(lowered.kind), `${item.id} -> ${lowered.kind}`).not.toBeNull();
    }
  });

  it('pin carriers expose exactly the Type pin while unbound and derived sockets when bound', () => {
    const construct = { id: 't', kind: 'cts.construct', typeId: '', construction: { mode: 'genericCreate' } };
    expect(resolveCatalogNodePorts(construct, { domain }).inputs.map(port => port.id)).toEqual(['type']);
    const bound = resolveCatalogNodePorts(
      { ...construct, typeId: 'sheet', construction: domain.construction.sheet },
      { domain, fieldSchemas: domain.fieldSchemas.sheet }
    );
    expect(bound.inputs.find(port => port.id === 'type')).toBeTruthy();
    expect(bound.inputs.some(port => port.id === 'data.serial')).toBe(true);
    expect(bound.outputs.some(port => port.type?.base === 'entity')).toBe(true);
  });

  it('consumers offer only their entity input while unbound and derive leaves when adapted', () => {
    for (const record of [
      { id: 't', kind: 'cts.mutate', typeId: '' },
      { id: 't', kind: 'cts.transition', typeId: '' },
      { id: 't', kind: 'cts.remove', typeId: '' },
      { id: 't', kind: 'cts.read', select: 'parent', typeId: '' },
      { id: 't', kind: 'cts.read', select: 'children', typeId: '' },
      { id: 't', kind: 'cts.field', typeId: '' }
    ]) {
      const ports = resolveCatalogNodePorts(record, { domain });
      expect(ports.inputs.map(port => port.id), record.kind + ':' + record.select).toEqual(['entity']);
      expect(ports.inputs[0].required).toBe(true);
    }
    const adapted = resolveCatalogNodePorts(
      { id: 't', kind: 'cts.mutate', typeId: 'sheet' },
      { domain, fieldSchemas: domain.fieldSchemas.sheet }
    );
    expect(adapted.inputs.find(port => port.id === 'entity')).toMatchObject({ id: 'entity', type: { typeId: 'sheet' } });
    expect(adapted.inputs.some(port => port.id === 'data.serial')).toBe(true);
  });

  it('origin reads keep the pin; entity-derived reads never carry one', () => {
    for (const select of ['current', 'all']) {
      const ports = resolveCatalogNodePorts({ id: 't', kind: 'cts.read', select, typeId: 'sheet' }, { domain });
      expect(ports.inputs.find(port => port.id === 'type'), select).toBeTruthy();
    }
    for (const select of ['parent', 'children', 'related']) {
      const ports = resolveCatalogNodePorts({ id: 't', kind: 'cts.read', select, typeId: 'sheet' }, { domain });
      expect(ports.inputs.some(port => port.id === 'type'), select).toBe(false);
      expect(ports.inputs.some(port => port.id === 'entity'), select).toBe(true);
    }
  });

  it('declaration items expose typed specs for every handle they render', () => {
    for (const item of TYPE_AUTHORING_PALETTE_ITEMS) {
      if (item.type === 'ctsType') continue; // reference: spec depends on the selected registry entry
      const ports = declarationNodePorts({ type: item.type, data: {} });
      expect(ports, item.id).not.toBeNull();
      for (const spec of [...ports.inputSpecs, ...ports.outputSpecs]) {
        expect(spec.type?.base, `${item.id} spec ${spec.id}`).toBeTruthy();
      }
    }
  });
});
