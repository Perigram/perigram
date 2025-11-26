# Self-Hosted Deployment Guide

Deploy Cutkit-Demo on your own server using Docker Swarm.

## Overview

**Stack:**
- **Docker Swarm:** Container orchestration
- **MongoDB:** Self-hosted database
- **Nginx:** Reverse proxy + SSL
- **Let's Encrypt:** Free SSL certificates

**Server Requirements:**
- 2+ CPU cores
- 4GB+ RAM
- 20GB+ disk space
- Ubuntu 20.04+ / Debian 11+
- Public IP address
- Domain name (for SSL)

## Step 1: Prepare Server

### Initial Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose
sudo apt install docker-compose -y

# Enable Docker on boot
sudo systemctl enable docker
```

### Initialize Docker Swarm

```bash
# Initialize swarm
docker swarm init

# Create networks
docker network create --driver overlay --attachable infra_mongo
docker network create --driver overlay infra_reverse-proxy

# Verify
docker network ls
```

### Set Up Firewall

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Docker Swarm ports
sudo ufw allow 2377/tcp
sudo ufw allow 7946/tcp
sudo ufw allow 7946/udp
sudo ufw allow 4789/udp

# Enable firewall
sudo ufw enable
```

## Step 2: Configure Domain

### DNS Settings

Point your domain to your server:

```
Type    Name    Value           TTL
A       @       YOUR_SERVER_IP  3600
A       www     YOUR_SERVER_IP  3600
```

Verify DNS propagation:
```bash
dig yourdomain.com +short
# Should show your server IP
```

## Step 3: Set Up MongoDB

### Create Data Directory

```bash
sudo mkdir -p /data/mongodb
sudo chown -R $USER:$USER /data/mongodb
```

### Deploy MongoDB

Create `docker-stack-mongo.yml`:

```yaml
version: "3.8"

services:
  mongo:
    image: mongo:7
    volumes:
      - /data/mongodb:/data/db
    networks:
      - infra_mongo
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=CHANGE_THIS_PASSWORD

networks:
  infra_mongo:
    external: true
```

Deploy:
```bash
docker stack deploy -c docker-stack-mongo.yml mongo
```

Verify:
```bash
docker service ls | grep mongo
docker service logs mongo_mongo
```

### Create Application Database

```bash
# Connect to MongoDB
docker exec -it $(docker ps -q -f name=mongo_mongo) mongosh -u admin -p CHANGE_THIS_PASSWORD

# In MongoDB shell:
use nest2d
db.createUser({
  user: "nestapp",
  pwd: "CHANGE_THIS_PASSWORD",
  roles: [{ role: "readWrite", db: "nest2d" }]
})
exit
```

## Step 4: Configure Application

### Clone Repository

```bash
cd /opt
sudo git clone https://github.com/YOUR_USERNAME/cutkit-demo.git
cd cutkit-demo

# Initialize submodules
git submodule update --init --recursive
```

### Create Environment File

Create `.env.production`:

```bash
# MongoDB
MONGO_URI=mongodb://nestapp:CHANGE_THIS_PASSWORD@mongo:27017/nest2d

# OAuth
NUXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_secret
NUXT_PUBLIC_GITHUB_CLIENT_ID=your_github_id
GITHUB_CLIENT_SECRET=your_github_secret

# Email
NUXT_RESEND_TOKEN=re_xxxxx

# Base URL
NUXT_PUBLIC_BASE_URL=https://yourdomain.com

# Worker config
WORKERS_REPLICAS=1
GIT_COMMIT_HASH=latest
```

### Build Docker Images

**Main App:**
```bash
docker build -t yourdomain.com/cutkit-app:latest .
```

**Nesting Worker:**
```bash
cd workers/nesting
docker build -t yourdomain.com/nesting-worker:latest .
cd ../..
```

**Cassette Worker:**
```bash
cd workers/cassette-processing
docker build -t yourdomain.com/cassette-worker:latest .
cd ../..
```

### Update docker-stack.yml

Edit `docker-stack.yml` to use your images:

```yaml
version: "3.8"

services:
  app:
    image: yourdomain.com/cutkit-app:${GIT_COMMIT_HASH:-latest}
    ports:
      - "3000:3000"
    environment:
      - NUXT_PUBLIC_BASE_URL=${NUXT_PUBLIC_BASE_URL}
      - MONGODB_URI=${MONGO_URI}
      - NUXT_PUBLIC_GOOGLE_CLIENT_ID=${NUXT_PUBLIC_GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
      - NUXT_PUBLIC_GITHUB_CLIENT_ID=${NUXT_PUBLIC_GITHUB_CLIENT_ID}
      - GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
      - NUXT_RESEND_TOKEN=${NUXT_RESEND_TOKEN}
    networks:
      - infra_reverse-proxy
      - infra_mongo
    deploy:
      replicas: 1
      update_config:
        order: start-first

  nesting-worker:
    image: yourdomain.com/nesting-worker:${GIT_COMMIT_HASH:-latest}
    environment:
      - MONGO_URI=${MONGO_URI}
    networks:
      - infra_mongo
    deploy:
      replicas: ${WORKERS_REPLICAS:-1}

  cassette-worker:
    image: yourdomain.com/cassette-worker:${GIT_COMMIT_HASH:-latest}
    environment:
      - MONGO_URI=${MONGO_URI}
      - WORKER_TAG=normal
      - MAX_ENTITY_LIMIT=999
    networks:
      - infra_mongo
    deploy:
      replicas: ${WORKERS_REPLICAS:-1}

networks:
  infra_reverse-proxy:
    external: true
  infra_mongo:
    external: true
```

