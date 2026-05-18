import { BaseEntity } from '~/server/core/blocks/index.js';

/**
 * Organization Entity - v24 Absolute Final
 */
export class Organization extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = this.data || {};
  }

  get name() { return this.identity.name; }
  get type() { return this.data.type; }
}
