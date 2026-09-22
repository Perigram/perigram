# COMPONENT: Pen Template UI

Master-data card for drawing pen templates.

## Files

| File | Purpose |
|---|---|
| `PenTemplateCard.vue` | Entity card wrapper with data-driven stroke preview and pen settings. |

## Contract

- Expects a `pen_template` DTO with canonical identity in `identity.name` and
  stroke settings in `data.stroke`.
- The line preview uses real pen color/weight/pattern data; entity chrome stays
  shared through `InstanceCard`.
- Status and trace are hidden because pen templates are master data.

## Related

- [components/shared/README.md](../../shared/README.md) - drawing/layer UI rules
- [server/features/pen-templates/README.md](../../../server/features/pen-templates/README.md)
