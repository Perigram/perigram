# Railway Deployment Guide

Deploy Cutkit-Demo to Railway with MongoDB Atlas.

## Overview

**Architecture:**
- **Railway:** Hosts the Nuxt.js application
- **MongoDB Atlas:** Cloud database (free tier available)
- **GitHub Actions:** Optional CI/CD
- **Vercel/Netlify:** Alternative for frontend-only deployment

## Prerequisites

- Railway account (https://railway.app)
- MongoDB Atlas account (https://www.mongodb.com/cloud/atlas)
- GitHub repository with your code
- OAuth credentials (Google/GitHub)

## Step 1: Set Up MongoDB Atlas

### Create Cluster

1. Go to https://cloud.mongodb.com
2. Create new project: `cutkit-demo`
3. Build a cluster (free M0 tier is fine)
4. Choose region closest to your Railway deployment
5. Wait 3-5 minutes for cluster creation

### Configure Database Access

1. Database Access → Add New Database User
   - Username: `cutkit-admin`
   - Password: Generate strong password (save it!)
   - Role: Atlas Admin

2. Network Access → Add IP Address
   - Add: `0.0.0.0/0` (allow from anywhere)
   - Note: For production, restrict to Railway IPs

### Get Connection String

1. Cluster → Connect → Connect your application
2. Copy connection string (MongoDB Driver, Node.js)
3. Replace `<password>` with your database password
4. Example: `mongodb+srv://cutkit-admin:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

## Step 2: Deploy to Railway

### Create New Project

1. Go to https://railway.app
2. New Project → Deploy from GitHub repo
3. Select your `cutkit-demo` repository
4. Railway will detect it as a Node.js app

### Configure Environment Variables

In Railway dashboard → Variables:

```bash
# MongoDB
MONGODB_URI=mongodb+srv://cutkit-admin:PASSWORD@cluster0.xxxxx.mongodb.net/nest2d?retryWrites=true&w=majority
NUXT_MONGODB_URI=mongodb+srv://cutkit-admin:PASSWORD@cluster0.xxxxx.mongodb.net/nest2d?retryWrites=true&w=majority

# OAuth - Google
NUXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx

# OAuth - GitHub  
NUXT_PUBLIC_GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_secret

# Email (Resend)
NUXT_RESEND_TOKEN=re_xxxxx

# Base URL (Railway provides this automatically)
NUXT_PUBLIC_BASE_URL=${{RAILWAY_PUBLIC_DOMAIN}}

# Secrets (for production)
STRIPE_SECRET_KEY=sk_live_xxxxx
```

**Important:** Update OAuth redirect URIs in Google/GitHub:
- Google Console: Add `https://YOUR_RAILWAY_DOMAIN/api/auth/callback/google`
- GitHub Settings: Add `https://YOUR_RAILWAY_DOMAIN/api/auth/callback/github`

### Configure Build Settings

Railway auto-detects from `package.json`. Verify:

**Build Command:**
```bash
npm run build
```

**Start Command:**
```bash
node .output/server/index.mjs
```

**Root Directory:** `/` (or leave blank)

### Deploy

1. Click "Deploy"
2. Wait 3-5 minutes for build
3. Railway will provide a public URL: `https://cutkit-demo-production.up.railway.app`

## Step 3: Deploy Workers

Workers need separate Railway services because they use Docker.

### Nesting Worker

1. Railway dashboard → New Service → GitHub Repo
2. Select your repository
3. Root Directory: `/workers/nesting`
4. Settings → Environment:
   ```bash
   MONGO_URI=mongodb+srv://cutkit-admin:PASSWORD@cluster0.xxxxx.mongodb.net/nest2d?retryWrites=true&w=majority
   ```
5. Railway will use the Dockerfile automatically
6. Deploy

### Cassette Processing Worker

1. New Service → GitHub Repo
2. Root Directory: `/workers/cassette-processing`
3. Environment:
   ```bash
   MONGO_URI=mongodb+srv://cutkit-admin:PASSWORD@cluster0.xxxxx.mongodb.net/nest2d?retryWrites=true&w=majority
   WORKER_TAG=normal
   MAX_ENTITY_LIMIT=999
   ```
4. Deploy

## Step 4: Verify Deployment

### Check Application

1. Visit your Railway URL
2. Try logging in with Google/GitHub
3. Upload a test cassette
4. Create a batch and run nesting

### Check Workers

**View Logs:**
- Railway dashboard → Service → Logs tab
- Look for "Worker started" messages
- Check for MongoDB connection success

**Test Processing:**
1. Upload cassette → Check cassette-processing worker logs
2. Run nesting → Check nesting worker logs

### Check Database

**MongoDB Atlas:**
1. Collections → Browse
2. Verify data in `cassettes`, `batches`, `nesting_jobs`

## Cost Estimation

### MongoDB Atlas
- **Free Tier (M0):** 512MB storage, shared CPU/RAM
- **Paid (M10):** $0.08/hour (~$57/month) - recommended for production

### Railway
- **Free Tier:** $5 credit/month, then pay-as-you-go
- **Hobby Plan:** $5/month + usage
- **Typical costs:** $10-30/month for small app + 2 workers

**Estimated Total:** $15-40/month

## Optimization Tips

### Reduce Costs

1. **Use Railway cron** for workers (don't run 24/7)
2. **Scale down** when not in use
3. **MongoDB M0** free tier for development

### Improve Performance

1. **Enable Railway CDN** for static assets
2. **Use Redis** for session caching (Railway add-on)
3. **MongoDB indexes** - see `/server/db/indexes.js`

### Security

1. **Rotate secrets** regularly
2. **Restrict MongoDB IPs** to Railway only
3. **Enable Railway WAF** (Web Application Firewall)
4. **Use environment-specific** OAuth credentials

## Monitoring

### Railway Metrics

Dashboard shows:
- CPU usage
- Memory usage  
- Network traffic
- Request count

### MongoDB Atlas Metrics

Atlas dashboard shows:
- Connections
- Operations per second
- Storage usage
- Query performance

### Set Up Alerts

**Railway:**
- Settings → Notifications → Slack/Email

**MongoDB Atlas:**
- Alerts → Configure thresholds for CPU, memory, storage

## Troubleshooting

### Build Fails

**Check logs** in Railway dashboard:
```
# Common issues:
- Missing environment variables
- Node version mismatch
- Dependency installation failed
```

**Solution:**
1. Verify `package.json` engines
2. Check all env vars are set
3. Review build logs for specific errors

### Workers Not Processing

**Check:**
1. Worker is running (Railway shows "Running" status)
2. MongoDB connection successful (check logs)
3. Database name is correct in connection string

### 502 Bad Gateway

**Causes:**
- App crashed on startup
- Port misconfiguration
- Build output missing

**Solution:**
1. Check Railway logs for errors
2. Verify start command: `node .output/server/index.mjs`
3. Ensure build completed successfully

### OAuth Not Working

**Verify:**
1. Redirect URIs in OAuth provider match Railway domain
2. Environment variables are set correctly
3. Railway domain is HTTPS (Railway provides this automatically)

## CI/CD with GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Railway

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Railway CLI
        run: npm i -g @railway/cli
      
      - name: Deploy
        run: railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

Get Railway token: Railway → Settings → Tokens

## Scaling

### Horizontal Scaling

Railway supports multiple instances:
```bash
# Settings → Replicas
Min replicas: 1
Max replicas: 5
```

### Database Scaling

MongoDB Atlas:
1. Cluster → Edit Configuration
2. Upgrade tier (M10 → M20 → M30)
3. Add read replicas for better performance

## Backup Strategy

### MongoDB Atlas

Auto-backups included:
- Settings → Backup → Enable Cloud Backup
- Retention: 7 days (configurable)
- Point-in-time recovery available

### Railway

- Code: Use Git (already backed up on GitHub)
- Database: MongoDB Atlas handles this
- Environment vars: Export and save securely

## Next Steps

- Set up custom domain
- Enable monitoring and alerts
- Configure automated backups
- Set up staging environment
- Review security best practices

---

**Support:**
- Railway: https://railway.app/help
- MongoDB Atlas: https://www.mongodb.com/docs/atlas/
