import { BaseEntity } from '~/server/utils/blocks';

/**
 * Organization Entity - v24 Absolute Final
 */
export class Organization extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    // Default data structure
    this.data = this.data || {};
    
    // Migration/Constructor logic
    if (raw.params) {
      const { type, email, phone, address, settings } = raw.params;
      this.data = {
        type: type || 'Customer',
        email: email || '',
        phone: phone || '',
        address: address || '',
        settings: settings || {}
      };
    } else if (raw._id) {
      // Migrate legacy root fields to data block if needed
      this.data.type = this.data.type || raw.type || 'Customer';
      if (!this.data.email && raw.email) this.data.email = raw.email;
      if (!this.data.phone && raw.phone) this.data.phone = raw.phone;
      if (!this.data.address && raw.address) this.data.address = raw.address;
      if (!this.data.settings && raw.settings) this.data.settings = raw.settings;
    }
  }

  get name() { return this.identity.name; }
  get type() { return this.data.type; }

  toJSON() {
    return {
      ...super.toJSON(),
      name: this.name,
      type: this.type
    };
  }
}
