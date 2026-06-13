import os
import time
import traceback
from urllib.parse import urljoin

import cv2
import numpy as np
import requests

from model_providers import MODEL_AUTO_ORDER, MODEL_PRESETS, build_model_candidates, build_prompt_candidates, preload_model_providers


API_URL = os.getenv("CUTKIT_API_URL", "http://localhost:3000").rstrip("/")
WORKER_TOKEN = os.getenv("WORKER_TOKEN", "")
WORKER_ID = os.getenv("GEOMETRY_CAPTURE_WORKER_ID", "geometry-capture-worker")
POLL_SECONDS = float(os.getenv("GEOMETRY_CAPTURE_POLL_SECONDS", "2"))
MODEL_FIRST = os.getenv("GEOMETRY_CAPTURE_MODEL_FIRST", "1") != "0"
PRELOAD_MODELS_ENV = os.getenv("GEOMETRY_CAPTURE_PRELOAD_MODELS")
PRELOAD_MODELS = PRELOAD_MODELS_ENV == "1" or (
    PRELOAD_MODELS_ENV in [None, "", "auto"] and os.getenv("GEOMETRY_CAPTURE_ML") == "1"
)

PRESETS = {
    "FACADE": [
        "facade_auto",
        "facade_grounded_sam2",
        "facade_sam2_auto",
        "facade_edges",
        "facade_threshold",
        "facade_windows_high_contrast",
    ],
    "REMNANT": [
        "remnant_auto",
        "remnant_sam2_auto",
        "remnant_grounded_sam2",
        "remnant_light_on_dark",
        "remnant_dark_on_light",
        "remnant_sheet_remainder",
    ],
}


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


def extract_geometry(image, mode, calibration, preset=None, revision_id=None, prompt=None):
    resized, resize_scale = resize_for_processing(image)
    selected_preset = normalize_preset(mode, preset)
    prompt_result = extract_prompt_constrained_geometry(resized, resize_scale, mode, calibration, selected_preset, revision_id, prompt)
    if prompt_result is not None:
        return prompt_result

    candidates, provider_errors = build_candidates(resized, mode, selected_preset, prompt)
    scored = []
    rejected = []
    for candidate in candidates:
        result = analyze_candidate(candidate, resize_scale, mode)
        if result is None:
            rejected.append(f"{candidate['name']}:no_contour")
            continue
        scored.append(result)

    if not scored:
        raise ValueError(f"No usable contour detected ({', '.join(rejected[:6])})")

    best = max(scored, key=lambda item: item["score"])
    outer_px = ensure_clockwise(close_ring(best["outer"]))
    rectified_result = extract_auto_facade_rectified_geometry(
        resized,
        resize_scale,
        mode,
        calibration,
        selected_preset,
        revision_id,
        outer_px,
        best,
    )
    if rectified_result is not None:
        return rectified_result

    holes_px = [ensure_counter_clockwise(close_ring(ring)) for ring in best["holes"] if len(ring) >= 4]
    outer_mm, holes_mm, scale_info = scale_polygon(outer_px, holes_px, calibration)

    confidence = score_confidence(outer_px, holes_px, mode, calibration, scale_info, best)
    diagnostics = [
        f"revision:{revision_id}" if revision_id else "revision:none",
        f"preset:{selected_preset}",
        f"provider:{best.get('provider', 'opencv')}",
        f"candidate:{best['name']}",
        f"candidate_score:{round(best['score'], 3)}",
        f"candidates:{len(scored)}",
        f"outer_vertices:{max(len(outer_mm) - 1, 0)}",
        f"holes:{len(holes_mm)}",
        f"scale_mode:{scale_info['mode']}",
    ]
    if has_outer_prompt(prompt):
        diagnostics.append("prompt:outer")
    if rejected:
        diagnostics.append(f"rejected:{len(rejected)}")
    diagnostics.extend(provider_errors[:3])
    return {
        "ok": True,
        "revisionId": revision_id,
        "preset": selected_preset,
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
        "diagnostics": diagnostics,
        "debug": {
            "pixelBounds": scale_info["pixelBounds"],
            "score": best["score"],
            "areaRatio": best["areaRatio"],
            "rectangularity": best["rectangularity"],
            "solidity": best["solidity"],
        },
    }


