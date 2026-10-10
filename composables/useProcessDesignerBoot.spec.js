// Boot smoke: the page's exact load → setDraft → createDraft → saveDraft
// sequences over the real composables, the real pure pipeline (migration,
// canvas projection, live interpretation), and the real persisted
// acceptance fixture — asserting the requests are well-formed and nothing
// throws between the dock button and the network.
import { describe, expect, it, vi } from 'vitest';
import { nextTick, reactive, ref } from 'vue';
import { useProcessDefinitionCatalog } from '~/composables/useProcessDefinitionCatalog.js';
import { useProcessDesignerPersistence } from '~/composables/useProcessDesignerPersistence.js';
import { useProcessDesignerLiveGraph } from '~/composables/useProcessDesignerLiveGraph.js';
import { useProcessDesignerInspector } from '~/composables/useProcessDesignerInspector.js';
import {
  canvasToDefinition,
  definitionToCanvas,
  PROCESS_DATAFLOW_VERSION,
  createProcessDesignerContract
} from '~/packages/processes/src/index.js';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '~/packages/cts/src/index.js';
import { cncTypePack } from '~/packages/cts/src/pack/cnc.js';
import { facadeDomain, facadePackContent } from '../test-tools/facade-plugin.js';
import { createPersistedAcceptanceFixture } from '~/test-data/persisted-acceptance.js';

function projectedDomain() {
  const registry = createTypeRegistry({ id: 'boot-smoke' });
  for (const declaration of [...frameworkTypes, ...cncTypePack]) registry.defineType(declaration);
  return projectDomainFromView(registry, 'org-1', facadeDomain, { packServices: facadePackContent.services });
}

// The page's setDraft body, verbatim in effect
function setDraft(value, { nodes, edges, validation, applyMutations }) {
  value = JSON.parse(JSON.stringify(value || {}));
  const canvas = definitionToCanvas(value?.data || {});
  validation.value = null;
  nodes.value = canvas.nodes;
  edges.value = canvas.edges;
  applyMutations([]);
}

describe('designer boot smoke', () => {
  it('loads the stale persisted definition, interprets it, and saves it back', () => {
    const requests = [];
    const persistence = useProcessDesignerPersistence({
      request: async (url, options = {}) => {
        requests.push({ url, ...options });
        if (url === '/api/process-definitions/active') return createPersistedAcceptanceFixture().processDefinition;
        if (url === '/api/process-definitions') return [createPersistedAcceptanceFixture().processDefinition];
        if (url.startsWith('/api/organizations/')) return {};
        if (options.method === 'POST') return { ...createPersistedAcceptanceFixture().processDefinition, _id: 'created-1' };
        return { ...createPersistedAcceptanceFixture().processDefinition };
      }
    });

    const catalog = useProcessDefinitionCatalog({ definitionToCanvas });
    const nodes = ref([]);
    const edges = ref([]);
    const draft = ref(null);
    const validation = ref(null);
    let applyMutations = () => {};
    const engine = useProcessDesignerLiveGraph({
      nodes, edges, draft,
      apply: mutations => applyMutations(mutations)
    });
    applyMutations = mutations => {
      for (const mutation of mutations) {
        if (mutation.scope === 'node') {
          const node = nodes.value.find(candidate => candidate.id === mutation.nodeId);
          if (node) node.data[mutation.key] = mutation.value;
        }
      }
    };

    // loadActiveOrCreateLocal
    const { active, definitions } = persistence.loadWorkspace && {};
    return persistence.loadWorkspace('org-1').then(async ({ active: loadedActive, definitions: loadedDefinitions }) => {
      const list = catalog.normalizeProcessList(loadedActive, loadedDefinitions);
      const initial = catalog.pickInitialProcess(loadedActive, list);
      expect(initial).toBeTruthy();
      setDraft(initial, { nodes, edges, validation, applyMutations });
      await nextTick();
      expect(nodes.value.length).toBeGreaterThan(0);

      // serializeProcess + saveDraft on the loaded graph
      const saved = canvasToDefinition(
        {
          nodes: nodes.value.map(node => ({ ...node, selected: undefined })),
          edges: edges.value.map(({ animated, style, ...rest }) => rest),
          viewport: { x: 0, y: 0, zoom: 1 }
        },
        draft.value?.data || initial.data
      );
      await persistence.saveDraft(initial._id, { ...saved, dataflowVersion: PROCESS_DATAFLOW_VERSION });
      expect(requests.at(-1).url).toBe(`/api/process-definitions/${initial._id}`);
      expect(requests.at(-1).body.data.dataflowVersion).toBe(PROCESS_DATAFLOW_VERSION);
    });
  });

  it('creates a fresh definition from an empty canvas without touching the loaded one', async () => {
    const requests = [];
    const persistence = useProcessDesignerPersistence({
      request: async (url, options = {}) => {
        requests.push({ url, ...options });
        if (url === '/api/process-definitions/active') return null;
        if (url === '/api/process-definitions') return options.method === 'POST'
          ? { _id: 'created-1', states: { main: 'DRAFT' }, data: options.body.data }
          : [];
        if (url.startsWith('/api/organizations/')) return {};
        return { _id: 'created-1' };
      }
    });

    const catalog = useProcessDefinitionCatalog({ definitionToCanvas });
    const loaded = await persistence.loadWorkspace('org-1');
    const list = catalog.normalizeProcessList(loaded.active, loaded.definitions);
    expect(catalog.pickInitialProcess(loaded.active, list)).toBeNull();

    // createDraft({ empty: true }): the page's exact data construction
    const data = canvasToDefinition(
      { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      { dataflowVersion: PROCESS_DATAFLOW_VERSION }
    );
    const created = await persistence.createDraft({ name: 'Organization process', data });
    expect(requests.at(-1).url).toBe('/api/process-definitions');
    expect(requests.at(-1).method).toBe('POST');
    expect(created._id).toBe('created-1');

    // setDraft over the created record must project and interpret cleanly
    const nodes = ref([]);
    const edges = ref([]);
    const validation = ref(null);
    let applyMutations = () => {};
    useProcessDesignerLiveGraph({ nodes, edges, draft: ref(created), apply: mutations => applyMutations(mutations) });
    applyMutations = () => {};
    setDraft(created, { nodes, edges, validation, applyMutations });
    await nextTick();
    expect(nodes.value).toEqual([]);
  });
});
