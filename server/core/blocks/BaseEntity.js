import { Identity } from './Identity.js';
import { Status } from './Status.js';
import { Lineage } from './Lineage.js';
import { Specs } from './Specs.js';

const registry = {};
export const registerService = (type, service) => { registry[type] = service; };
export const getService = (type) => registry[type];

/**
 * Base Entity - v24 Standardized
 * The root of all v24 entities.
 */
export class BaseEntity {
  constructor(raw = {}) {
    // 1. Identify
    this._id = raw.identity?.uid || raw._id || null;
    const name = raw.identity?.name || raw.name || '';
    const slug = raw.identity?.slug || raw.slug || '';
    const serial = raw.identity?.serial || raw.serial || '';
    const reference = raw.identity?.reference || raw.reference || '';
    
    this.identity = new Identity(this._id, name, slug, serial, reference);
    
    // 2. Lineage
    this.lineage = new Lineage(raw.lineage || {});
    
    // 3. Status
    this.origin = raw.origin ? new Status(raw.origin.state, raw.origin.userId, raw.origin.metadata, raw.origin.eventId) : null;
    this.status = raw.status ? new Status(raw.status.state, raw.status.userId, raw.status.metadata, raw.status.eventId) : null;
    
    // 4. Specs (Optional)
    this.specs = raw.specs ? new Specs(raw.specs) : null;

    // 5. Attachments
    this.attachments = raw.attachments || {};
    
    // 6. Data (Custom feature fields)
    this.data = raw.data || {};
  }

  get id() {
    return this._id?.toString();
  }

  toJSON() {
    return {
      _id: this._id,
      id: this.id,
      identity: this.identity.toJSON(),
      lineage: this.lineage.toJSON(),
      origin: this.origin?.toJSON() || null,
      status: this.status?.toJSON() || null,
      specs: this.specs?.toJSON() || null,
      attachments: this.attachments,
      data: this.data,
      // Legacy flat compatibility fields
      name: this.identity.name,
      slug: this.identity.slug
    };
  }

  /**
   * Transition to a new status
   */
  applyStatus(state, userId, metadata = {}, eventId = null) {
    const s = new Status(state, userId, metadata, eventId);
    if (!this.origin) this.origin = s;
    this.status = s;
    return this;
  }

  /**
   * Helper to find ancestor using the registry
   */
  async getAncestor(type) {
    const uid = this.lineage[`${type}Id` || `${type}Uid` || type];
    if (!uid) return null;
    const service = registry[type];
    if (!service) return null;
    return await service.getById(uid);
  }
}