def extract_prompt_constrained_geometry(image, resize_scale, mode, calibration, preset, revision_id, prompt):
    if not has_outer_prompt(prompt):
        return None

    prompt_points = normalized_points_to_pixels(prompt.get("outer") or [], image.shape)
    if len(prompt_points) < 3:
        return None

    quad = prompt_quad(prompt_points, allow_box_fallback=False) if mode == "FACADE" else None
    if quad is not None:
        return extract_quad_rectified_geometry(
            image,
            resize_scale,
            mode,
            calibration,
            preset,
            revision_id,
            quad,
            "manual_prompt_perspective",
            "prompt_quad_rectified",
            1.0,
            0.98,
            ["prompt:outer", "perspective:homography"],
            {"areaRatio": 1.0, "rectangularity": 1.0, "solidity": 1.0},
        )

    outer_px = ensure_clockwise(close_ring(simplify_prompt_points(prompt_points, resize_scale)))
    if len(outer_px) < 4:
        return None
    outer_mm, holes_mm, scale_info = scale_polygon(outer_px, [], calibration)
    diagnostics = [
        f"revision:{revision_id}" if revision_id else "revision:none",
        f"preset:{preset}",
        "provider:manual_prompt",
        "candidate:prompt_polygon_hard",
        "candidate_score:1.0",
        "candidates:1",
        f"outer_vertices:{max(len(outer_mm) - 1, 0)}",
        "holes:0",
        f"scale_mode:{scale_info['mode']}",
        "prompt:outer",
        "perspective:none",
    ]
    return extraction_result(revision_id, preset, outer_mm, holes_mm, calibration, scale_info, 0.93, diagnostics, {
        "pixelBounds": scale_info["pixelBounds"],
        "score": 1.0,
        "areaRatio": None,
        "rectangularity": None,
        "solidity": None,
    })


def extraction_result(revision_id, preset, outer_mm, holes_mm, calibration, scale_info, confidence, diagnostics, debug):
    return {
        "ok": True,
        "revisionId": revision_id,
        "preset": preset,
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
        "diagnostics": diagnostics,
        "debug": debug,
    }


def extract_auto_facade_rectified_geometry(image, resize_scale, mode, calibration, preset, revision_id, outer_px, candidate):
    if mode != "FACADE":
        return None
    if candidate.get("rectangularity", 0) < 0.5 or candidate.get("solidity", 0) < 0.65:
        return None

    resized_points = [[point[0] * resize_scale, point[1] * resize_scale] for point in outer_px[:-1]]
    quad = prompt_quad(resized_points, allow_box_fallback=True)
    if quad is None:
        return None

    score = float(candidate.get("score") or 0)
    confidence = score_confidence(outer_px, candidate.get("holes") or [], mode, calibration, {"scaleX": 1, "scaleY": 1}, candidate)
    return extract_quad_rectified_geometry(
        image,
        resize_scale,
        mode,
        calibration,
        preset,
        revision_id,
        quad,
        candidate.get("provider", "opencv"),
        f"{candidate['name']}:rectified",
        score,
        confidence,
        ["perspective:auto_homography"],
        {
            "areaRatio": candidate.get("areaRatio"),
            "rectangularity": candidate.get("rectangularity"),
            "solidity": candidate.get("solidity"),
        },
    )


def extract_quad_rectified_geometry(image, resize_scale, mode, calibration, preset, revision_id, quad, provider, candidate_name, candidate_score, confidence, extra_diagnostics, debug_metrics):
    warped, warped_to_source, rectified_size = warp_prompt_quad(image, quad, resize_scale)
    outer_px = close_ring([
        [0.0, 0.0],
        [float(rectified_size[0]), 0.0],
        [float(rectified_size[0]), float(rectified_size[1])],
        [0.0, float(rectified_size[1])],
    ])
    holes_px = extract_rectified_holes(warped, mode, outer_px)
    outer_mm, holes_mm, scale_info = scale_polygon(outer_px, holes_px, calibration)
    scale_info["transform"] = {
        "type": "homography",
        "warpedToSource": matrix_to_list(warped_to_source),
        "warpedSize": [int(rectified_size[0]), int(rectified_size[1])],
        "sourceSize": [round(image.shape[1] / resize_scale, 3), round(image.shape[0] / resize_scale, 3)],
    }
    diagnostics = [
        f"revision:{revision_id}" if revision_id else "revision:none",
        f"preset:{preset}",
        f"provider:{provider}",
        f"candidate:{candidate_name}",
        f"candidate_score:{round(candidate_score, 3)}",
        "candidates:1",
        f"outer_vertices:{max(len(outer_mm) - 1, 0)}",
        f"holes:{len(holes_mm)}",
        f"scale_mode:{scale_info['mode']}",
        *extra_diagnostics,
    ]
    return extraction_result(revision_id, preset, outer_mm, holes_mm, calibration, scale_info, confidence, diagnostics, {
        "pixelBounds": scale_info["pixelBounds"],
        "score": round(candidate_score, 3),
        **debug_metrics,
    })


