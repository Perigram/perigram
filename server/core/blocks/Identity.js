/**
 * Identity Block - v24 Standardized
 * Unified identification for all entities.
 */
export class Identity {
  constructor(uid, name = '', slug = '', serial = '', reference = '') {
    if (!uid) throw new Error('Identity: uid is required');
    this.uid = uid;
    this.name = name;
    this.slug = slug || (typeof uid === 'string' && uid.length !== 24 ? uid : '');
    this.serial = serial;
    this.reference = reference;
  }

  toJSON() {
    return {
      uid: this.uid,
      name: this.name,
      slug: this.slug,
      serial: this.serial,
      reference: this.reference
    };
  }
}
