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
}
