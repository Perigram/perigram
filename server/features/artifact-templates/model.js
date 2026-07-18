import { BaseEntity } from '../../core/blocks/index.js';

export class ArtifactTemplate extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = {
      ...this.data,
      format: raw.data?.format || '',
      layout: raw.data?.layout || { format: raw.data?.format || '', pages: [] },
      variables: Array.isArray(raw.data?.variables) ? raw.data.variables : [],
      activeRevisionId: raw.data?.activeRevisionId || null
    };
  }
}
