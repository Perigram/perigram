# COMPONENT: ConfigBot Components

Vue components for the admin ConfigBot draft-generator page.

## Components

| Component | Responsibility |
|---|---|
| `ConfigBotDraftPreview.vue` | Shows draft package summary, selected entities/components, virtual files, and domain draft JSON. |
| `ConfigBotValidationPanel.vue` | Renders package validation checks with shared empty-state handling. |
| `ConfigBotCitationList.vue` | Lists app/cortex documentation sources returned by ConfigBot. |

## Page Contract

`pages/admin/config-bot.vue` owns API calls and session state. These components
only render the returned draft package, validation, and citations.

The UI composes shared primitives (`StandardPage`, `ActionToolbar`,
`StateBlock`) and PrimeVue controls. It does not render raw entity status,
lineage, or CRUD controls because ConfigBot v0.1 operates on draft packages,
not persisted entities.

## Related

- [Shared UI components](../shared/README.md)
- [Admin pages](../../pages/admin/README.md)
- [ConfigBot backend](../../server/features/config-bot/README.md)
