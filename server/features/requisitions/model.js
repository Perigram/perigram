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
      items: raw.items || raw.data?.items || [],
      totalPrice: raw.totalPrice || raw.data?.totalPrice || 0,
      currency: raw.currency || raw.data?.currency || 'USD',
      requisitionNumber: raw.requisitionNumber || raw.data?.requisitionNumber || ''
    };
  }

  get name() { return this.identity.name || `Order #${this.data.requisitionNumber}`; }

  toJSON() {
    return {
      ...super.toJSON(),
      name: this.name,
      items: this.data.items,
      totalPrice: this.data.totalPrice,
      currency: this.data.currency,
      requisitionNumber: this.data.requisitionNumber
    };
  }
}
