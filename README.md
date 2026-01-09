# Cutkit-Demo (Nest2D)

Professional DXF nesting application for CNC manufacturing. Optimized material usage for laser, plasma, and waterjet cutters.

## Key Features
- **Parametric Cassettes:** define templates with variables (A, B, C...) and map DXF layers to system standards.
- **Batch Processing:** organize production runs into batches with dynamic parameter values.
- **High Performance:** Rust-based nesting engine ([jagua-rs](https://github.com/JeroenGar/jagua-rs)).
- **Unified Artifacts:** generates optimal material layouts (SVG, DXF), G-code, and PDF reports.

## Getting Started

### Documentation
- **[System Overview](./NEOLIT.md)** - High-level architecture and tech stack.
- **[Development Setup](./docs/development/DEVELOPMENT.md)** - Guide for local development.
- **[Onboarding](./docs/development/ONBOARDING.md)** - Essential guide for new developers.
- **[Documentation Index](./docs/)** - Comprehensive list of guides and specs.

### Local Development
1. **Setup Environment:**
   ```bash
   npm install
   ```
2. **Start Dev Session (tmux):**
   ```bash
   ./start-dev.sh
   ```
   This script ensures MongoDB is running and starts the Nuxt app and workers.

## Credits
This project is built upon the amazing work of:
- [JeroenGar (jagua-rs)](https://github.com/JeroenGar/jagua-rs)
- [Jack000 (SVGNest)](https://github.com/Jack000/SVGnest)
- and many others in the open-source CNC community.

---
[Visit Web Application](https://nest2d.stelmashchuk.dev/)