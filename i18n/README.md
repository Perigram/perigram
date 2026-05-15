# COMPONENT: Internationalization

Vue I18n locale dictionaries for shared UI, entity labels, workflow/status labels, and page copy.

## Files

- `locales/en.json`: English locale dictionary.
- `locales/ru.json`: Russian locale dictionary.

## Status Labels

Status labels under `status.*` are consumed by `utils/status-engine.js` and workflow-derived actions in `utils/status-actions.js`.
When adding a workflow state in `packages/domain-cnc/src/index.js`, add the matching status mapping and locale keys in both locale files in the same change.

## Related

- [utils](../utils/README.md) - status mapping and workflow action helpers
- [components/shared](../components/shared/README.md) - shared status display components
