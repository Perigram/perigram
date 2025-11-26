# Development Setup Guide

Complete guide for running Cutkit-Demo locally for development.

## Prerequisites

- **Node.js** 18+ and npm
- **MongoDB** (local or Docker)
- **Docker** and Docker Compose (for workers)
- **Git** with submodules support

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/cutkit-demo.git
cd cutkit-demo

# Initialize submodules (for nesting worker)
git submodule update --init --recursive
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment

Create `.env` file in project root:

```bash
# MongoDB
MONGODB_URI=mongodb://localhost:27017/nest2d

# OAuth (for authentication)
NUXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Email (optional for notifications)
RESEND_TOKEN=your_resend_token

# Base URL
BASE_URL=http://localhost:3000
```

**Get OAuth Credentials:**
- **Google:** https://console.cloud.google.com/apis/credentials
- **GitHub:** https://github.com/settings/developers

### 4. Start MongoDB

**Option A: Using Docker Compose (Recommended)**

```bash
docker-compose -f docker-compose.dev.yml up -d mongo
```

**Option B: Local MongoDB**

```bash
# Install MongoDB on your system, then:
mongod --dbpath /path/to/data
```

### 5. Start Development Server

```bash
npm run dev
```

The app will be available at http://localhost:3000

### 6. Start Workers (Optional but needed for nesting)

Workers run in Docker for easier dependency management.

#### Start All Workers via Docker Compose

```bash
docker-compose -f docker-compose.dev.yml up -d
```

This starts:
- MongoDB
- cassette-processing-worker
- nesting-worker

#### Or Start Workers Individually

**Nesting Worker:**
```bash
cd workers/nesting

# Build the image (first time only)
docker build -t nesting-worker:local .

# Run it
docker run -e MONGO_URI=mongodb://host.docker.internal:27017/nest2d nesting-worker:local
```

**Cassette Processing Worker:**
```bash
cd workers/cassette-processing

# Install dependencies
pip3 install -r requirements.txt

# Run it
MONGO_URI=mongodb://localhost:27017/nest2d python3 main.py
```

## Project Structure

```
cutkit-demo/
├── components/          # Vue components
├── pages/              # Nuxt pages (routes)
├── server/
│   ├── api/           # API endpoints
│   ├── features/      # Business logic (services)
│   ├── db/            # Database connection
│   └── middleware/    # Auth middleware
├── workers/
│   ├── nesting/       # Nesting algorithm worker
│   └── cassette-processing/  # DXF processing worker
├── composables/       # Vue composables (stores)
├── assets/           # CSS, images
└── nuxt.config.js    # Nuxt configuration
```

## Development Workflow

### Making Changes

1. **Frontend changes** - auto-reload with hot module replacement
2. **API changes** - restart dev server (`Ctrl+C` then `npm run dev`)
3. **Worker changes** - rebuild Docker image

### Database Access

**Via MongoDB Shell:**
```bash
mongosh nest2d

# List collections
show collections

# Query data
db.cassettes.find().pretty()
db.batches.find().pretty()
db.nesting_jobs.find().pretty()
```

**Via MongoDB Compass:**
- Download: https://www.mongodb.com/products/compass
- Connect to: `mongodb://localhost:27017`
- Database: `nest2d`

## Common Issues

### Port Already in Use

If port 3000 is taken:
```bash
PORT=3001 npm run dev
```

### MongoDB Connection Failed

Check MongoDB is running:
```bash
# Docker
docker ps | grep mongo

# Local
ps aux | grep mongod
```

### Workers Not Processing Jobs

1. Check worker logs:
```bash
docker logs CONTAINER_ID
```

2. Verify MongoDB connection in worker logs

3. Check `nesting_jobs` collection has pending jobs:
```bash
mongosh nest2d
db.nesting_jobs.find({status: "pending"})
```

### Authentication Not Working

1. Verify OAuth credentials in `.env`
2. Check redirect URIs in OAuth provider settings:
   - Google: Add `http://localhost:3000/api/auth/callback/google`
   - GitHub: Add `http://localhost:3000/api/auth/callback/github`

## Testing Features

### Test Cassette Upload

1. Go to http://localhost:3000/cassettes
2. Click "Upload Cassette"
3. Upload a DXF file
4. Map layers (frame, cut, bend)
5. Wait for processing (check cassette-processing worker logs)

### Test Nesting

1. Create a project
2. Create a batch with cassette entries
3. Set quantities and dimensions
4. Click "Run Nesting"
5. Check nesting worker logs for progress
6. View results in batch page

## Debugging

### Enable Verbose Logging

Add to `nuxt.config.js`:
```javascript
export default {
  // ...
  runtimeConfig: {
    public: {
      logLevel: 'debug'
    }
  }
}
```

### Check API Logs

All API requests are logged in the terminal running `npm run dev`

### Worker Debugging

Add logging to worker code, rebuild, and restart:
```python
# In workers/nesting/main.py
logger.info(f"Debug: {variable}")
```

## Hot Tips

- Use `AGENTS.md` for AI assistance guidelines
- Check `ARCHITECTURE.md` for system design
- See `TODO.md` for current tasks
- Read `NESTING_SESSION_COMPLETE.md` for recent work

## Next Steps

- Set up production deployment → See `DEPLOYMENT_PRODUCTION.md`
- Deploy to Railway → See `DEPLOYMENT_RAILWAY.md`
- Self-host → See `DEPLOYMENT_SELFHOSTED.md`

---

Need help? Check the documentation files or create an issue on GitHub.
