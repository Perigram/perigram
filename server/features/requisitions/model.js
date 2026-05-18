import { BaseEntity } from '../../core/blocks/index.js';

/**
 * Requisition Entity - v24 Absolute Final
 * Material order from contractor to manufacturer.
 */
export class Requisition extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = {
      ...this.data,
      items: raw.data?.items || [],
      totalPrice: raw.data?.totalPrice || 0,
      currency: raw.data?.currency || 'USD',
      requisitionNumber: raw.data?.requisitionNumber || ''
    };
  }

  get name() { return this.identity.name || `Order #${this.data.requisitionNumber}`; }
}
