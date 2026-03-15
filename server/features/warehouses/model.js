import { BaseEntity } from '~/server/core/blocks/index.js';

/**
 * Warehouse Entity - v24 Absolute Final
 */
export class Warehouse extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    // Default data structure
    this.data = this.data || {};
    
    // Migration/Constructor logic
    if (raw.params) {
      const { type, address, contactPerson, stats } = raw.params;
      this.data = {
        type: type || 'Standard',
        address: address || '',
        contactPerson: contactPerson || '',
        stats: stats || { totalSheets: 0, totalRemnants: 0 }
      };
    } else if (raw._id) {
      // Migrate legacy root fields to data block if needed
      if (!this.data.address && raw.address) this.data.address = raw.address;
      if (!this.data.contactPerson && raw.contactPerson) this.data.contactPerson = raw.contactPerson;
      if (!this.data.type && raw.type) this.data.type = raw.type;
      
      // Merge stats
      const legacyStats = {
        totalBatches: raw.totalBatches,
        totalSheets: raw.totalSheets,
        totalRemnants: raw.totalRemnants
      };
      this.data.stats = { ...legacyStats, ...(raw.stats || {}), ...(this.data.stats || {}) };
    }
  }

  get name() { return this.identity.name; }
  get organizationId() { return this.lineage.organizationId; }

  toJSON() {
    return {
      ...super.toJSON(),
      organizationId: this.organizationId,
      address: this.data.address,
      contactPerson: this.data.contactPerson,
      type: this.data.type,
      ...this.data.stats
    };
  }
}
