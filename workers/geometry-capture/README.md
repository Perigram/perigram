# CONTAINER: Geometry Capture Worker

Polling worker for `vision.extractGeometry` task runs. Auto presets are
model-first when the ML worker image is enabled, with OpenCV as the fallback and
explicit deterministic preset family.

## Responsibility

- Claims `vision.extractGeometry` through `/api/tasks/claim`.
- Downloads the immutable capture photo from GridFS through the app file route.
- Applies optional normalized hand-drawn prompt rings from the task parameters
  before falling back to automatic model/OpenCV candidates.
- Extracts a draft polygon through deterministic or model-backed preset
  candidates:
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

- Facade: `facade_auto`, `facade_grounded_sam2`, `facade_sam2_auto`,
  `facade_edges`, `facade_threshold`, `facade_windows_high_contrast`.
- Remnant: `remnant_auto`, `remnant_sam2_auto`, `remnant_grounded_sam2`,
  `remnant_light_on_dark`, `remnant_dark_on_light`,
  `remnant_sheet_remainder`.

`*_auto` first tries the mode-specific model provider order:

- Facade: `facade_grounded_sam2`, then `facade_sam2_auto`.
- Remnant: `remnant_sam2_auto`, then `remnant_grounded_sam2`.

If no model provider produces candidates, auto falls back to the OpenCV preset
family and picks the highest scoring candidate. Candidates are scored from
contour coverage, rectangularity, solidity, vertex count, and facade
hole/window count. Results include compact diagnostics such as selected preset,
provider, candidate, score, rejected candidate count, and scale mode.

Prompted tasks run the SAM2 image predictor from the drawn outer contour first
and keep a manual prompt-mask candidate as fallback, so a rough operator sketch
can constrain detection even when model inference is unavailable.
`*_sam2_auto` uses SAM2 automatic masks as candidate outer polygons.
`*_grounded_sam2` uses GroundingDINO text prompts for the outer object and
holes/windows, then SAM2 turns the detected boxes into masks. If a model preset
is selected but model dependencies or checkpoints are unavailable, the worker
falls back to OpenCV and records `model_provider_error:*` diagnostics in the
revision. Set `GEOMETRY_CAPTURE_MODEL_FIRST=0` to force OpenCV auto behavior.

## Environment

| Variable | Purpose |
|---|---|
| `CUTKIT_API_URL` | App base URL, default `http://localhost:3000`. |
| `WORKER_TOKEN` | Shared worker token matching the app. |
| `GEOMETRY_CAPTURE_WORKER_ID` | Optional stable worker id. |
| `GEOMETRY_CAPTURE_ML` | `1` when the worker image includes ML dependencies; also enables model preload by default. |
| `GEOMETRY_CAPTURE_MODEL_FIRST` | `1` by default; set `0` to keep auto presets on OpenCV only. |
| `GEOMETRY_CAPTURE_PRELOAD_MODELS` | `auto`/unset preloads only with `GEOMETRY_CAPTURE_ML=1`; set `0` to skip startup preload or `1` to force it. |
| `SAM2_MODEL_ID` | Hugging Face SAM2 model id, default `facebook/sam2-hiera-large` for higher-quality local model-first extraction. |
| `SAM2_CHECKPOINT` / `SAM2_MODEL_CFG` | Optional local SAM2 checkpoint/config for APIs that do not support `from_pretrained`. |
| `SAM2_DEVICE` | `cpu` by default; set to `cuda` only in a GPU worker image. |
| `GROUNDING_DINO_MODEL` | Hugging Face GroundingDINO model id, default `IDEA-Research/grounding-dino-tiny`. |
| `GROUNDING_DINO_DEVICE` | `cpu` by default. |
| `GROUNDING_DINO_BOX_THRESHOLD` / `GROUNDING_DINO_TEXT_THRESHOLD` | Prompt detection thresholds, default `0.25`. |

## Docker

`docker-compose.dev.yml` starts this worker with the app stack. For host-run app
development, `docker-compose.local.yml` starts it against
`http://host.docker.internal:3000` by default.

Model dependencies are opt-in because Torch/SAM2/GroundingDINO are large:

```bash
GEOMETRY_CAPTURE_ML=1 docker compose -f docker-compose.dev.yml up -d --build geometry-capture-worker
```

`requirements-ml.txt` keeps the PyTorch CPU wheel index configured while using
plain Torch/Torchvision version pins, because the CPU index now resolves those
versions without the local `+cpu` suffix.

The project `start-dev.sh` and `build-images.sh` scripts default
`GEOMETRY_CAPTURE_ML` to `1` for this worker, so script-driven local/dev image
builds run the model-first worker unless `GEOMETRY_CAPTURE_ML=0` is set.
`build-images.sh` tags the image as
`ghcr.io/1suo/geometry-capture-worker:latest`; the stack files run the same
image with the model cache mounted at `/models`.

Compose mounts `geometry-model-cache` at `/models` and sets `HF_HOME` there so
downloaded Hugging Face weights survive container rebuilds. With
`GEOMETRY_CAPTURE_ML=1`, the worker preloads SAM2 and GroundingDINO at startup
unless `GEOMETRY_CAPTURE_PRELOAD_MODELS=0`.

## Related

- [workers](../README.md)
- [server/features/geometry-captures](../../server/features/geometry-captures/README.md)
