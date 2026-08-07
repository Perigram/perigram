import { BaseEntity } from '~/server/core/blocks/index.js';

export class Facade extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = { ...this.data, parts: raw.data?.parts || [], partAssignments: raw.data?.partAssignments || [], revisions: raw.data?.revisions || {} };
  }
}
