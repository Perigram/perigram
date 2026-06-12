import os
import time
import traceback
from urllib.parse import urljoin

import cv2
import numpy as np
import requests


API_URL = os.getenv("CUTKIT_API_URL", "http://localhost:3000").rstrip("/")
WORKER_TOKEN = os.getenv("WORKER_TOKEN", "")
WORKER_ID = os.getenv("GEOMETRY_CAPTURE_WORKER_ID", "geometry-capture-worker")
POLL_SECONDS = float(os.getenv("GEOMETRY_CAPTURE_POLL_SECONDS", "2"))


def headers():
    return {"x-worker-token": WORKER_TOKEN}


def api_url(path):
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return urljoin(f"{API_URL}/", path.lstrip("/"))


def claim_task():
    response = requests.post(
        api_url("/api/tasks/claim"),
        json={
            "taskId": "vision.extractGeometry",
            "workerType": "geometry-capture",
            "workerId": WORKER_ID,
            "leaseMs": 300000,
        },
        headers=headers(),
        timeout=20,
    )
    response.raise_for_status()
    return response.json().get("run")


def complete_task(run, result):
    response = requests.post(
        api_url(f"/api/tasks/{run['_id']}/complete"),
        json={"claimToken": run["claimToken"], "result": result},
        headers=headers(),
        timeout=20,
    )
    response.raise_for_status()


def fail_task(run, error):
    response = requests.post(
        api_url(f"/api/tasks/{run['_id']}/fail"),
        json={"claimToken": run["claimToken"], "message": str(error)},
        headers=headers(),
        timeout=20,
    )
    response.raise_for_status()


def post_capture_result(capture_id, result):
    response = requests.post(
        api_url(f"/api/geometry-captures/{capture_id}/worker-result"),
        json={"result": result},
        headers=headers(),
        timeout=30,
    )
    response.raise_for_status()


def download_image(file_url):
    response = requests.get(api_url(file_url), timeout=60)
    response.raise_for_status()
    image_data = np.frombuffer(response.content, dtype=np.uint8)
    image = cv2.imdecode(image_data, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Uploaded capture photo is not a readable image")
    return image


def extract_geometry(image, mode, calibration):
    resized, resize_scale = resize_for_processing(image)
    mask = foreground_mask(resized, mode)
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None or not contours:
        raise ValueError("No usable contour detected")

    hierarchy = hierarchy[0]
    outer_index = largest_outer_contour(contours, hierarchy)
    if outer_index is None:
        raise ValueError("No outer contour detected")

    outer_px = approximate_contour(contours[outer_index], resize_scale)
    holes_px = []
    for index, item in enumerate(hierarchy):
        parent = int(item[3])
        if parent != outer_index:
            continue
        area = cv2.contourArea(contours[index]) / (resize_scale * resize_scale)
        if area < 150:
            continue
        holes_px.append(approximate_contour(contours[index], resize_scale))

    outer_px = ensure_clockwise(close_ring(outer_px))
    holes_px = [ensure_counter_clockwise(close_ring(ring)) for ring in holes_px if len(ring) >= 4]
    outer_mm, holes_mm, scale_info = scale_polygon(outer_px, holes_px, calibration)

    confidence = score_confidence(outer_px, holes_px, mode, calibration, scale_info)
    return {
        "ok": True,
        "geometry": {
            "polygon": {
                "outer": outer_mm,
                "inner": holes_mm,
            }
        },
        "calibration": {
            **(calibration or {}),
            "scale": scale_info,
        },
        "confidence": confidence,
        "diagnostics": [
            f"outer_vertices:{max(len(outer_mm) - 1, 0)}",
            f"holes:{len(holes_mm)}",
            f"scale_mode:{scale_info['mode']}",
        ],
    }


def resize_for_processing(image):
    height, width = image.shape[:2]
    max_side = max(width, height)
    if max_side <= 1800:
        return image, 1.0
    scale = 1800.0 / max_side
    return cv2.resize(image, (int(width * scale), int(height * scale))), scale


def foreground_mask(image, mode):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    if mode == "FACADE":
        edges = cv2.Canny(gray, 40, 120)
        kernel = np.ones((5, 5), np.uint8)
        return cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)

    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    inverted = cv2.bitwise_not(thresh)
    chosen = inverted if border_foreground_score(inverted) < border_foreground_score(thresh) else thresh
    kernel = np.ones((7, 7), np.uint8)
    chosen = cv2.morphologyEx(chosen, cv2.MORPH_CLOSE, kernel, iterations=2)
    return cv2.morphologyEx(chosen, cv2.MORPH_OPEN, kernel, iterations=1)


def border_foreground_score(mask):
    top = mask[0, :]
    bottom = mask[-1, :]
    left = mask[:, 0]
    right = mask[:, -1]
    return float(np.mean(np.concatenate([top, bottom, left, right])) / 255.0)


