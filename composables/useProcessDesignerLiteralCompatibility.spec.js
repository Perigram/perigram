// Literal <-> construct/mutate wiring contract: through the REAL sync
// pipeline (the placement-flow composables over a projected registry), every
// authored literal base wires into every same-shaped field socket of a bound
// construct, quantity fields keep their units (unit-less numbers adopt them;
// unit -> different-unit stays explicit), and ref fields typecheck against
// the declared target. This is the guard for the defect class where the
// species surface and the value algebra drift apart at the socket boundary.
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { createTypeRegistry, projectDomainFromView } from '~/packages/cts/src/index.js';
import { resolveCatalogNodePorts, processSocketsCompatible } from '~/packages/processes/src/index.js';
import { processType } from '~/packages/processes/src/types.js';
import { useProcessDesignerNodeRecords } from '~/composables/useProcessDesignerNodeRecords.js';
import { useProcessDesignerNodeSync } from '~/composables/useProcessDesignerNodeSync.js';
import { createPaletteText } from '~/utils/processDesignerPaletteText.js';

const registry = createTypeRegistry({ id: 'literal-matrix' });
registry.defineType({ id: 'keeper', class: 'party', fields: {}, render: { label: 'Keeper' } });
registry.defineType({
  id: 'widget',
  class: 'item',
  fields: {
    name: { base: 'string' },
    thicknessMm: { base: 'quantity', unit: 'mm' },
    count: { base: 'number' },
    owner: { base: 'ref', accepts: ['keeper'] },
    madeAt: { base: 'instant' },
    flag: { base: 'boolean' }
  },
  render: { label: 'Widget' }
});
const domain = projectDomainFromView(registry, 'org-1', { entities: [], relations: [], commands: {} });

const t = key => key;
const te = () => false;
const { paletteLabel, paletteDescription } = createPaletteText({ t, te });
const edges = ref([]);
const draft = ref(null);
let syncImpl = () => {};
const designerFacade = new Proxy({}, { get: (target, prop) => {
  if (prop === 'construction') return typeId => domain.construction?.[typeId] || null;
  if (prop === 'createModes') return () => ['genericCreate'];
  if (prop === 'fieldsForEntity') return typeId => (registry.listTypes().find(entry => entry.id === typeId)?.fields ? [] : []);
  if (prop === 'blocksForEntity') return () => [];
  if (prop === 'blocks') return [];
  if (prop === 'domain') return domain;
  return () => ({});
} });
const nodeRecords = useProcessDesignerNodeRecords({ designer: designerFacade, translate: t, syncProcessNode: node => syncImpl(node) });
const sync = useProcessDesignerNodeSync({
  designer: designerFacade, t, te, draft, edges, nodeRecords,
  projectedDomain: () => domain,
  paletteLabel, paletteDescription
});
syncImpl = sync.syncProcessNode;

function constructPorts() {
  draft.value = { data: { processNodes: {}, producerOutputs: {} } };
  const record = nodeRecords.createProcessNode('c1', 'cts.construct');
  record.typeId = 'widget';
  record.via = 'genericCreate';
  sync.syncProcessNode(record);
  return resolveCatalogNodePorts(record, { domain, fieldSchemas: [] }).inputs;
}

function literalOutput(base, qualifiers = {}) {
  const record = {
    id: `l_${base}`,
    kind: 'source.literalItem',
    // entityRef literals carry the authored entity type on the record; the
    // sync derives the socket qualifier from it.
    ...(qualifiers.entityType ? { entityType: qualifiers.entityType } : {}),
    type: processType(base, qualifiers),
    value: ''
  };
  sync.syncProcessNode(record);
  return resolveCatalogNodePorts(record, { domain, fieldSchemas: [] }).outputs[0];
}

const input = (ports, id) => ports.find(port => port.id === id);

describe('literal -> construct field sockets', () => {
  const ports = constructPorts();

  it('a bound construct exposes the declared row fields as typed sockets', () => {
    const ids = ports.map(port => port.id);
    for (const id of ['name', 'data.name', 'specs.thicknessMm', 'data.count', 'data.owner', 'data.madeAt', 'data.flag', 'status.state.primary']) {
      expect(ids, `missing socket ${id}`).toContain(id);
    }
    expect(input(ports, 'specs.thicknessMm').type).toMatchObject({ base: 'number', unit: 'mm' });
  });

  it('same-base literals wire into their field sockets', () => {
    expect(processSocketsCompatible(literalOutput('string'), input(ports, 'name')).ok).toBe(true);
    expect(processSocketsCompatible(literalOutput('string'), input(ports, 'data.name')).ok).toBe(true);
    expect(processSocketsCompatible(literalOutput('number'), input(ports, 'data.count')).ok).toBe(true);
    expect(processSocketsCompatible(literalOutput('boolean'), input(ports, 'data.flag')).ok).toBe(true);
    expect(processSocketsCompatible(literalOutput('date'), input(ports, 'data.madeAt')).ok).toBe(true);
    expect(processSocketsCompatible(literalOutput('dateTime'), input(ports, 'data.madeAt')).ok).toBe(true);
    expect(processSocketsCompatible(literalOutput('entityRef', { entityType: 'keeper' }), input(ports, 'data.owner')).ok).toBe(true);
  });

  it('a unit-less number adopts the quantity field unit; cross-unit stays explicit', () => {
    const quantity = input(ports, 'specs.thicknessMm');
    const raw = processSocketsCompatible(literalOutput('number'), quantity);
    expect(raw.ok).toBe(true);
    expect(raw.coercion).toBe('adoptsUnit');
    const meters = processSocketsCompatible({ ...literalOutput('number'), type: processType('number', { unit: 'm' }) }, quantity);
    expect(meters.ok).toBe(false);
  });

  it('mismatched bases stay rejected with a named reason', () => {
    const result = processSocketsCompatible(literalOutput('string'), input(ports, 'data.count'));
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(processSocketsCompatible(literalOutput('number'), input(ports, 'data.owner')).ok).toBe(false);
  });

  it('refs typecheck against the declared target type', () => {
    expect(processSocketsCompatible(literalOutput('entityRef', { entityType: 'widget' }), input(ports, 'data.owner')).ok).toBe(false);
  });
});
