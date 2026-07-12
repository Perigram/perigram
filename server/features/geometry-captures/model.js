import { BaseEntity } from '../../core/blocks/index.js';

/**
 * GeometryCapture Entity
 * Photo-derived draft geometry for remnant and facade capture workflows.
 */
export class GeometryCapture extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    this.data = {
      mode: raw.data?.mode || 'REMNANT',
      activeRevisionId: raw.data?.activeRevisionId || null,
      revisions: raw.data?.revisions || [],
      calibration: raw.data?.calibration || {},
      prompt: raw.data?.prompt || {},
      geometry: raw.data?.geometry || null,
      extraction: raw.data?.extraction || {},
      output: raw.data?.output || null,
      ...(this.data || {})
    };
  }
}
