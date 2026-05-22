# COMPONENT: Sheet Design Entity UI

`SheetDesignCard.vue` renders sheet design DTOs through `EntityCard`.

## Behavior

- Supports `inline`, `compact`, and `card` variants.
- Inline and compact variants use `EntityCard`, so they expand through the
  shared entity popover on click or keyboard activation.
- The expanded inline/compact body reuses the same operational content as the
  card variant: `GeometryPreview` plus `SpecsBlock`.
- Sheet designs hide status controls because the current UI contract treats
  them as generated design outputs rather than direct lifecycle action targets.

## Related

- [shared components](../../shared/README.md)
- [sheet design feature](../../../server/features/sheet-designs/README.md)
