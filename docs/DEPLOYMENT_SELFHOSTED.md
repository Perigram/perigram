# Self-Hosted Deployment

## Prerequisites

- Ubuntu/Debian server with Docker
- Domain name + SSL cert (optional)

## Deploy

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
docker swarm init

# 2. Configure
cat > .env << 'ENVEOF'
MONGODB_URI=mongodb://mongo:27017/nest2d
BASE_URL=https://your-domain.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ENVEOF

# 3. Deploy
docker stack deploy -c docker-stack.yml cutkit
```

## Update

```bash
git pull
docker stack deploy -c docker-stack.yml cutkit
```

**Nginx + SSL**: Use Caddy or setup manually with Let's Encrypt.
