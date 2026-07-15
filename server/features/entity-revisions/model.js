import { BaseEntity } from '../../core/blocks/index.js';

/**
 * Immutable content revision for an entity scope such as cassette geometry.
 */
export class EntityRevision extends BaseEntity {
  constructor(raw = {}) {
    super(raw);

    this.data = {
      ...this.data,
      entityType: raw.data?.entityType || '',
      entityId: raw.data?.entityId || null,
      scope: raw.data?.scope || '',
      number: Number(raw.data?.number || 0),
      contentHash: raw.data?.contentHash || '',
      snapshot: raw.data?.snapshot || null,
      sourceStatus: raw.data?.sourceStatus || null,
      reason: raw.data?.reason || ''
    };
  }

  get name() {
    const type = this.data.entityType || 'entity';
    const scope = this.data.scope || 'revision';
    return this.identity.name || `${type} ${scope} v${this.data.number}`;
  }
}
