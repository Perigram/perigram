# Deployment Guides

This directory contains instructions for deploying Cutkit-Demo in different environments.

## Deployment Options
- **[Development](./DEPLOYMENT_DEV.md):** Local setup and debugging.
- **[Railway](./DEPLOYMENT_RAILWAY.md):** Cloud deployment using Railway.app.
- **[Self-Hosted](./DEPLOYMENT_SELFHOSTED.md):** Manual deployment on your own infrastructure.
- **[Docker Setup](./DOCKER_SETUP.md):** Detailed information about the containerized stack.

## Architecture Overview
The system consists of a Nuxt.js web application and specialized Python workers. For production, MongoDB with GridFS is required for data and file storage.
