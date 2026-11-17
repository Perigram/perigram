// Effect-record access contract: `access` on an effect/cts record is the
// grant object ({ level, grants }), never the Item/List/Tree socket-access
// string. Regression for the sync pass writing the string first and
// spreading it into `{ "0": "i", … }` junk keys through
// normalizeDesignerAccess — junk that then persisted with every draft.
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useProcessDesignerNodeRecords } from '~/composables/useProcessDesignerNodeRecords.js';
import { useProcessDesignerNodeSync } from '~/composables/useProcessDesignerNodeSync.js';
import { useProcessDesignerTypes } from '~/composables/useProcessDesignerTypes.js';
import { createPaletteText } from '~/utils/processDesignerPaletteText.js';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '#packages/cts';
import { cncTypePack } from '@perigram/cts/pack/cnc';
import { facadeDomain, facadePackContent } from '../test-tools/facade-plugin.js';

const registry = createTypeRegistry({ id: 'node-sync-spec' });
for (const declaration of [...frameworkTypes, ...cncTypePack]) registry.defineType(declaration);
const domain = projectDomainFromView(registry, 'org-1', facadeDomain, { packServices: facadePackContent.services });

const t = key => key;
const te = () => false;
const { paletteLabel, paletteDescription } = createPaletteText({ t, te });
const nodes = ref([]);
const edges = ref([]);
const draft = ref(null);
const toast = { add: () => {} };

const { designer, loadOrgTypes } = useProcessDesignerTypes({
  nodes, edges, t, toast,
  activeOrganizationId: () => 'org-1',
  baseDomain: facadeDomain,
  packContent: facadePackContent,
  syncNow: () => {}
});

let syncImpl = () => {};
const nodeRecords = useProcessDesignerNodeRecords({
  designer,
  translate: key => key,
  syncProcessNode: node => syncImpl(node)
});
const sync = useProcessDesignerNodeSync({
  designer, t, te, draft, edges, nodeRecords,
  projectedDomain: () => domain,
  paletteLabel, paletteDescription
});
syncImpl = sync.syncProcessNode;

function freshDraft() {
  draft.value = { data: { processNodes: {}, producerOutputs: {} } };
}

describe('socket connection projection', () => {
  it('exposes each input base type in the inspector projection', () => {
    freshDraft();
    const required = nodeRecords.createProcessNode('required', 'value.required');
    const [input] = sync.processNodeInputs(required);

    expect(input).toMatchObject({
      id: 'value',
      base: 'json',
      type: { base: 'json' }
    });
  });

  it('projects connected output socket ids for the canvas manifest', () => {
    freshDraft();
    const previousEdges = edges.value;
    const source = nodeRecords.createProcessNode('source', 'source.literalItem');
    const output = sync.processNodeOutputs(source)[0];
    edges.value = [{ source: 'source-node', sourceHandle: 'output' }];

    expect(sync.connectedProcessOutputIds({ id: 'source-node' }, source)).toEqual([output.id]);
    edges.value = previousEdges;
  });
});

describe('effect record access stays a grant object', () => {
  it('a fresh cts.construct record syncs to a clean grant object, not a spread socket string', () => {
    freshDraft();
    const record = nodeRecords.createProcessNode('create', 'cts.construct');
    Object.assign(record, { construction: { mode: 'genericCreate' } });
    sync.syncProcessNode(record);
    expect(record.access).toEqual({ level: 'write', roleIds: [], grants: [] });
  });

  it('a legacy draft record carrying via adopts construction.mode and drops the stale key', async () => {
    // The served type view delivers the registry's pack types; without it
    // every type is a vocabulary gap and the sync preserves authored state
    // verbatim by contract.
    globalThis.$fetch = vi.fn(async () => ({ types: facadePackContent.types.map(type => ({ ...type, scope: 'system' })) }));
    await loadOrgTypes();
    delete globalThis.$fetch;
    freshDraft();
    const record = nodeRecords.createProcessNode('create', 'cts.construct');
    delete record.construction;
    record.typeId = 'profile';
    record.via = 'genericCreate';
    sync.syncProcessNode(record);
    expect(record.construction.mode).toBe('genericCreate');
    expect(record.via).toBeUndefined();
  });

  it('authored grants survive re-sync untouched', () => {
    freshDraft();
    const record = nodeRecords.createProcessNode('create', 'cts.construct');
    Object.assign(record, {
      construction: { mode: 'genericCreate' },
      access: { level: 'write', grants: [{ roleId: 'role-1', level: 'admin' }] }
    });
    sync.syncProcessNode(record);
    sync.syncProcessNode(record);
    expect(record.access).toEqual({
      level: 'admin',
      roleIds: ['role-1'],
      grants: [{ roleId: 'role-1', level: 'admin' }]
    });
    expect(Object.keys(record.access).some(key => /^\d$/.test(key))).toBe(false);
  });

  it('legacy junk keys in a stored access object heal on sync', () => {
    // Drafts written before the spread-string fix carry residue like
    // { "0": "i", "1": "t", … } — the whitelist shape must not keep it
    // alive through re-syncs.
    freshDraft();
    const record = nodeRecords.createProcessNode('create', 'cts.construct');
    Object.assign(record, {
      construction: { mode: 'genericCreate' },
      access: { '0': 'i', '1': 't', '2': 'e', '3': 'm', level: 'admin', roleIds: ['role-1'], grants: [{ roleId: 'role-1', level: 'admin' }] }
    });
    sync.syncProcessNode(record);
    expect(record.access).toEqual({
      level: 'admin',
      roleIds: ['role-1'],
      grants: [{ roleId: 'role-1', level: 'admin' }]
    });
  });

  it('pure value algebra records keep their socket access string', () => {
    freshDraft();
    const literalList = nodeRecords.createProcessNode('list', 'source.literalList');
    sync.syncProcessNode(literalList);
    expect(literalList.access).toBe('list');
    const literal = nodeRecords.createProcessNode('item', 'source.literalItem');
    sync.syncProcessNode(literal);
    expect(literal.access).toBe('item');
  });
});

