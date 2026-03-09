import { BaseEntity } from '../../utils/blocks.js';

/**
 * Project Entity - v24 Absolute Final
 */
export class Project extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    // Default data structure
    this.data = this.data || {};
    
    // Legacy support and migration
    if (!raw._id && raw.metadata) {
      this.data.metadata = raw.metadata;
    } else if (raw._id) {
      // For existing projects
      if (!this.data.metadata && raw.metadata) this.data.metadata = raw.metadata;
    }
  }

  get name() { return this.identity?.name || this.data?.name || ''; }
  get slug() { return this.identity?.slug || this.id; }

  toJSON() {
    return {
      ...super.toJSON(),
      name: this.name,
      slug: this.slug
    };
  }
}