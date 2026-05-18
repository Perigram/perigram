import { BaseEntity } from '../../core/blocks/index.js';

/**
 * [EntityName] Entity - v24 Absolute Final
 */
export class EntityName extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    // Feature-specific data mapping
    this.data = {
      ...this.data,
      customField: raw.customField || raw.data?.customField || ''
    };
  }

  // Getters for common identity fields
  get name() { return this.identity.name; }
  get slug() { return this.identity.slug; }

  /**
   * Standard DTO Serialization
   */
  toJSON() {
    return super.toJSON();
  }
}
