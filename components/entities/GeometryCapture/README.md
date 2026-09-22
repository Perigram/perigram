# COMPONENT: Geometry Capture UI

Entity card and detail surfaces for `geometry_capture` records.

## Files

| File | Purpose |
|---|---|
| `GeometryCaptureCard.vue` | Entity-card wrapper for photo-derived capture drafts, extraction confidence, dimensions, and compact trace context. |
| `GeometryCaptureDetail.vue` | Review surface for extracted polygons, detector presets, revisions, diagnostics, traceability, and confirmation action. |
| `PhotoGeometryOverlay.vue` | Stored-photo overlay for drawing pre-extraction prompts and selecting detected vertices during review. |

## Contracts

- Uses `InstanceCard`, `InstancePage`, `GeometryPreview`, `DataBlock`,
  `InstanceInlineRef`, and `StatusHistory`.
- Expects `data.geometry.preview` and `data.geometry.polygon.outer/inner` from
  the backend extraction workflow.
- Warehouse/project ancestry is rendered by shared trace chrome from lineage;
  card bodies do not duplicate those parents as inline relation rows.
- Expects `attachments.primary` to point at the immutable capture photo. The
  detail surface renders it under the active geometry when calibration scale
  metadata is present. When the worker returns homography transform metadata,
  `PhotoGeometryOverlay` projects rectified geometry back onto the source photo
  for review and vertex editing.
- Creation can submit `data.prompt.outer` from a hand-drawn image-space contour;
  the worker treats it as a hard outer boundary. Facade quadrilateral prompts
  trigger perspective correction, while irregular remnant prompts remain the
  drawn polygon.
- Expects `data.revisions[]` and `data.activeRevisionId` when recalculation is
  available. The detail surface shows revision preview tiles under the active
  geometry, can queue a new preset-based recalculation, and can reactivate older
  successful revisions.
- Manual review edits can delete outer vertices and scale the full polygon from
  a corrected two-vertex dimension. Saving those edits posts a manual revision,
  which becomes the active geometry without creating a separate domain model.
- Preset options include model-first auto, explicit OpenCV, SAM2 automatic mask,
  and GroundingDINO+SAM2 variants for both remnant and facade captures.
  Model-backed presets fall back to OpenCV when the worker image is not built
  with model dependencies.
- Confirmation is not a generic status button. It calls the capture confirm API
  because remnant confirmation creates a `remnant` entity while facade
  confirmation only accepts a draft vector capture.

## Related

- [server/features/geometry-captures](../../../server/features/geometry-captures/README.md)
- [components/shared](../../shared/README.md)
