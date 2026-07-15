import { BaseEntity } from '~/server/core/blocks/index.js';

/**
 * Warehouse Entity - v24 Absolute Final
 */
export class Warehouse extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = this.data || {};
  }

  get name() { return this.identity.name; }
  get organizationId() { return this.lineage.organization.entityId; }

}
