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
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '~/packages/cts/src/index.js';
import { cncTypePack } from '~/packages/cts/src/pack/cnc.js';
import { cncDomain, cncPackContent } from '~/packages/domain-cnc/src/index.js';

const registry = createTypeRegistry({ id: 'node-sync-spec' });
for (const declaration of [...frameworkTypes, ...cncTypePack]) registry.defineType(declaration);
const domain = projectDomainFromView(registry, 'org-1', cncDomain, { packServices: cncPackContent.services });

const t = key => key;
const te = () => false;
const { paletteLabel, paletteDescription } = createPaletteText({ t, te });
const nodes = ref([]);
const edges = ref([]);
const draft = ref(null);
const toast = { add: () => {} };

const { designer } = useProcessDesignerTypes({
  nodes, edges, t, toast,
  activeOrganizationId: () => 'org-1',
  baseDomain: cncDomain,
  packContent: cncPackContent,
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

describe('effect record access stays a grant object', () => {
  it('a fresh cts.construct record syncs to a clean grant object, not a spread socket string', () => {
    freshDraft();
    const record = nodeRecords.createProcessNode('create', 'cts.construct');
    Object.assign(record, { construction: { mode: 'genericCreate' } });
    sync.syncProcessNode(record);
    expect(record.access).toEqual({ level: 'write', roleIds: [], grants: [] });
  });

  it('a legacy draft record carrying via adopts construction.mode and drops the stale key', () => {
    freshDraft();
    const record = nodeRecords.createProcessNode('create', 'cts.construct');
    delete record.construction;
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
