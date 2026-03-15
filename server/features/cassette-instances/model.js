import { BaseEntity } from '../../core/blocks/index.js';

/**
 * Cassette Instance Entity - v24 Absolute Final
 * Physical unit tracking.
 */
export class CassetteInstance extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = {
      ...this.data,
      // Physical properties and tracking data
      serial: raw.serial || raw.identity?.serial || raw.data?.serial || '',
      reference: raw.reference || raw.identity?.reference || raw.data?.reference || ''
    };
  }

  get name() { return this.identity.name || `Instance ${this.data.serial}`; }

  toJSON() {
    return {
      ...super.toJSON(),
      serial: this.data.serial,
      reference: this.data.reference
    };
  }
}
