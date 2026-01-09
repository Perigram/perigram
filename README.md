# CutKit

A modern, open-source nesting application for laser cutting and CNC machining.

[Visit Web Application](https://cutkit.stelmashchuk.dev/)

---

## 🚀 Quick Start

**1. Prerequisites:**
- Node.js v18+
- Docker & Docker Compose

**2. Setup:**
```bash
git clone <repo-url>
cd cutkit-demo
npm install
```

**3. Run Development Environment:**
```bash
./start-dev.sh
```
*This script starts MongoDB (v4.4), the background workers, and the Nuxt development server in a tmux session.*

**4. Seed Initial Data:**
```bash
node server/scripts/seed-all.js
```

---

## 🏗 Architecture & Patterns

- **Frontend**: Nuxt 3 (Vue 3), Tailwind CSS, PrimeVue.
- **Backend**: Nitro (Server Engine), MongoDB (GridFS for files).
- **Workers**: Python-based nesting and file processing workers.
- **Patterns**: Strict **Service-Repository** pattern for all backend features.

For detailed architecture info, see [ARCHITECTURE.md](./ARCHITECTURE.md).
For AI agent instructions and project rules, see [AGENTS.md](./AGENTS.md).

---

## 📖 Documentation

- **[Deployment](./docs/DEPLOYMENT.md)**: Local, Railway, and Self-hosted guides.
- **[Component Docs](./NEOLIT.md)**: Every major directory contains a `NEOLIT.md` file describing its purpose and implementation.

---

## 🛠 Common Tasks

### Database Seeding
To reset and re-seed all system data (layer standards, pen templates, etc.):
```bash
# MongoDB shell
use cutkit;
db.layer_standards.drop();
# ...
node server/scripts/seed-all.js
```

### Increasing Memory
If you encounter "JS heap out of memory", set:
`export NODE_OPTIONS="--max-old-space-size=4096"`
