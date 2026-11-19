export const CORE_DATA_PROVIDER = 'perigram.core.data';
export const CORE_DATA_VERSION = '1';
export const GRAPH_QUERY_INSTANCES_OPERATION = 'query.instances';

export function createCoreGraphDataProvider() {
  const definition = {
    provider: CORE_DATA_PROVIDER,
    id: GRAPH_QUERY_INSTANCES_OPERATION,
    version: CORE_DATA_VERSION,
    label: 'Query instances',
    description: 'Read a bounded, authorized organization query with deterministic ordering',
    palette: { group: 'query', keywords: ['organization', 'instances', 'filter'] },
    inputs: [{
      id: 'filters',
      label: 'Filters',
      shape: 'map',
      semantic: { base: 'json' },
      required: false
    }],
    outputs: [
      {
        id: 'items',
        label: 'Items',
        shape: 'list',
        semantic: { base: 'json' },
        required: true
      },
      {
        id: 'count',
        label: 'Count',
        shape: 'item',
        semantic: { base: 'number' },
        required: true
      }
    ],
    execution: {
      kind: 'read',
      capabilities: ['organization.instances.read'],
      deterministic: true,
      idempotent: true
    },
    configuration: {
      type: 'object',
      additionalProperties: true,
      required: ['typeId'],
      properties: {
        typeId: { type: 'string' },
        instanceId: { type: 'string', maxLength: 256 },
        sortBy: { type: 'string' },
        sortDirection: { type: 'string', enum: ['asc', 'desc'] },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
        offset: { type: 'integer', minimum: 0, maximum: 10000 },
        projection: { type: 'array', items: { type: 'string' } }
      }
    }
  };

  return {
    provider: CORE_DATA_PROVIDER,
    definitions: [definition],
    async execute(nodeDefinition, invocation = {}) {
      if (nodeDefinition.provider !== CORE_DATA_PROVIDER
        || nodeDefinition.id !== GRAPH_QUERY_INSTANCES_OPERATION
        || String(nodeDefinition.version) !== CORE_DATA_VERSION) {
        throw new Error('Unsupported core data query operation');
      }
      const queryInstances = invocation.context?.data?.queryInstances;
      if (typeof queryInstances !== 'function') {
        throw new Error('Organization data query capability is unavailable');
      }
      const response = await queryInstances({
        ...invocation.config,
        filters: invocation.inputs?.filters ?? invocation.config?.filters ?? {}
      });
      const readSet = response?.readSet || {};
      const recorder = invocation.context?.readSet;
      if (recorder) {
        if (readSet.consistency) {
          recorder.setConsistency({
            consistency: readSet.consistency,
            snapshotId: readSet.snapshotId,
            organizationSequenceStart: readSet.organizationSequenceStart,
            organizationSequenceEnd: readSet.organizationSequenceEnd
          });
        }
        for (const instance of readSet.instances || []) recorder.recordInstance(instance);
        for (const relation of readSet.relations || []) recorder.recordRelation(relation);
        for (const query of readSet.queries || []) recorder.recordQuery(query);
      }
      return {
        items: Array.isArray(response?.items) ? response.items : [],
        count: Number.isFinite(response?.count) ? response.count : 0
      };
    }
  };
}
