import { BaseEntity } from '~/server/core/blocks/index.js';
/**
 * User Entity - v24 Absolute Final
 */
export class User extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = this.data || {};
    if (raw._id) {
      this.data.role = this.data.role || 'IndividualUser';
      this.data.permissions = this.data.permissions || {};
      this.data.memberships = (this.data.memberships || []).map(membership => ({
        ...membership,
        permissions: membership.permissions || {}
      }));
      this.data.isActive = raw.data?.isActive !== undefined ? raw.data.isActive : true;
    }
  }

  get isActive() { return !!this.data.isActive; }
  get email() { return this.data.email; }
  get role() { return this.data.role; }
  get permissions() { return this.data.permissions || {}; }
  get memberships() { return this.data.memberships || []; }
  get restrictedTo() { return this.data.restrictedTo || this.lineage.restrictedTo; }
  
  get organizationId() { 
    return this.lineage.organizationId || this.memberships[0]?.organizationId || null; 
  }

  toJSON() {
    const { passwordHash, ...safeData } = this.data;
    return {
      ...super.toJSON(),
      data: safeData
    };
  }
}
