import { ref } from 'vue';

export function parseGraphPayload(payload, t) {
  const graph = JSON.parse(payload);
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    throw new Error(t('processDesigner.invalidGraphPayload'));
  }
  return graph;
}

// The graph-document catalog list (the graphs list and the Use Graph
// palette share one fetch): readable graph-document records with their
// stored graph identity. `withPayloads` downloads and validates every
// payload — the Use Graph palette pins exact revisions from them.
export function useGraphDocumentCatalog({ withPayloads = false } = {}) {
  const documents = ref([]);
  const loading = ref(false);
  const error = ref('');

  async function load(t) {
    loading.value = true;
    error.value = '';
    try {
      const items = await $fetch('/api/instances/graph-document');
      const records = (Array.isArray(items) ? items : [])
        .filter(item => item?.payload?.fileId && item?._id)
        .map(item => ({
          ...item,
          _id: String(item._id),
          name: String(item.name || 'Graph'),
          fields: { ...(item.fields || {}), graphId: String(item.fields?.graphId || '') }
        }));
      if (!withPayloads) {
        documents.value = records;
        return;
      }
      const { assertValidGraphDocument } = await import('@perigram/core');
      documents.value = await Promise.all(records.map(async record => {
        try {
          const payload = await $fetch(
            `/api/files/download/${encodeURIComponent(record.payload.fileId)}?bucket=files`,
            { responseType: 'text' }
          );
          const graph = assertValidGraphDocument(parseGraphPayload(payload, t));
          if (record.fields.graphId && record.fields.graphId !== graph.id) {
            throw new Error('Stored graph identity does not match its payload');
          }
          return { ...record, graph };
        } catch {
          return { ...record, graph: null };
        }
      }));
    } catch (fetchError) {
      error.value = fetchError?.data?.message || fetchError?.message || '';
    } finally {
      loading.value = false;
    }
  }

  return { documents, loading, error, load };
}
