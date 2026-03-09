/**
 * Lineage Block - v24 Standardized
 * Flat, cumulative ancestry trace for O(1) reverse lookups.
 */
export class Lineage {
  constructor(parents = {}) {
    for (const [key, value] of Object.entries(parents)) {
      if (value) this[key] = value;
    }
  }

  /**
   * Add a parent to the lineage
   * @param {string} type - e.g. 'project', 'queue'
   * @param {string|ObjectId} uid - The parent identifier
   */
  add(type, uid) {
    if (uid) {
      this[`${type}Id`] = uid;
    }
    return this;
  }

  toJSON() {
    const json = {};
    for (const [key, value] of Object.entries(this)) {
      if (typeof value !== 'function') json[key] = value;
    }
    return json;
  }
}
