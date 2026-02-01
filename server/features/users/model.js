import { BaseEntity } from '~/server/utils/blocks';

/**
 * User Entity - v24 Absolute Final
 */
export class User extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    if (!raw._id && raw.params) {
      const { email, passwordHash, role, permissions, memberships } = raw.params;
      this.data = {
        email: email || '',
        passwordHash: passwordHash || '',
        role: role || 'IndividualUser',
        permissions: permissions || {},
        memberships: memberships || [], // Memberships are strictly data
        isActive: true
      };
    }
  }

  get isActive() { return this.data.isActive; }
  get email() { return this.data.email; }
  get role() { return this.data.role; }
  get permissions() { return this.data.permissions; }
  get memberships() { return this.data.memberships || []; }
  get restrictedTo() { return this.data.restrictedTo; }
  
  // Backwards compatibility for organizationId if needed
  get organizationId() { 
    return this.lineage.organizationId || this.memberships[0]?.organizationId; 
  }
}
