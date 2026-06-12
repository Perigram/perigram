# CONTAINER: Geometry Capture Worker

OpenCV polling worker for `vision.extractGeometry` task runs.

## Responsibility

- Claims `vision.extractGeometry` through `/api/tasks/claim`.
- Downloads the immutable capture photo from GridFS through the app file route.
- Extracts a draft polygon through deterministic preset candidates:
  - outer contour becomes `polygon.outer`
  - child/window-like contours become `polygon.inner` holes
- Applies calibration into millimeter coordinates.
- Posts the extracted geometry to `/api/geometry-captures/:id/worker-result`
  with the source `revisionId` and detector preset.
- Completes or fails the task run through the task protocol.
- Retries task claiming while the app is still warming up instead of exiting.

This worker produces draft-grade geometry. The application keeps the result in a
review state until an operator confirms it.

## Detector Presets

- Facade: `facade_auto`, `facade_edges`, `facade_threshold`,
  `facade_windows_high_contrast`.
- Remnant: `remnant_auto`, `remnant_light_on_dark`,
  `remnant_dark_on_light`, `remnant_sheet_remainder`.

`*_auto` runs the mode-specific presets and picks the highest scoring candidate.
Candidates are scored from contour coverage, rectangularity, solidity, vertex
count, and facade hole/window count. Results include compact diagnostics such as
selected preset, candidate, score, rejected candidate count, and scale mode.

## Environment

| Variable | Purpose |
|---|---|
| `CUTKIT_API_URL` | App base URL, default `http://localhost:3000`. |
| `WORKER_TOKEN` | Shared worker token matching the app. |
| `GEOMETRY_CAPTURE_WORKER_ID` | Optional stable worker id. |

## Docker

`docker-compose.dev.yml` starts this worker with the app stack. For host-run app
development, `docker-compose.local.yml` starts it against
`http://host.docker.internal:3000` by default.

## Related

- [workers](../README.md)
- [server/features/geometry-captures](../../server/features/geometry-captures/README.md)