## Step 5: Set Up Nginx + SSL

### Install Nginx

```bash
sudo apt install nginx certbot python3-certbot-nginx -y
```

### Configure Nginx

Create `/etc/nginx/sites-available/cutkit`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable:
```bash
sudo ln -s /etc/nginx/sites-available/cutkit /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Get SSL Certificate

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Follow prompts. Certbot will:
1. Verify domain ownership
2. Generate SSL certificate
3. Update Nginx config automatically
4. Set up auto-renewal

Verify auto-renewal:
```bash
sudo certbot renew --dry-run
```

## Step 6: Deploy Application

### Load Environment Variables

```bash
export $(cat .env.production | xargs)
```

### Deploy Stack

```bash
docker stack deploy -c docker-stack.yml cutkit
```

### Verify Deployment

```bash
# Check services
docker service ls

# Check logs
docker service logs cutkit_app
docker service logs cutkit_nesting-worker
docker service logs cutkit_cassette-worker

# Check running containers
docker ps
```

### Test Application

1. Visit https://yourdomain.com
2. Try logging in
3. Upload a cassette
4. Run nesting

## Step 7: Set Up Backups

### MongoDB Backup Script

Create `/opt/backup-mongodb.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/backups/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

docker exec $(docker ps -q -f name=mongo_mongo) \
  mongodump \
  --uri="mongodb://nestapp:CHANGE_THIS_PASSWORD@localhost:27017/nest2d" \
  --out=/tmp/backup

docker cp $(docker ps -q -f name=mongo_mongo):/tmp/backup $BACKUP_DIR/$DATE

# Keep only last 7 days
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} +

echo "Backup completed: $BACKUP_DIR/$DATE"
```

Make executable:
```bash
chmod +x /opt/backup-mongodb.sh
```

### Schedule Backups

```bash
crontab -e

# Add line (daily at 2 AM):
0 2 * * * /opt/backup-mongodb.sh >> /var/log/mongodb-backup.log 2>&1
```

### Restore from Backup

```bash
docker cp /backups/mongodb/20250126_020000 \
  $(docker ps -q -f name=mongo_mongo):/tmp/restore

docker exec $(docker ps -q -f name=mongo_mongo) \
  mongorestore \
  --uri="mongodb://nestapp:PASSWORD@localhost:27017" \
  /tmp/restore/nest2d
```

## Monitoring

### Check Service Health

```bash
# Service status
docker service ps cutkit_app

# Resource usage
docker stats

# Logs (last 100 lines)
docker service logs --tail 100 cutkit_app
```

### Set Up Monitoring Stack

Optional: Deploy Prometheus + Grafana

```bash
# Coming soon: docker-stack-monitoring.yml
```

## Maintenance

### Update Application

```bash
cd /opt/cutkit-demo
git pull
git submodule update --recursive

# Rebuild images
docker build -t yourdomain.com/cutkit-app:latest .
cd workers/nesting && docker build -t yourdomain.com/nesting-worker:latest .

# Redeploy
export $(cat .env.production | xargs)
docker stack deploy -c docker-stack.yml cutkit
```

### Scale Workers

```bash
docker service scale cutkit_nesting-worker=3
docker service scale cutkit_cassette-worker=2
```

### View Logs

```bash
# Follow logs
docker service logs -f cutkit_app

# Last 100 lines
docker service logs --tail 100 cutkit_nesting-worker

# Since timestamp
docker service logs --since 2025-01-26T10:00:00 cutkit_cassette-worker
```

## Troubleshooting

### Service Won't Start

```bash
# Check service status
docker service ps cutkit_app --no-trunc

# Common issues:
# - Image not found: rebuild image
# - Network error: check networks exist
# - Port conflict: change port in stack file
```

### MongoDB Connection Failed

```bash
# Test from app container
docker exec -it $(docker ps -q -f name=cutkit_app) sh
ping mongo
# Should resolve to container IP
```

### SSL Certificate Issues

```bash
# Renew manually
sudo certbot renew

# Check certificate
sudo certbot certificates
```

## Security Hardening

### Firewall Rules

```bash
# Block everything except what's needed
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### MongoDB Security

1. Change default passwords
2. Enable authentication
3. Disable remote access (if not needed)
4. Regular backups

### Application Security

1. Keep dependencies updated
2. Use secrets for sensitive data
3. Enable HTTPS only
4. Set up fail2ban for SSH
5. Regular security updates

## Cost Estimation

**VPS Options:**
- DigitalOcean: $12/month (2GB RAM droplet)
- Hetzner: €4.5/month (2GB RAM)
- Vultr: $6/month (2GB RAM)
- Linode: $12/month (2GB RAM)

**Total: ~$5-15/month** (much cheaper than managed services!)

## Next Steps

- Set up CI/CD pipeline
- Configure automated deployments
- Add monitoring and alerts
- Set up log aggregation
- Configure automated scaling

---

**Need Help?** Check logs, review documentation, or create an issue on GitHub.
