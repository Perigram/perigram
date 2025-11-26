# Local Development

## Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd cutkit-demo
npm install

# 2. Configure .env
cat > .env << 'ENVEOF'
MONGODB_URI=mongodb://localhost:27017/nest2d
NUXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
BASE_URL=http://localhost:3000
ENVEOF
```

## Run

**App + Workers**

```bash
# Start MongoDB + workers from ghcr.io
docker-compose -f docker-compose.local.yml up -d

# Start app (not in Docker for hot reload)
npm run dev
```

**Workers included:**

- `nesting-worker` - Runs nesting algorithm
- `user-file-processing-worker` - Processes DXF uploads

**OAuth Setup:** Get credentials from [Google Console](https://console.cloud.google.com/apis/credentials) or [GitHub Settings](https://github.com/settings/developers)

## Common Commands

```bash
# View worker logs
docker logs -f nesting-worker
docker logs -f user-file-processing-worker

# View latest nesting job in MongoDB
docker exec nest2d_mongo mongosh nest2d --eval "db.nesting_jobs.find().sort({createdAt: -1}).limit(1).pretty()" --quiet

# Check artifacts
docker exec nest2d_mongo mongosh nest2d --eval "db.artifacts.find().sort({createdAt: -1}).limit(5).pretty()" --quiet

# Restart workers
docker-compose -f docker-compose.local.yml restart

# Stop everything
docker-compose -f docker-compose.local.yml down

# Rebuild worker after code changes
cd workers/nesting
docker build -t ghcr.io/1suo/nesting-worker:latest .
docker stop nesting-worker && docker rm nesting-worker
docker run -d --name nesting-worker --network cutkit-demo_default \
  -e MONGO_URI=mongodb://mongo:27017/nest2d \
  ghcr.io/1suo/nesting-worker:latest

# Push to registry (after testing)
docker push ghcr.io/1suo/nesting-worker:latest
```
