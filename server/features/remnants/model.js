import { BaseEntity } from '../../core/blocks/index.js';

/**
 * Remnant Entity - v24 Absolute Final
 * Reusable material waste from a cut sheet.
 */
export class Remnant extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = {
      ...this.data,
      serial: raw.serial || raw.data?.serial || '',
      isReusable: raw.isReusable ?? raw.data?.isReusable ?? true
    };
  }

  toJSON() {
    return {
      ...super.toJSON(),
      serial: this.data.serial,
      isReusable: this.data.isReusable
    };
  }
}
