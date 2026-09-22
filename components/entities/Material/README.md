# COMPONENT: Material Components

Cards for base `material` DTOs from the `materials` collection.

## Components

- `MaterialCard.vue` renders inline, compact, and card variants through shared
  `InstanceCard` chrome. It displays identity plus `data.code` and
  `data.description`.

## Contract

- Expects a v24 `material` DTO with `identity`, `status`, `origin`,
  `attachments`, and `data`.
- Uses `data.code` and `data.description`.
- This is separate from `materialPile` and `batchPile`, which are two UI
  surfaces over backend `material_pile` inventory DTOs.

## Related

- [components/entities/MaterialPile/README.md](../MaterialPile/README.md) - general pile UI surface
- [components/entities/BatchPile/README.md](../BatchPile/README.md) - batch/requisition pile UI surface
- [components/shared/README.md](../../shared/README.md) - InstanceCard, DataBlock
