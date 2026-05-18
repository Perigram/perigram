import { BaseEntity } from '~/server/core/blocks/index.js';

/**
 * Project Entity - v24 Absolute Final
 */
export class Project extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    // Default data structure
    this.data = this.data || {};
  }

  get name() { return this.identity?.name || ''; }
  get slug() { return this.identity?.slug || ''; }
}
