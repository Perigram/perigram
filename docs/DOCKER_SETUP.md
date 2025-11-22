# Docker Setup Guide

## Local Development (Recommended)

**Without Docker (fastest):**
```bash
# Install dependencies
npm install

# Start MongoDB only in Docker
docker-compose -f docker-compose.local.yml up -d mongo

# Run app locally
npm run dev
```

Benefits:
- Fast hot reload
- Direct access to node_modules
- Easy debugging
- No container rebuild needed

---

## Full Docker Development

**With Docker (isolated environment):**
```bash
# Build and start all services
docker-compose -f docker-compose.dev.yml up --build

# Or rebuild specific service
docker-compose -f docker-compose.dev.yml build app
docker-compose -f docker-compose.dev.yml up app
```

**Stop services:**
```bash
docker-compose -f docker-compose.dev.yml down
```

**View logs:**
```bash
docker-compose -f docker-compose.dev.yml logs -f app
```

---

## Production Build

**Build production image:**
```bash
docker build -t nest2d-app:latest .
```

**Deploy with docker-compose:**
```bash
docker-compose -f docker-stack.yml up -d
```

---

## After Installing New Packages

### If running locally (no Docker):
```bash
npm install  # Already done by npm install primevue
npm run dev  # Just restart
```

### If running in Docker:
```bash
# Rebuild container with new dependencies
docker-compose -f docker-compose.dev.yml build app
docker-compose -f docker-compose.dev.yml up app
```

---

## Troubleshooting

**Package not found in Docker:**
- Check package.json includes the package
- Rebuild: `docker-compose -f docker-compose.dev.yml build --no-cache app`

**Hot reload not working in Docker:**
- Ensure volumes are mounted correctly in docker-compose.dev.yml
- Check `node_modules` is excluded from volume mount

**MongoDB connection issues:**
- Use `mongodb://mongo:27017/` in Docker (service name)
- Use `mongodb://localhost:27017/` when running locally

**Permission errors:**
- Run with correct user: `docker-compose ... --user $(id -u):$(id -g)`
- Or fix permissions: `sudo chown -R $USER:$USER .`

---

## Current Setup Status

✅ PrimeVue installed in package.json  
✅ Works immediately if running locally with `npm run dev`  
⚠️ Requires Docker rebuild if running app in container  

**Recommended:** Run app locally, only MongoDB in Docker (docker-compose.local.yml)


## Quick Docker Commands

**Rebuild after installing packages:**
```bash
docker-compose -f docker-compose.dev.yml build --no-cache app
docker-compose -f docker-compose.dev.yml up app
```

**Or just run locally (recommended):**
```bash
# MongoDB in Docker
docker-compose -f docker-compose.local.yml up -d mongo

# App locally (already has PrimeVue from npm install)
npm run dev
```

