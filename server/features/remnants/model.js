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
      serial: raw.data?.serial || '',
      isReusable: raw.data?.isReusable ?? true
    };
  }
}
