import { BaseEntity } from '../../core/blocks/index.js';

/**
 * Cassette Instance Entity - v24 Absolute Final
 * Physical unit tracking.
 */
export class CassetteInstance extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = {
      ...this.data
    };
  }

  get name() { return this.identity.name || `Instance ${this.identity.serial}`; }
}
