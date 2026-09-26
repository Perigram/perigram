# COMPONENT: Layer Standard UI

Master-data card for OCCS/layer-standard records used by drawing previews.

## Files

| File | Purpose |
|---|---|
| `LayerStandardCard.vue` | Entity card wrapper for layer code, purpose, and default pen information. |

## Contract

- Expects a `layer_standard` DTO with canonical blocks and layer data under
  `data`.
- Status and trace are hidden because layer standards are static master data.
- Drawing surfaces should reference layer standards through registered entity
  UI instead of hand-rendering layer metadata.

## Related

- [components/shared/README.md](../../shared/README.md) - `DrawingCanvas`
- [generic instance machinery](../../../server/features/instances/README.md)
