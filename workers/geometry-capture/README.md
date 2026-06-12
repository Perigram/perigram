# CONTAINER: Geometry Capture Worker

OpenCV polling worker for `vision.extractGeometry` task runs.

## Responsibility

- Claims `vision.extractGeometry` through `/api/tasks/claim`.
- Downloads the immutable capture photo from GridFS through the app file route.
- Extracts a draft polygon with contour hierarchy:
  - outer contour becomes `polygon.outer`
  - child contours become `polygon.inner` holes
- Applies calibration into millimeter coordinates.
- Posts the extracted geometry to `/api/geometry-captures/:id/worker-result`.
- Completes or fails the task run through the task protocol.

This worker produces draft-grade geometry. The application keeps the result in a
review state until an operator confirms it.

## Environment

| Variable | Purpose |
|---|---|
| `CUTKIT_API_URL` | App base URL, default `http://localhost:3000`. |
| `WORKER_TOKEN` | Shared worker token matching the app. |
| `GEOMETRY_CAPTURE_WORKER_ID` | Optional stable worker id. |

## Related

- [workers](../README.md)
- [server/features/geometry-captures](../../server/features/geometry-captures/README.md)
