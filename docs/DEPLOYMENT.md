# Deployment Guide

This guide covers setting up CutKit in various environments.

## 💻 Local Development (Recommended)

The fastest way to develop is running the app locally and using Docker only for infrastructure (MongoDB and workers).

1.  **Start Infrastructure**:
    ```bash
    ./start-dev.sh
    ```
    *This starts MongoDB (v4.4) and connects via a tmux session for logs.*

2.  **Manual Start (Alternative)**:
    ```bash
    # Start DB
    docker-compose -f docker-compose.local.yml up -d mongo
    # Start App
    npm run dev
    ```

## ☁️ Cloud Deployment (Railway)

Railway is recommended for quick cloud deployments with automatic CI/CD.

1.  **MongoDB**: Use MongoDB Atlas (Free Tier) or Railway's built-in MongoDB.
2.  **Environment Variables**:
    *   `MONGODB_URI`: Your connection string.
    *   `BASE_URL`: Public URL of your app.
    *   `GOOGLE_CLIENT_ID` / `GITHUB_CLIENT_ID`: OAuth credentials.
3.  **Deploy**: Connect your GitHub repository to Railway. It will auto-detect the `Dockerfile` and deploy.

## 🏠 Self-Hosted (Docker Swarm)

For production on your own server.

1.  **Init Swarm**: `docker swarm init`
2.  **Secrets**:
    ```bash
    echo "your_key" | docker secret create stripe_secret_key -
    echo "your_secret" | docker secret create github_client_secret -
    ```
3.  **Deploy Stack**:
    ```bash
    docker stack deploy -c docker-stack.yml cutkit
    ```

## 🛠 Troubleshooting

*   **Memory Issues**: If you see "JS heap out of memory", set `NODE_OPTIONS="--max-old-space-size=4096"`.
*   **MongoDB**: Older CPUs require `mongo:4.4` (newer versions require AVX support).
*   **Logs**:
    *   `docker service logs -f cutkit_app`
    *   `docker logs -f nesting-worker`