def normalize_preset(mode, preset):
    mode_presets = PRESETS.get(mode, PRESETS["REMNANT"])
    if preset in mode_presets:
        return preset
    return mode_presets[0]


def build_candidates(image, mode, preset, prompt=None):
    return build_candidates_for_preset(image, mode, preset, allow_model=True, prompt=prompt)


def build_candidates_for_preset(image, mode, preset, allow_model, prompt=None):
    provider_errors = []
    if has_outer_prompt(prompt):
        try:
            prompt_candidates = build_prompt_candidates(image, mode, preset, prompt)
            if prompt_candidates:
                return prompt_candidates, provider_errors
        except Exception as exc:
            provider_errors.append(f"prompt_provider_error:{exc}")

    if allow_model and preset.endswith("_auto") and MODEL_FIRST:
        model_candidates, model_errors = build_model_first_candidates(image, mode)
        provider_errors.extend(model_errors)
        if model_candidates:
            return model_candidates, provider_errors

    if allow_model and preset in MODEL_PRESETS.get(mode, []):
        try:
            candidates = build_model_candidates(image, mode, preset)
            if candidates:
                return candidates, provider_errors
            provider_errors.append(f"model_provider_empty:{preset}")
        except Exception as exc:
            provider_errors.append(f"model_provider_error:{preset}:{exc}")
        fallback = "facade_auto" if mode == "FACADE" else "remnant_auto"
        candidates, fallback_errors = build_candidates_for_preset(image, mode, fallback, allow_model=False, prompt=None)
        return candidates, [*provider_errors, *fallback_errors]

    if preset.endswith("_auto"):
        presets = [item for item in PRESETS.get(mode, []) if not item.endswith("_auto")]
        presets = [item for item in presets if item not in MODEL_PRESETS.get(mode, [])]
    else:
        presets = [preset]

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    normalized = normalize_light(gray)
    candidates = []
    for item in presets:
        candidates.extend(candidate_masks(normalized, mode, item))
    return candidates, provider_errors


def has_outer_prompt(prompt):
    return isinstance(prompt, dict) and len(prompt.get("outer") or []) >= 3


def normalized_points_to_pixels(points, shape):
    height, width = shape[:2]
    result = []
    for point in points:
        if isinstance(point, dict):
            x = point.get("x")
            y = point.get("y")
        else:
            x = point[0] if len(point) > 0 else None
            y = point[1] if len(point) > 1 else None
        try:
            nx = min(max(float(x), 0.0), 1.0)
            ny = min(max(float(y), 0.0), 1.0)
        except (TypeError, ValueError):
            continue
        result.append([nx * width, ny * height])
    return result


def prompt_quad(points, allow_box_fallback=False):
    contour = np.array(points, dtype=np.float32).reshape(-1, 1, 2)
    perimeter = cv2.arcLength(contour, True)
    for ratio in [0.02, 0.035, 0.055, 0.08]:
        approx = cv2.approxPolyDP(contour, max(perimeter * ratio, 2.0), True)
        if len(approx) == 4 and abs(cv2.contourArea(approx)) > 100:
            return order_quad(approx.reshape(4, 2).astype(np.float32))

    if not allow_box_fallback:
        return None

    rect = cv2.minAreaRect(contour)
    box = cv2.boxPoints(rect).astype(np.float32)
    if min(rect[1]) < 8:
        return None
    return order_quad(box)


def order_quad(points):
    points = np.array(points, dtype=np.float32)
    sums = points.sum(axis=1)
    diffs = np.diff(points, axis=1).reshape(-1)
    return np.array([
        points[np.argmin(sums)],
        points[np.argmin(diffs)],
        points[np.argmax(sums)],
        points[np.argmax(diffs)],
    ], dtype=np.float32)


