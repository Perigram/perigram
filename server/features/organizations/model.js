import { BaseEntity } from '~/server/utils/blocks';

/**
 * Organization Entity - v24 Absolute Final
 */
export class Organization extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    if (!raw._id && raw.params) {
      const { type, email, phone, address, settings } = raw.params;
      this.data = {
        type: type || 'Customer',
        email: email || '',
        phone: phone || '',
        address: address || '',
        settings: settings || {}
      };
    }
  }
}
