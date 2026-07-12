import { BaseEntity } from '~/server/core/blocks/index.js';

export class ProcessDefinition extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = {
      schemaVersion: 1,
      sourceTemplateId: null,
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      roles: {},
      entityProfiles: {},
      services: {},
      sockets: {},
      assignments: {},
      compiled: null,
      ...(this.data || {})
    };
  }
}
