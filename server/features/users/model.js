import { BaseEntity } from '~/server/core/blocks/index.js';
import { PERMISSION_TEMPLATES } from './permission-templates.js';

/**
 * User Entity - v24 Absolute Final
 */
export class User extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    // Default data structure
    this.data = this.data || {};
    
    // Migration logic for existing/new entities
    if (raw.params) {
      const { email, passwordHash, role, permissions, memberships } = raw.params;
      this.data = {
        email: (email || '').toLowerCase(),
        passwordHash: passwordHash || '',
        role: role || 'IndividualUser',
        permissions: permissions || PERMISSION_TEMPLATES[role || 'IndividualUser'],
        memberships: memberships || [],
        isActive: true
      };
    } else if (raw._id) {
      // Migrate legacy root fields to data block
      if (!this.data.email && raw.email) this.data.email = raw.email.toLowerCase();
      if (!this.data.passwordHash && raw.passwordHash) this.data.passwordHash = raw.passwordHash;
      this.data.role = this.data.role || raw.role || 'IndividualUser';
      this.data.permissions = this.data.permissions || raw.permissions || PERMISSION_TEMPLATES[this.data.role];
      if (!this.data.memberships && raw.memberships) this.data.memberships = raw.memberships;
      this.data.memberships = this.data.memberships || [];
      
      const rawIsActive = raw.data?.isActive !== undefined ? raw.data.isActive : raw.isActive;
      this.data.isActive = rawIsActive !== undefined ? rawIsActive : true;

      // Migrate lineage
      if (!this.lineage.organizationId) {
        const orgId = raw.lineage?.organizationId || raw.organizationId || raw.currentOrganizationId || this.data.memberships[0]?.organizationId;
        if (orgId) this.lineage.organizationId = orgId;
      }
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
      data: safeData,
      email: this.email,
      role: this.role,
      permissions: this.permissions,
      memberships: this.memberships,
      isActive: this.isActive
    };
  }
}