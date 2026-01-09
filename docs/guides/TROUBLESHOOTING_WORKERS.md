# Worker Troubleshooting

## Issue: Multiple Workers Running

**Symptom:** Jobs processed by wrong worker, different errors

**Check:**
```bash
docker ps --format "table {{.Names}}\t{{.Image}}" | grep worker
```

**Solution:** Stop Swarm workers if using docker-compose:
```bash
# List services
docker service ls

# Stop nesting worker
docker service scale cutkit-demo_nesting-worker=0

# Or remove completely
docker service rm cutkit-demo_nesting-worker
```

## Issue: Cassette Has No polygonParts

**Symptom:** `'NoneType' object has no attribute 'get'` or worker uses fallback rectangles

**Check:**
```bash
docker exec nest2d_mongo mongosh nest2d --eval "
  db.cassettes.find({}, {name: 1, polygonPartsCount: 1}).pretty()
" --quiet
```

**Solution:** Re-upload cassette with layer mapping:
1. Delete old cassette
2. Upload new one
3. Map layers: e.g., `UNFOLD → 1_3_UNFOLD_BOUNDARY`

## Issue: lbf Failed with Return Code 2

**Symptom:** Error about missing `--input-file` argument

**Cause:** Worker using old nesting algorithm (stdin mode) but image has new version (file mode)

**Solution:** Use worker from `ghcr.io/vovastelmashchuk/nesting-worker:latest`

## Local Development Setup

**Recommended:**
```bash
# 1. Stop all Swarm services
docker service scale cutkit-demo_nesting-worker=0
docker service scale cutkit-demo_user-file-processing-worker-normal=0
docker service scale cutkit-demo_user-file-processing-worker-1k-entity-count=0

# 2. Use docker-compose
docker-compose -f docker-compose.local.yml up -d

# 3. Run app locally
npm run dev
```

**Verify:**
```bash
docker ps --format "table {{.Names}}\t{{.Image}}"
# Should show:
# - nesting-worker (compose)
# - user-file-processing-worker (compose)
# - nest2d_mongo
```

## Viewing Logs

```bash
# Nesting worker
docker logs -f nesting-worker

# File processing worker
docker logs -f user-file-processing-worker

# Check job status in DB
docker exec nest2d_mongo mongosh nest2d --eval "
  db.nesting_jobs.find().sort({createdAt: -1}).limit(1).pretty()
" --quiet
```
