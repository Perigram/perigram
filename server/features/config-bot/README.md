# COMPONENT: ConfigBot Feature

Admin-only capability module for ConfigBot v0.1.

ConfigBot is not a persisted business entity, so it does not use a v24
`model.js`. It stores support records in MongoDB through `repository.js` and
returns draft packages from `service.js`.

## Files

| File | Responsibility |
|---|---|
| `service.js` | Auth check, draft package assembly, chat fallback, knowledge reindex orchestration. |
| `repository.js` | MongoDB access for `config_bot_sessions` and `config_bot_knowledge_chunks`. |
| `indexer.js` | Reads selected app docs and cutkit-cortex notes into searchable chunks. |
| `ollama.js` | Optional Ollama chat call with deterministic fallback when unavailable. |
| `operations.js` | Command-runtime handlers for declared domain commands. |
| `index.js` | Public service export. |

## API And Commands

HTTP routes:

- `POST /api/config-bot/generate` - creates an admin micro-app draft package.
- `POST /api/config-bot/chat` - answers a question using indexed docs and optional Ollama.
- `GET /api/config-bot/sessions/:id` - loads the current user's session.
- `POST /api/admin/config-bot/reindex` - refreshes app/cortex knowledge chunks.

Domain commands in `@cutkit/domain-cnc`:

- `generateConfigBotDraft`
- `reindexConfigBotKnowledge`

## Access

Access is checked through the granular access engine with
`config_bot: admin`. Users need an explicit `config_bot` grant in their copied
permission set. The module does not branch on verbal preset labels.

## Draft Package Contract

Generated packages are `admin-micro-app-draft` objects:

- `writes.mode` is `draft-only`.
- `writes.applyEnabled` is `false`.
- `files[]` contains virtual page/package files only.
- `domainDraft` mirrors the current `domain-cnc` draft shape and is validated
  with `validateDomainDraft()`.

The service never writes generated files to the repository and never mutates
production entity collections.

## Knowledge Sources

`indexer.js` reads the app README set plus selected cutkit-cortex notes from
`CONFIG_BOT_CORTEX_PATH` when that environment variable is set. Container
deployments mount the host cortex repo read-only at `/opt/cutkit-cortex`.
Ollama is optional and controlled by:

- `OLLAMA_BASE_URL`
- `CONFIG_BOT_CHAT_MODEL`
- `CONFIG_BOT_EMBED_MODEL`

## Related

- [Server features](../README.md)
- [Command runtime](../../core/commands/README.md)
- [Runtime registry](../../runtime/README.md)
- [Admin pages](../../../pages/admin/README.md)
