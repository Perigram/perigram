# SPEC: Deploy

Owner-declared law (2026-11-14): tracked files carry no internal
infrastructure addresses.

- Concrete values — LAN IPs, internal DNS names, proxy endpoints,
  public edge addresses — live in Forgejo repository secrets and the
  external infra runbook.
- `.forgejo/workflows/deploy.yml` consumes `NUXT_MONGODB_URI`, the
  npm proxy configuration, and service base URLs from Forgejo
  repository secrets.
- Build files (root, nesting, plugin-executor, seed Dockerfiles)
  receive proxy and registry endpoints as build arguments supplied by
  the runner.
- Component READMEs state pipeline structure and link the external
  runbook for concrete endpoints.
- Public mirrors ship sanitized snapshots: internal literals replaced
  by documentation placeholders, git history excluded.