def largest_outer_contour(contours, hierarchy):
    best_index = None
    best_area = 0
    for index, item in enumerate(hierarchy):
        if int(item[3]) != -1:
            continue
        area = cv2.contourArea(contours[index])
        if area > best_area:
            best_area = area
            best_index = index
    return best_index


def approximate_contour(contour, resize_scale):
    perimeter = cv2.arcLength(contour, True)
    epsilon = max(perimeter * 0.012, 2.0)
    approx = cv2.approxPolyDP(contour, epsilon, True)
    points = approx.reshape(-1, 2).astype(float) / resize_scale
    return [[round(float(x), 3), round(float(y), 3)] for x, y in points]


def scale_polygon(outer, holes, calibration):
    bounds = bounds_for_ring(outer)
    mode = calibration.get("mode") or "knownDimension"
    known_width = number_or_none(calibration.get("knownWidth"))
    known_height = number_or_none(calibration.get("knownHeight"))

    if mode == "sheetRemainder":
        known_width = number_or_none(calibration.get("sheetWidth")) or known_width
        known_height = number_or_none(calibration.get("sheetHeight")) or known_height
    elif mode == "facadeFloors":
        floors = number_or_none(calibration.get("floorCount"))
        floor_height = number_or_none(calibration.get("floorHeight"))
        if floors and floor_height:
            known_height = floors * floor_height

    if not known_width and not known_height:
        raise ValueError("Calibration requires knownWidth, knownHeight, sheet size, or facade floor count/height")

    scale_x = known_width / bounds["width"] if known_width else known_height / bounds["height"]
    scale_y = known_height / bounds["height"] if known_height else scale_x

    def convert(ring):
        return [
            [
                round((point[0] - bounds["min_x"]) * scale_x, 3),
                round((point[1] - bounds["min_y"]) * scale_y, 3),
            ]
            for point in ring
        ]

    return convert(outer), [convert(ring) for ring in holes], {
        "mode": mode,
        "pixelBounds": bounds,
        "scaleX": scale_x,
        "scaleY": scale_y,
    }


def score_confidence(outer, holes, mode, calibration, scale_info):
    score = 0.45
    vertices = max(len(outer) - 1, 0)
    if vertices >= 4:
        score += 0.15
    if mode == "FACADE" and holes:
        score += 0.1
    if scale_info.get("scaleX") and scale_info.get("scaleY"):
        score += 0.15
    if calibration.get("knownWidth") and calibration.get("knownHeight"):
        score += 0.1
    return min(round(score, 3), 0.95)


def close_ring(ring):
    if not ring:
        return []
    return ring if ring[0] == ring[-1] else [*ring, ring[0]]


def signed_area(ring):
    area = 0.0
    for i in range(len(ring) - 1):
        area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return area / 2.0


def ensure_clockwise(ring):
    return list(reversed(ring)) if signed_area(ring) > 0 else ring


def ensure_counter_clockwise(ring):
    return list(reversed(ring)) if signed_area(ring) < 0 else ring


def bounds_for_ring(ring):
    xs = [point[0] for point in ring]
    ys = [point[1] for point in ring]
    min_x = min(xs)
    max_x = max(xs)
    min_y = min(ys)
    max_y = max(ys)
    return {
        "min_x": min_x,
        "min_y": min_y,
        "max_x": max_x,
        "max_y": max_y,
        "width": max(max_x - min_x, 1.0),
        "height": max(max_y - min_y, 1.0),
    }


def number_or_none(value):
    try:
        number = float(value)
        return number if number > 0 else None
    except (TypeError, ValueError):
        return None


def process_run(run):
    parameters = run.get("input", {}).get("parameters", {})
    entities = run.get("input", {}).get("entities", {})
    capture_id = entities.get("geometryCapture")
    if not capture_id:
        raise ValueError("Task run missing geometryCapture entity id")

    try:
        image = download_image(parameters["fileUrl"])
        result = extract_geometry(image, parameters.get("mode", "REMNANT"), parameters.get("calibration") or {})
        post_capture_result(capture_id, result)
        complete_task(run, {
            "entities": [{"type": "geometry_capture", "id": capture_id}],
            "data": result,
        })
    except Exception as exc:
        failure = {"ok": False, "error": str(exc), "diagnostics": [traceback.format_exc(limit=3)]}
        try:
            post_capture_result(capture_id, failure)
        finally:
            fail_task(run, exc)


def main():
    if not WORKER_TOKEN:
        raise RuntimeError("WORKER_TOKEN is required")
    print(f"[geometry-capture] polling {API_URL} as {WORKER_ID}", flush=True)
    while True:
        run = claim_task()
        if not run:
            time.sleep(POLL_SECONDS)
            continue
        print(f"[geometry-capture] claimed {run['_id']}", flush=True)
        process_run(run)


if __name__ == "__main__":
    main()
