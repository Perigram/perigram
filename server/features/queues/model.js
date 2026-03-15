import { BaseEntity } from '~/server/core/blocks/index.js';

/**
 * Queue Entity - v24 Absolute Final
 */
export class Queue extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = this.data || {};
    
    if (raw.params) {
      this.data.job = raw.params.job || { items: [], materialPool: [] };
      this.data.queueNumber = raw.params.queueNumber;
    } else if (raw._id) {
      // Migrate from root if needed
      if (!this.data.job && raw.job) this.data.job = raw.job;
      if (!this.data.queueNumber && raw.queueNumber) this.data.queueNumber = raw.queueNumber;
    }
  }

  get name() { return this.identity?.name || `Queue #${this.data?.queueNumber || '?'}`; }

  toJSON() {
    return {
      ...super.toJSON(),
      name: this.name,
      job: this.data?.job,
      queueNumber: this.data?.queueNumber
    };
  }
}

/**
 * Nesting Run Entity - v24 Absolute Final
 */
export class NestingRun extends BaseEntity {
  constructor(raw = {}) {
    super(raw);
    
    this.data = this.data || {};

    if (raw.params) {
      this.data.results = raw.params.results || {};
      this.data.layoutData = raw.params.layoutData || {};
    } else if (raw._id) {
      if (!this.data.results && raw.results) this.data.results = raw.results;
      if (!this.data.layoutData && raw.layoutData) this.data.layoutData = raw.layoutData;
    }
  }

  toJSON() {
    return {
      ...super.toJSON(),
      results: this.data?.results,
      layoutData: this.data?.layoutData
    };
  }
}