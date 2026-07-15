import { BaseEntity } from '~/server/core/blocks/index.js';

/**
 * Queue Entity - v24 Absolute Final
 */
export class Queue extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = this.data || {};
  }

  get name() { return this.identity?.name || `Queue #${this.data?.queueNumber || '?'}`; }
}
