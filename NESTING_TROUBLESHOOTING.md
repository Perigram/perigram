# Nesting Troubleshooting Guide

## Common Errors and Solutions

### Error: "Cassette [name] is not ready (status: pending)"

**Cause:** The cassette-processing worker is not running or hasn't processed the cassette yet.

**Solution:**
1. Start the cassette-processing worker:
   ```bash
   cd workers/cassette-processing
   MONGO_URI="your_mongodb_uri" python3 main.py
   ```

2. Check cassette status in MongoDB:
   ```javascript
   db.cassettes.findOne({_id: ObjectId("your_cassette_id")})
   // Should show: processingStatus: "done"
   ```

3. If status is stuck at "pending" or "processing":
   - Check worker logs for errors
   - Verify cassette has layerMapping with 'frame' layers
   - Manually reset status: `db.cassettes.updateOne({_id: ObjectId("...")}, {$set: {processingStatus: "pending"}})`

---

### Error: "Cassette [name] has no polygon data"

**Cause:** Cassette was processed but no polygonParts were generated.

**Possible reasons:**
1. DXF file has no entities in the nesting layer
2. Layer mapping is incorrect
3. Processing worker failed silently

**Solution:**
1. Check cassette in MongoDB:
   ```javascript
   db.cassettes.findOne({_id: ObjectId("your_cassette_id")}, {polygonParts: 1, layerMapping: 1, nestingLayer: 1})
   ```

2. Verify layerMapping has the nesting layer:
   - Default nestingLayer is 'frame'
   - Check: `layerMapping.frame` should have layer names
   - Example: `{ frame: ["Frame", "Outer"], cut: [], bend: [], dimensions: [] }`

3. Re-upload cassette with correct layer mapping

---

### Error: "Batch is already nesting"

**Cause:** Batch status is 'NESTING' but no active nesting job exists.

**Solution:**
The endpoint now automatically allows re-nesting if no active job is found. If still stuck:

1. Check nesting_jobs collection:
   ```javascript
   db.nesting_jobs.find({batchId: ObjectId("your_batch_id")}).sort({createdAt: -1})
   ```

2. If job exists with status 'error', check error field:
   ```javascript
   db.nesting_jobs.findOne({batchId: ObjectId("...")}, {error: 1, status: 1})
   ```

3. Manually reset batch status if needed:
   ```javascript
   db.batches.updateOne({_id: ObjectId("...")}, {$set: {status: "DRAFT"}})
   ```

---

### Error: "Invalid ID format" or "Batch not found"

**Cause:** Batch ID is invalid or batch doesn't exist.

**Solution:**
1. Verify batch exists:
   ```javascript
   db.batches.findOne({_id: ObjectId("your_batch_id")})
   ```

2. Check batch has entries:
   ```javascript
   db.batches.findOne({_id: ObjectId("...")}, {entries: 1})
   ```

---

## Worker Not Running Issues

### Symptom: Cassettes stuck at "pending" status

**Check:**
1. Is cassette-processing worker running?
   ```bash
   ps aux | grep "cassette-processing"
   ```

2. Check worker logs for errors

3. Test worker connection:
   ```bash
   cd workers/cassette-processing
   MONGO_URI="..." python3 -c "from utils.mongo import db; print(db.command('ping'))"
   ```

**Common causes:**
- Wrong MONGO_URI environment variable
- Missing Python dependencies (ezdxf, shapely, pymongo)
- MongoDB connection issues
- Worker crashed (check logs)

### Symptom: Nesting jobs stuck at "pending"

**Check:**
1. Is nesting worker running?
   ```bash
   ps aux | grep "nesting"
   ```

2. Check for worker errors in logs

3. Verify worker can access cassettes:
   ```bash
   cd workers/nesting
   MONGO_URI="..." python3 -c "
   from utils.mongo import db, cassettes_bucket
   cassette = db.cassettes.find_one({})
   print('Found cassette:', cassette.get('name') if cassette else 'None')
   "
   ```

---

## Testing Checklist

Before running nesting, verify:

- [ ] Cassette uploaded successfully
- [ ] Cassette has layer mapping (especially 'frame' layers)
- [ ] Cassette processingStatus is 'done'
- [ ] Cassette has polygonParts field with data
- [ ] cassette-processing worker is running
- [ ] nesting worker is running
- [ ] Batch has at least one entry
- [ ] Batch status is 'DRAFT'

---

## MongoDB Debug Queries

### Check cassette processing status
```javascript
db.cassettes.find(
  {processingStatus: {$ne: "done"}},
  {name: 1, processingStatus: 1, layerMapping: 1, polygonParts: 1}
)
```

### Check for failed nesting jobs
```javascript
db.nesting_jobs.find(
  {status: "error"},
  {slug: 1, error: 1, createdAt: 1}
).sort({createdAt: -1}).limit(5)
```

### Check cassettes without polygon data
```javascript
db.cassettes.find(
  {
    processingStatus: "done",
    $or: [
      {polygonParts: {$exists: false}},
      {polygonParts: {$size: 0}}
    ]
  },
  {name: 1, layerMapping: 1}
)
```

### Reset stuck batch
```javascript
db.batches.updateOne(
  {_id: ObjectId("your_batch_id")},
  {$set: {status: "DRAFT"}}
)
```

### Reset cassette for reprocessing
```javascript
db.cassettes.updateOne(
  {_id: ObjectId("your_cassette_id")},
  {
    $set: {processingStatus: "pending"},
    $unset: {polygonParts: ""}
  }
)
```

---

## Current Issue Resolution

Based on the error log showing cassette needs processing:

1. **Start cassette-processing worker** (if not running)
2. **Check cassette status** - should be 'done' with polygonParts
3. **Try nesting again** - error message will now be more helpful

If cassette is at 'pending' for more than 1 minute, check worker logs.
