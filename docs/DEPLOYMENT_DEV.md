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

```bash
# Start MongoDB (if not running)
docker run -d -p 27017:27017 mongo:7

# Start app
npm run dev
```

## Workers (Optional)

```bash
docker-compose -f docker-compose.dev.yml up -d
```

**OAuth Setup:** Get credentials from [Google Console](https://console.cloud.google.com/apis/credentials) or [GitHub Settings](https://github.com/settings/developers)
