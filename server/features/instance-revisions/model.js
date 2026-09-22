import { BaseEntity, createInstanceRef } from '../../core/blocks/index.js';

/**
 * Immutable content revision for an entity scope such as cassette geometry.
 */
export class EntityRevision extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    const source = raw.data?.source || {
      type: raw.data?.typeId,
      id: raw.data?.instanceId
    };

    this.data = {
      ...this.data,
      source: createInstanceRef(source.type, source.id),
      scope: raw.data?.scope || '',
      number: Number(raw.data?.number || 0),
      contentHash: raw.data?.contentHash || '',
      snapshot: raw.data?.snapshot || null,
      sourceStatus: raw.data?.sourceStatus || null,
      reason: raw.data?.reason || ''
    };
  }

  get name() {
    const type = this.data.source?.type || 'entity';
    const scope = this.data.scope || 'revision';
    return this.identity.name || `${type} ${scope} v${this.data.number}`;
  }
}
