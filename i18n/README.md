# COMPONENT: Internationalization

Vue I18n locale dictionaries for shared UI, entity labels, workflow/status labels, and page copy.

## Files

- `locales/en.json`: English locale dictionary.
- `locales/ru.json`: Russian locale dictionary.

## Status Labels

Status labels under `status.*` are consumed by `utils/state-engine.js` and workflow-derived actions in `utils/state-actions.js`.
When adding a workflow state in `packages/domain-cnc/src/index.js`, add the matching status mapping and locale keys in both locale files in the same change.

## Generated Process UI

Generated process screens resolve visible copy through `utils/generated-labels.js`.
Locale keys under `generatedScreen.*` cover generated home screens, operation
verbs, loading/error states, and action feedback. Entity names should come from
the domain design-system `entities.*` label keys instead of being repeated under
`generatedScreen.*`.

## Audit Coverage

`shared/localization.spec.js` verifies that locale files have matching key
sets, every static `$t(...)` / `t(...)` key used by frontend source exists in
all locales, and known dynamic key families such as `roles.*`,
`auth.membership.*`, `cassette.*`, and `uiLab.statusPolicy.*` are covered.

## Related

- [utils](../utils/README.md) - status mapping and workflow action helpers
- [components/shared](../components/shared/README.md) - shared status display components
