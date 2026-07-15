export function createMongoRepository({ connectDB, collection, toFlexibleId }) {
  return {
    async create(data) {
      const db = await connectDB();
      await db.collection(collection).insertOne(data);
      return data;
    },
    async findById(id) {
      const db = await connectDB();
      return await db.collection(collection).findOne({ _id: toFlexibleId(id) });
    },
    async find(filter = {}) {
      const db = await connectDB();
      return await db.collection(collection).find(filter).toArray();
    },
    async updateById(id, updates) {
      const db = await connectDB();
      const { _id, ...clean } = updates;
      await db.collection(collection).updateOne({ _id: toFlexibleId(id) }, { $set: clean });
      return await this.findById(id);
    },
    async deleteById(id) {
      const db = await connectDB();
      return await db.collection(collection).deleteOne({ _id: toFlexibleId(id) });
    }
  };
}

export function createStatusEventStore({ connectDB }) {
  return {
    async append(event) {
      const db = await connectDB();
      const record = { ...event, timestamp: new Date() };
      const result = await db.collection('status_events').insertOne(record);
      return { ...record, id: result.insertedId };
    }
  };
}

export function createSummarySync({ connectDB, pluralize, toFlexibleId }) {
  return async function syncSummary(entityType, lineage, definition) {
    const summary = definition?.summaries?.find(item => item.entityType === entityType || !item.entityType);
    if (!summary) return null;
    const parentId = lineage?.[summary.parentIdKey];
    if (!parentId) return null;

    const db = await connectDB();
    const [result] = await db.collection(pluralize(entityType)).aggregate([
      { $match: { [`lineage.${summary.parentIdKey}`]: toFlexibleId(parentId) } },
      { $group: { _id: null, count: { $sum: 1 } } }
    ]).toArray();

    await db.collection(pluralize(summary.parentType)).updateOne(
      { _id: toFlexibleId(parentId) },
      { $set: { [`summary.${summary.countField}`]: result?.count || 0 } }
    );
    return result?.count || 0;
  };
}
