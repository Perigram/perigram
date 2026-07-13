import { BaseEntity } from '../../core/blocks/index.js';

/**
 * Nesting Run Entity - v24 Absolute Final
 */
export class NestingRun extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = {
      ...this.data,
      results: raw.data?.results || {
        efficiency: 0,
        sheetCount: 0,
        remnantArea: 0
      },
      layoutData: raw.data?.layoutData || {},
      sheetDesignOutputs: raw.data?.sheetDesignOutputs || [],
      artifactIds: raw.data?.artifactIds || []
    };
  }

  get name() { return this.identity.name || `Run #${this.id.substring(0, 8)}`; }
}
