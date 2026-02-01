import { BaseEntity } from '~/server/utils/blocks';

/**
 * Queue Entity - v24 Absolute Final
 */
export class Queue extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    if (!raw._id && raw.params) {
      this.data = {
        job: raw.params.job || { items: [], materialPool: [] },
        queueNumber: raw.params.queueNumber
      };
    }
  }
}

/**
 * Nesting Run Entity - v24 Absolute Final
 */
export class NestingRun extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    if (!raw._id && raw.params) {
      this.data = {
        results: raw.params.results || {},
        layoutData: raw.params.layoutData || {}
      };
    }
  }
}