import { ObjectId } from 'mongodb';
import { connectDB } from '../db/mongo.js';
import { toFlexibleId } from './objectid.js';

// The feature repository floor (features README): one Mongo home per
// collection name, `toFlexibleId` on every id lookup, ids minted as
// ObjectIds. Features keep their bespoke queries beside this floor and
// re-export what their service consumes.

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function collection(name) {
  return {
    async create(data) {
      const db = await connectDB();
      const doc = { ...data, _id: data._id || new ObjectId() };
      await db.collection(name).insertOne(doc);
      return doc;
    },
    async findById(id) {
      const db = await connectDB();
      return db.collection(name).findOne({ _id: toFlexibleId(id) });
    },
    async findByIds(ids = []) {
      const flexible = ids.map(toFlexibleId).filter(Boolean);
      if (!flexible.length) return [];
      const db = await connectDB();
      return db.collection(name).find({ _id: { $in: flexible } }).toArray();
    },
    async find(filter = {}, { limit = 0, skip = 0, sort = null } = {}) {
      const db = await connectDB();
      let cursor = db.collection(name).find(filter);
      if (sort) cursor = cursor.sort(sort);
      return cursor.skip(skip).limit(limit).toArray();
    },
    async findOne(filter = {}) {
      const db = await connectDB();
      return db.collection(name).findOne(filter);
    },
    async updateById(id, updates, { arrayFilters = [] } = {}) {
      const db = await connectDB();
      const { _id, identity, ...clean } = updates;
      const options = arrayFilters.length ? { arrayFilters } : {};
      await db.collection(name).updateOne({ _id: toFlexibleId(id) }, { $set: clean }, options);
      return db.collection(name).findOne({ _id: toFlexibleId(id) });
    },
    async deleteById(id) {
      const db = await connectDB();
      const result = await db.collection(name).deleteOne({ _id: toFlexibleId(id) });
      return result.deletedCount > 0;
    },
    async searchByName(query, path = 'identity.name', limit = 10) {
      const db = await connectDB();
      return db.collection(name)
        .find({ [path]: { $regex: escapeRegex(String(query || '')), $options: 'i' } })
        .sort({ [path]: 1 })
        .limit(limit)
        .toArray();
    }
  };
}