// Record-shape contract: the factory seeds only what the record's species
// carries, and the sync pass prunes the designer-owned junk keys older
// factories persisted. Failure modes: every literal/value node carrying a
// meaningless construction envelope and status/cases defaults (draft bloat,
// "what does construction mean on a string?" authoring noise); a control
// record LOSING its authored cases (the shared control contract reads
// them); an entityRef literal whose binding is anything but a string type
// id aligned with type.typeId (the type-confusion regression where the
// whole type object was assigned to typeId).
describe('process node record shape', () => {
  it('a literal record carries no create-only envelope or dead defaults', () => {
    freshDraft();
    const literal = nodeRecords.createProcessNode('lit', 'source.literalItem');
    expect(literal).not.toHaveProperty('construction');
    expect(literal).not.toHaveProperty('cases');
    expect(literal).not.toHaveProperty('status');
    expect(literal).not.toHaveProperty('matching');
    expect(literal).not.toHaveProperty('inputTransforms');
  });

  it('a construct record carries construction and no lifecycle entry', () => {
    freshDraft();
    const construct = nodeRecords.createProcessNode('c', 'cts.construct');
    expect(construct.construction).toBeDefined();
    expect(construct.state).toBeUndefined();
  });

  it('sync prunes designer-owned junk keys from legacy drafts', () => {
    freshDraft();
    const record = nodeRecords.createProcessNode('legacy', 'source.literalItem');
    Object.assign(record, { status: null, retry: { count: 2 } });
    sync.syncProcessNode(record);
    expect(record).not.toHaveProperty('status');
    expect(record).not.toHaveProperty('retry');
  });

  it('sync never prunes authored control cases', () => {
    freshDraft();
    const control = { id: 'sw', kind: 'control.switch', cases: [{ value: 'a' }] };
    sync.syncProcessNode(control);
    expect(control.cases).toEqual([{ value: 'a' }]);
  });

  it('an entityRef literal keeps a string binding aligned with type.typeId', () => {
    freshDraft();
    const literal = nodeRecords.createProcessNode('ref', 'source.literalItem');
    literal.type = { base: 'entityRef' };
    sync.syncProcessNode(literal);
    expect(typeof literal.typeId).toBe('string');
    expect(literal.typeId).toBe(literal.type.typeId);
    literal.value = { id: 'entity-1', type: 'stale-type' };
    sync.syncProcessNode(literal);
    expect(literal.value.type).toBe(literal.typeId);
  });

  it('keeps the derived entity type on a cts.field projection', () => {
    freshDraft();
    const field = nodeRecords.createProcessNode('field', 'cts.field');
    field.typeId = 'sheet';
    const readable = designer.fieldsForEntity('sheet').find(field => field.readable !== false);
    field.path = readable?.value || '';
    sync.syncProcessNode(field);
    expect(field.typeId).toBe('sheet');
    expect(field.path).toBe(readable?.value || '');
  });

  it('does not give a native consumer an operation or retired producer selector', () => {
    freshDraft();
    const read = nodeRecords.createProcessNode('read', 'cts.read');
    Object.assign(read, { select: 'current', typeId: 'sheet' });
    sync.syncProcessNode(read);
    expect(read).not.toHaveProperty('operation');
    expect(read).not.toHaveProperty('selectedProducerOutputId');
    expect(read).not.toHaveProperty('producerOutputId');
  });
});
