# COMPONENT: Geometry Captures

Photo-to-geometry capture records for remnant inventory and facade draft
workflows.

## Core Files

| File | Responsibility |
|---|---|
| `model.js` | `GeometryCapture` v24 entity wrapper. |
| `repository.js` | MongoDB access for `geometry_captures`, using flexible ids. |
| `service.js` | Capture creation, extraction task enqueueing, worker-result application, review updates, and confirmation. |
| `server/api/geometry-captures/` | Authenticated CRUD/confirm routes plus worker-result callback. |

## Data Contract

- `data.mode`: `REMNANT` or `FACADE`.
- `attachments.primary`: original immutable capture photo (`CAPTURE_PHOTO`).
- `data.calibration`: scale assumptions such as known size, sheet size, or
  facade floor count/height.
- `data.geometry.polygon.outer`: extracted closed outer ring in millimeters.
- `data.geometry.polygon.inner`: extracted closed hole rings in millimeters.
- `data.geometry.preview`: `DrawingCanvas` preview generated from the polygon.
- `data.extraction`: task id, confidence, diagnostics, and worker status.
- `data.output`: created entity reference after confirmation.
- `specs`: computed width, height, and area.

## Workflow

1. Authenticated UI uploads a photo to the `capturePhotos` GridFS bucket.
2. `create()` persists a `geometry_capture` and queues
   `vision.extractGeometry`.
3. `workers/geometry-capture` claims the task, runs OpenCV contour extraction,
   posts the result to the worker callback, and completes/fails the task.
4. The capture moves to `READY` for review or `FAILED` for correction/retry.
5. `confirm()` moves the capture to `COMPLETE`.
   - `REMNANT` creates a real `remnant` entity and increments warehouse remnant
     count.
   - `FACADE` stores the accepted draft only; facade entities are deferred.

## Access

- Remnant captures inherit warehouse lineage and require `materials` access.
- Facade captures inherit project lineage and require `projects` access.
- Worker result callback requires `WORKER_TOKEN` and does not accept browser
  authentication.

## Related

- [remnants](../remnants/README.md)
- [workers/geometry-capture](../../../workers/geometry-capture/README.md)
- [components/entities/GeometryCapture](../../../components/entities/GeometryCapture/README.md)