def warp_prompt_quad(image, quad, resize_scale):
    top_width = np.linalg.norm(quad[1] - quad[0])
    bottom_width = np.linalg.norm(quad[2] - quad[3])
    left_height = np.linalg.norm(quad[3] - quad[0])
    right_height = np.linalg.norm(quad[2] - quad[1])
    target_width = int(max(top_width, bottom_width, 16))
    target_height = int(max(left_height, right_height, 16))
    dst = np.array([
        [0, 0],
        [target_width - 1, 0],
        [target_width - 1, target_height - 1],
        [0, target_height - 1],
    ], dtype=np.float32)
    source_to_warped = cv2.getPerspectiveTransform(quad, dst)
    warped_to_resized = cv2.getPerspectiveTransform(dst, quad)
    warped = cv2.warpPerspective(image, source_to_warped, (target_width, target_height))
    warped_to_source = warped_to_resized.copy()
    warped_to_source[0, :] = warped_to_source[0, :] / resize_scale
    warped_to_source[1, :] = warped_to_source[1, :] / resize_scale
    return warped, warped_to_source, (target_width - 1, target_height - 1)


def extract_rectified_holes(image, mode, outer_px):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    normalized = normalize_light(gray)
    presets = ["facade_windows_high_contrast", "facade_threshold"] if mode == "FACADE" else ["remnant_auto"]
    outer_contour = np.array(outer_px, dtype=np.float32).reshape(-1, 1, 2)
    outer_area = max(cv2.contourArea(outer_contour), 1.0)
    holes = []
    for preset in presets:
        for candidate in candidate_masks(normalized, mode, preset):
            contours, _ = cv2.findContours(candidate["mask"], cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for contour in contours:
                if not is_rectified_hole_candidate(contour, image.shape, outer_area, mode):
                    continue
                holes.append((cv2.contourArea(contour), approximate_contour(contour, 1.0, candidate["epsilonRatio"])))
    max_holes = 64 if mode == "FACADE" else 24
    return [ring for _, ring in sorted(holes, key=lambda item: item[0], reverse=True)[:max_holes]]


def is_rectified_hole_candidate(contour, shape, outer_area, mode):
    height, width = shape[:2]
    area = cv2.contourArea(contour)
    min_area = max(80.0, outer_area * (0.0015 if mode == "FACADE" else 0.0005))
    max_area = outer_area * (0.18 if mode == "FACADE" else 0.35)
    if area < min_area or area > max_area:
        return False
    x, y, w, h = cv2.boundingRect(contour)
    border_pad = max(4, int(min(width, height) * 0.015))
    if x <= border_pad or y <= border_pad or x + w >= width - border_pad or y + h >= height - border_pad:
        return False
    rectangularity = min(area / max(float(w * h), 1.0), 1.0)
    if mode == "FACADE":
        aspect = float(w) / max(float(h), 1.0)
        return rectangularity >= 0.45 and 0.2 <= aspect <= 6.0
    return rectangularity >= 0.25


def simplify_prompt_points(points, resize_scale):
    contour = np.array(points, dtype=np.float32).reshape(-1, 1, 2)
    perimeter = cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, max(perimeter * 0.006, 2.0), True)
    simplified = approx.reshape(-1, 2).astype(float) / resize_scale
    return [[round(float(x), 3), round(float(y), 3)] for x, y in simplified]


def build_model_first_candidates(image, mode):
    errors = []
    for provider_preset in MODEL_AUTO_ORDER.get(mode, []):
        try:
            candidates = build_model_candidates(image, mode, provider_preset)
            if candidates:
                return candidates, errors
            else:
                errors.append(f"model_provider_empty:{provider_preset}")
        except Exception as exc:
            errors.append(f"model_provider_error:{provider_preset}:{exc}")
    return [], errors


def normalize_light(gray):
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return clahe.apply(gray)


