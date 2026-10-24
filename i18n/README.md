# COMPONENT: Internationalization

Vue I18n locale dictionaries for shared UI, entity labels, workflow/status labels, and page copy:
`locales/en.json` and `locales/ru.json`.

Parent: [root README](../README.md).

## Status Labels

Status labels under `status.*` are consumed by the shared state components
(`InstanceState`, `StateHistory`, `StateTransitionDialog` in
[components/shared](../components/shared/README.md)).

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

- [utils](../utils/README.md) - generated-label resolution (`generated-labels.js`) and shared frontend utilities
- [components/shared](../components/shared/README.md) - shared status display components
