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

**Option A: App only (no nesting)**
```bash
# Start MongoDB
docker run -d -p 27017:27017 --name mongo mongo:7

# Start app
npm run dev
```

**Option B: App + Workers (recommended)**
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

# Restart workers
docker-compose -f docker-compose.local.yml restart

# Stop everything
docker-compose -f docker-compose.local.yml down
```