def candidate_masks(gray, mode, preset):
    masks = []
    if mode == "FACADE":
        if preset in ["facade_edges", "facade_windows_high_contrast"]:
            for low, high in [(30, 100), (45, 140), (70, 190)]:
                edges = cv2.Canny(gray, low, high)
                kernel = np.ones((5, 5), np.uint8)
                mask = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
                masks.append(mask_candidate(f"{preset}:canny:{low}-{high}", mask, 0.01))
        if preset in ["facade_threshold", "facade_windows_high_contrast"]:
            adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 5)
            masks.append(mask_candidate(f"{preset}:adaptive", clean_mask(adaptive, 3), 0.01))
            masks.append(mask_candidate(f"{preset}:adaptive_inv", clean_mask(cv2.bitwise_not(adaptive), 3), 0.01))
        _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        masks.append(mask_candidate(f"{preset}:otsu", clean_mask(otsu, 5), 0.01))
        masks.append(mask_candidate(f"{preset}:otsu_inv", clean_mask(cv2.bitwise_not(otsu), 5), 0.01))
        return masks

    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if preset in ["remnant_auto", "remnant_light_on_dark", "remnant_sheet_remainder"]:
        masks.append(mask_candidate(f"{preset}:light", clean_mask(otsu, 7), 0.012))
    if preset in ["remnant_auto", "remnant_dark_on_light", "remnant_sheet_remainder"]:
        masks.append(mask_candidate(f"{preset}:dark", clean_mask(cv2.bitwise_not(otsu), 7), 0.012))
    if preset == "remnant_sheet_remainder":
        edges = cv2.Canny(gray, 35, 120)
        masks.append(mask_candidate(f"{preset}:edges", clean_mask(edges, 5), 0.008))
    return masks


def clean_mask(mask, kernel_size):
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    return cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel, iterations=1)


def mask_candidate(name, mask, epsilon_ratio):
    return {"name": name, "mask": mask, "epsilonRatio": epsilon_ratio}


def analyze_candidate(candidate, resize_scale, mode):
    mask = candidate["mask"]
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_EXTERNAL if candidate.get("holeMasks") else cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None or not contours:
        return None

    hierarchy = hierarchy[0]
    outer_index = best_outer_contour(contours, hierarchy, mask.shape, mode)
    if outer_index is None:
        return None

    outer_contour = contours[outer_index]
    outer_area = max(cv2.contourArea(outer_contour), 1.0)
    image_area = float(mask.shape[0] * mask.shape[1])
    x, y, w, h = cv2.boundingRect(outer_contour)
    rectangularity = min(outer_area / max(float(w * h), 1.0), 1.0)
    hull_area = max(cv2.contourArea(cv2.convexHull(outer_contour)), 1.0)
    solidity = min(outer_area / hull_area, 1.0)
    outer_px = approximate_contour(outer_contour, resize_scale, candidate["epsilonRatio"])
    hole_candidates = hole_candidates_from_masks(candidate.get("holeMasks") or [], outer_contour, outer_area, resize_scale, candidate["epsilonRatio"], mode)
    if not hole_candidates:
        for index, item in enumerate(hierarchy):
            if index == outer_index:
                continue
            if not is_hole_candidate(contours[index], hierarchy[index], outer_contour, outer_area, mode):
                continue
            hole_candidates.append((
                cv2.contourArea(contours[index]),
                approximate_contour(contours[index], resize_scale, candidate["epsilonRatio"]),
            ))
    max_holes = 64 if mode == "FACADE" else 24
    holes_px = [ring for _, ring in sorted(hole_candidates, key=lambda item: item[0], reverse=True)[:max_holes]]

    vertices = max(len(outer_px), 0)
    area_ratio = outer_area / image_area
    vertex_score = 1.0 if 4 <= vertices <= 14 else max(0.2, 1.0 - abs(vertices - 8) * 0.08)
    coverage_score = min(area_ratio / 0.35, 1.0) if mode == "FACADE" else min(area_ratio / 0.55, 1.0)
    hole_score = min(len(holes_px) / 8.0, 1.0)
    if mode == "FACADE":
        score = coverage_score * 0.25 + rectangularity * 0.2 + solidity * 0.2 + vertex_score * 0.2 + hole_score * 0.15
    else:
        score = coverage_score * 0.35 + solidity * 0.3 + vertex_score * 0.2 + rectangularity * 0.15
    return {
        "name": candidate["name"],
        "score": score,
        "outer": outer_px,
        "holes": holes_px,
        "areaRatio": area_ratio,
        "rectangularity": rectangularity,
        "solidity": solidity,
        "provider": candidate.get("provider", "opencv"),
    }


def resize_for_processing(image):
    height, width = image.shape[:2]
    max_side = max(width, height)
    if max_side <= 1800:
        return image, 1.0
    scale = 1800.0 / max_side
    return cv2.resize(image, (int(width * scale), int(height * scale))), scale


