# COMPONENT: Geometry Captures

Photo-to-geometry capture records for remnant inventory and facade draft
workflows.

## Core Files

| File | Responsibility |
|---|---|
| `model.js` | `GeometryCapture` v24 entity wrapper. |
| `repository.js` | MongoDB access for `geometry_captures`, using flexible ids. |
| `service.js` | Capture creation, extraction task enqueueing, worker-result application, review updates, and confirmation. Lifecycle changes use workflow intents through `statusService`. |
| `server/api/geometry-captures/` | Authenticated CRUD/confirm/revision routes plus worker-result callback. |

## Data Contract

- `data.mode`: `REMNANT` or `FACADE`.
- `attachments.primary`: original immutable capture photo (`CAPTURE_PHOTO`).
- `data.calibration`: scale assumptions such as known size, sheet size, or
  facade floor count/height.
- `data.prompt`: optional normalized image-space prompt rings from operator
  hand drawing. The extraction task treats the outer ring as a hard boundary;
  facade quadrilaterals can drive homography-based perspective correction.
- `data.activeRevisionId`: accepted extraction revision currently projected
  into `data.geometry`.
- `data.revisions[]`: recalculation attempts with preset, task run, geometry,
  prompt, confidence, diagnostics, metrics, and failure state.
- `data.geometry.polygon.outer`: extracted closed outer ring in millimeters.
- `data.geometry.polygon.inner`: extracted closed hole rings in millimeters.
- `data.calibration.scale.transform`: optional worker transform metadata, such
  as homography matrices for projecting rectified geometry back onto the source
  photo.
- `data.geometry.preview`: `DrawingCanvas` preview generated from the polygon.
- `data.extraction`: task id, confidence, diagnostics, and worker status.
- `data.output`: created entity reference after confirmation.
- `specs`: computed width, height, and area.

## Workflow

1. Authenticated UI uploads a photo to the `capturePhotos` GridFS bucket. The
   UI may also submit a normalized hand-drawn outer contour prompt.
2. `create()` persists a `geometry_capture` with the workflow initial status,
   queues `vision.extractGeometry`, and applies the `queueExtraction` intent.
3. `workers/geometry-capture` claims the task for the pending revision. Prompted
   tasks use the drawn contour before model/OpenCV scoring. Auto presets try the
   model-backed provider order first when the ML worker image is enabled, then
   fall back to OpenCV contour extraction. Facade quadrilaterals are rectified
   into a working plane when a stable homography is available. The worker posts
   the result to the callback and completes/fails the task.
4. Worker results apply the `extractionReady` or `extractionFailed` intent.
   Failed recalculations with a previous active geometry return the capture to
   `READY` and keep the previous active geometry.
5. `confirm()` applies the `confirmGeometry` intent.
   - `REMNANT` creates a real `remnant` entity and increments warehouse remnant
     count.
   - `FACADE` stores the accepted draft only; facade entities are deferred.

Recalculation uses `POST /api/geometry-captures/:id/recalculate` with a detector
preset, optional calibration override, and optional prompt override. It appends
a new revision and queues a new `vision.extractGeometry` task using an
idempotency key scoped to that revision.
`POST /api/geometry-captures/:id/revisions/manual` stores an operator-edited
polygon as a ready revision, activates it immediately, and regenerates specs and
preview from the submitted geometry. `POST
/api/geometry-captures/:id/revisions/:revisionId/activate` switches
`data.activeRevisionId` back to any successful revision and refreshes the
denormalized geometry/specs fields through the `activateRevision` intent.

Remnant creation during `confirm()` is still service-local and is listed by the
architecture migration inventory as a remaining effect-policy migration target.

## Access

- Remnant captures inherit warehouse lineage and require `materials` access.
- Facade captures inherit project lineage and require `projects` access.
- Worker result callback requires `WORKER_TOKEN` and does not accept browser
  authentication.

## Related

- [remnants](../remnants/README.md)
- [workers/geometry-capture](../../../workers/geometry-capture/README.md)
- [components/entities/GeometryCapture](../../../components/entities/GeometryCapture/README.md)
