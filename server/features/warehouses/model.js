import { BaseEntity } from '~/server/utils/blocks';

/**
 * Warehouse Entity - v24 Absolute Final
 */
export class Warehouse extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    if (!raw._id && raw.params) {
      const { type, address, contactPerson, stats } = raw.params;
      this.data = {
        type: type || 'Standard',
        address: address || '',
        contactPerson: contactPerson || '',
        stats: stats || { totalSheets: 0, totalRemnants: 0 }
      };
    }
  }
}