def best_outer_contour(contours, hierarchy, shape, mode):
    best_index = None
    best_score = 0
    image_area = float(shape[0] * shape[1])
    for index, item in enumerate(hierarchy):
        if int(item[3]) != -1:
            continue
        contour = contours[index]
        area = cv2.contourArea(contour)
        area_ratio = area / image_area
        if area_ratio < 0.01:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        rectangularity = min(area / max(float(w * h), 1.0), 1.0)
        hull_area = max(cv2.contourArea(cv2.convexHull(contour)), 1.0)
        solidity = min(area / hull_area, 1.0)
        score = area_ratio + solidity * 0.35 + rectangularity * (0.2 if mode == "FACADE" else 0.1)
        if score > best_score:
            best_score = score
            best_index = index
    return best_index


def is_hole_candidate(contour, hierarchy_item, outer_contour, outer_area, mode):
    area = cv2.contourArea(contour)
    min_area = max(120.0, outer_area * (0.002 if mode == "FACADE" else 0.0005))
    if area < min_area:
        return False
    if area > outer_area * (0.25 if mode == "FACADE" else 0.4):
        return False
    x, y, w, h = cv2.boundingRect(contour)
    if mode == "FACADE" and (w < 12 or h < 12):
        return False
    aspect = float(w) / max(float(h), 1.0)
    if mode == "FACADE" and (aspect < 0.2 or aspect > 6.0):
        return False
    rectangularity = min(area / max(float(w * h), 1.0), 1.0)
    center = (float(x + w / 2.0), float(y + h / 2.0))
    if cv2.pointPolygonTest(outer_contour, center, False) < 0:
        return False
    if mode == "FACADE":
        return rectangularity >= 0.5
    return int(hierarchy_item[3]) >= 0


def hole_candidates_from_masks(hole_masks, outer_contour, outer_area, resize_scale, epsilon_ratio, mode):
    candidates = []
    for mask in hole_masks:
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            if not is_hole_candidate(contour, [0, 0, 0, 0], outer_contour, outer_area, mode):
                continue
            candidates.append((
                cv2.contourArea(contour),
                approximate_contour(contour, resize_scale, epsilon_ratio),
            ))
    return candidates


def approximate_contour(contour, resize_scale, epsilon_ratio=0.012):
    perimeter = cv2.arcLength(contour, True)
    epsilon = max(perimeter * epsilon_ratio, 2.0)
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


def score_confidence(outer, holes, mode, calibration, scale_info, candidate):
    score = 0.45
    vertices = max(len(outer) - 1, 0)
    if vertices >= 4:
        score += 0.15
    if mode == "FACADE" and holes:
        score += 0.1
    if candidate.get("score"):
        score += min(candidate["score"], 1.0) * 0.15
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


def matrix_to_list(matrix):
    return [[round(float(value), 8) for value in row] for row in matrix.tolist()]


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
        result = extract_geometry(
            image,
            parameters.get("mode", "REMNANT"),
            parameters.get("calibration") or {},
            parameters.get("preset"),
            parameters.get("revisionId"),
            parameters.get("prompt") or {},
        )
        post_capture_result(capture_id, result)
        complete_task(run, {
            "entities": [{"type": "geometry_capture", "id": capture_id}],
            "data": result,
        })
    except Exception as exc:
        failure = {
            "ok": False,
            "revisionId": parameters.get("revisionId"),
            "preset": parameters.get("preset"),
            "error": str(exc),
            "diagnostics": [traceback.format_exc(limit=3)],
        }
        try:
            post_capture_result(capture_id, failure)
        finally:
            fail_task(run, exc)


def main():
    if not WORKER_TOKEN:
        raise RuntimeError("WORKER_TOKEN is required")
    print(f"[geometry-capture] polling {API_URL} as {WORKER_ID}", flush=True)
    if PRELOAD_MODELS:
        try:
            preload_model_providers()
            print("[geometry-capture] model providers preloaded", flush=True)
        except Exception as exc:
            print(f"[geometry-capture] model preload failed; OpenCV fallback remains available: {exc}", flush=True)
    while True:
        try:
            run = claim_task()
        except Exception as exc:
            print(f"[geometry-capture] claim failed: {exc}", flush=True)
            time.sleep(POLL_SECONDS)
            continue
        if not run:
            time.sleep(POLL_SECONDS)
            continue
        print(f"[geometry-capture] claimed {run['_id']}", flush=True)
        process_run(run)


if __name__ == "__main__":
    main()
