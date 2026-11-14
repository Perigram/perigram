// Palette placement contract: the page's exact addNode flow for every
// palette species kind through the real composables — record creation,
// preset application, sync, and the card's spec summary. This is the guard
// for placement dying on a broken cross-composable import (the defect where
// every palette click threw because node-sync destructured module exports
// the records composable never returned).
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useProcessDesignerNodeRecords } from '~/composables/useProcessDesignerNodeRecords.js';
import { useProcessDesignerNodeSync } from '~/composables/useProcessDesignerNodeSync.js';
import { useProcessDesignerInspector } from '~/composables/useProcessDesignerInspector.js';
import { useProcessDesignerTypes } from '~/composables/useProcessDesignerTypes.js';
import { createPaletteText } from '~/utils/processDesignerPaletteText.js';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '@perigram/cts/index';
import { cncTypePack } from '@perigram/cts/pack/cnc';
import { facadeDomain, facadePackContent } from '../test-tools/facade-plugin.js';

const registry = createTypeRegistry({ id: 'repro' });
for (const declaration of [...frameworkTypes, ...cncTypePack]) registry.defineType(declaration);
const domain = projectDomainFromView(registry, 'org-1', facadeDomain, { packServices: facadePackContent.services });

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

const { ensureRecord, factoryForType, recordKeyForType } = useProcessDesignerInspector({
  draft, selectedNode: ref(null),
  factories: {
    processNode: nodeRecords.createProcessNode,
    ctsClass: id => ({ id, kind: 'class', typeId: '', class: 'file', payload: null, operators: [] })
  }
});

const presets = {
  construct: { kind: 'cts.construct', preset: { construction: { mode: 'genericCreate' } } },
  mutate: { kind: 'cts.mutate', preset: {} },
  query: { kind: 'cts.read', preset: { select: 'query' } },
  literal: { kind: 'source.literalItem', preset: { type: { base: 'string', nullable: false }, access: 'item', value: '' } }
};

function placeNode(item, id) {
  const node = { id, type: 'processNode', position: { x: 0, y: 0 }, selected: true, data: { refId: id, label: id } };
  const record = ensureRecord(recordKeyForType('processNode'), node, factoryForType('processNode'));
  if (item.kind) {
    Object.assign(record, nodeRecords.createProcessNode(id, item.kind));
    Object.assign(record, JSON.parse(JSON.stringify(item.preset || {})));
    sync.syncProcessNode(record);
  }
  return { node, record };
}

describe('palette placement flow', () => {
  for (const [name, item] of Object.entries(presets)) {
    it(`places ${name} without throwing`, () => {
      draft.value = { data: { processNodes: {}, producerOutputs: {} } };
      const { record } = placeNode(item, `${name}_1`);
      expect(record.kind).toBe(item.kind);
      expect(Array.isArray(record.inputs)).toBe(true);
      expect(Array.isArray(record.outputs)).toBe(true);
    });
  }

  it('places a class declaration node', () => {
    draft.value = { data: { ctsTypes: {} } };
    const node = { id: 'cls_1', type: 'ctsClass', position: { x: 0, y: 0 }, selected: true, data: { refId: 'cls_1', typeId: 'my-type', class: 'file', scope: 'tree', label: '', payload: null, fields: 0, states: 0 } };
    const record = ensureRecord(recordKeyForType('ctsClass'), node, factoryForType('ctsClass'));
    expect(record.kind).toBe('class');
  });

  it('socket spec lines tolerate every species record', async () => {
    const { socketSpecLine } = await import('~/composables/useNodeSpec.js');
    const { formatProcessType } = await import('@perigram/processes/index');
    draft.value = { data: { processNodes: {}, producerOutputs: {} } };
    for (const item of Object.values(presets)) {
      const { record } = placeNode(item, `spec_${item.kind}`);
      expect(() => socketSpecLine({ label: record.kind, type: record.type, access: record.access }, formatProcessType)).not.toThrow();
    }
  });
});
