import { BaseEntity } from '~/server/core/blocks/index.js';
export class FacadePattern extends BaseEntity { constructor(raw = {}) { super(raw); this.data = { ...this.data, graph: raw.data?.graph || { schemaVersion: 1, nodes: [], edges: [], outputs: [], parameters: [] }, revisions: raw.data?.revisions || {} }; } }
