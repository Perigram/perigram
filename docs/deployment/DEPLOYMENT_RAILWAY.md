# Railway Deployment

## Setup

1. **Create MongoDB Atlas cluster** (free tier): https://cloud.mongodb.com
   - Add IP: `0.0.0.0/0`
   - Get connection string

2. **Deploy to Railway**: https://railway.app
   - New Project → Deploy from GitHub
   - Add MongoDB connection string to env vars

3. **Environment Variables**:
   ```
   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/nest2d
   NUXT_PUBLIC_GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   BASE_URL=https://your-app.railway.app
   ```

Done. Railway auto-deploys on git push.
