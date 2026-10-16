import { BaseEntity } from '~/server/core/blocks/index.js';
import { ensureOwnerMembership } from './organization-owner.js';
/**
 * User Entity - v24 Absolute Final
 */
export class User extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = this.data || {};
    if (raw._id) {
      this.data.permissions = this.data.permissions || {};
      this.data.memberships = (this.data.memberships || []).map((membership) => {
        const normalized = ensureOwnerMembership(membership);
        return {
          ...normalized,
          permissions: normalized.permissions || {}
        };
      });
      this.data.isActive = raw.data?.isActive !== undefined ? raw.data.isActive : true;
    }
  }

  get isActive() { return !!this.data.isActive; }
  get email() { return this.data.email; }
  get permissions() { return this.data.permissions || {}; }
  get memberships() { return this.data.memberships || []; }
  get restrictedTo() { return this.data.restrictedTo || this.lineage.restrictedTo; }
  
  get organizationId() { 
    return this.lineage.organizationId || this.memberships[0]?.organizationId || null; 
  }

  toJSON() {
    const { passwordHash, avatar, bot, ...safeData } = this.data;
    const updatedAt = avatar?.updatedAt ? new Date(avatar.updatedAt).getTime() : null;
    return {
      ...super.toJSON(),
      data: {
        ...safeData,
        // The bot marker travels (clients badge the AI member) as the bare
        // creation stamp; the marker carries nothing else.
        ...(bot ? { bot: { createdAt: bot.createdAt || null } } : {}),
        ...(avatar?.fileId ? { avatarUrl: `/api/users/${this.id}/avatar${updatedAt ? `?v=${updatedAt}` : ''}` } : {})
      }
    };
  }
}
