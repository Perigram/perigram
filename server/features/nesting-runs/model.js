import { BaseEntity } from '../../core/blocks/index.js';

/**
 * Nesting Run Entity - v24 Absolute Final
 */
export class NestingRun extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = {
      ...this.data,
      results: raw.results || raw.data?.results || {
        efficiency: 0,
        sheetCount: 0,
        remnantArea: 0
      },
      layoutData: raw.layoutData || raw.data?.layoutData || {},
      artifactIds: raw.artifactIds || raw.data?.artifactIds || []
    };
  }

  get name() { return this.identity.name || `Run #${this.id.substring(0, 8)}`; }

  toJSON() {
    return {
      ...super.toJSON(),
      name: this.name,
      results: this.data.results,
      layoutData: this.data.layoutData,
      artifactIds: this.data.artifactIds
    };
  }
}
