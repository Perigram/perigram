import os

import cv2
import numpy as np


MODEL_PRESETS = {
    "FACADE": ["facade_sam2_auto", "facade_grounded_sam2"],
    "REMNANT": ["remnant_sam2_auto", "remnant_grounded_sam2"],
}

MODEL_AUTO_ORDER = {
    "FACADE": ["facade_grounded_sam2", "facade_sam2_auto"],
    "REMNANT": ["remnant_sam2_auto", "remnant_grounded_sam2"],
}

PROMPTS = {
    "FACADE": {
        "outer": "building facade. wall.",
        "holes": "window. door. opening.",
    },
    "REMNANT": {
        "outer": "sheet metal remnant. metal offcut. material sheet.",
        "holes": "hole. cutout. opening.",
    },
}

_SAM2_AUTO = None
_SAM2_PREDICTOR = None
_GROUNDING = None


def build_model_candidates(image, mode, preset):
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    if preset.endswith("_sam2_auto"):
        return sam2_auto_candidates(rgb, mode, preset)
    if preset.endswith("_grounded_sam2"):
        return grounded_sam2_candidates(rgb, mode, preset)
    return []


def build_prompt_candidates(image, mode, preset, prompt):
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    fallback = prompt_mask_candidate(rgb.shape, mode, preset, prompt)
    candidates = []
    try:
        candidates.extend(prompted_sam2_candidates(rgb, mode, preset, prompt))
    except Exception:
        candidates = []
    if fallback:
        candidates.append(fallback)
    return candidates


def preload_model_providers():
    for preset in sorted({preset for presets in MODEL_AUTO_ORDER.values() for preset in presets}):
        mode = "FACADE" if preset.startswith("facade_") else "REMNANT"
        if preset.endswith("_sam2_auto"):
            get_sam2_auto_generator()
        elif preset.endswith("_grounded_sam2"):
            get_sam2_predictor()
            get_grounding_model()


def sam2_auto_candidates(rgb, mode, preset):
    generator = get_sam2_auto_generator()
    masks = generator.generate(rgb)
    image_area = float(rgb.shape[0] * rgb.shape[1])
    candidates = []
    for index, item in enumerate(sorted(masks, key=lambda mask: mask.get("area", 0), reverse=True)[:16]):
        mask = bool_mask_to_u8(item.get("segmentation"))
        if mask is None:
            continue
        area_ratio = float(item.get("area", np.count_nonzero(mask))) / image_area
        if area_ratio < (0.02 if mode == "FACADE" else 0.005):
            continue
        candidates.append({
            "name": f"{preset}:sam2:{index}",
            "mask": mask,
            "holeMasks": [],
            "epsilonRatio": 0.008 if mode == "FACADE" else 0.012,
            "provider": "sam2",
        })
    return candidates


def grounded_sam2_candidates(rgb, mode, preset):
    detections = detect_grounded_boxes(rgb, mode)
    outer_boxes = detections["outer"]
    hole_boxes = detections["holes"]
    if not outer_boxes:
        return []

    predictor = get_sam2_predictor()
    predictor.set_image(rgb)
    candidates = []
    for index, box in enumerate(outer_boxes[:6]):
        outer_mask = predict_sam2_box_mask(predictor, box)
        if outer_mask is None:
            continue
        hole_masks = []
        for hole_box in hole_boxes[:80]:
            if box_center_inside(hole_box, box):
                hole_mask = predict_sam2_box_mask(predictor, hole_box)
                if hole_mask is not None:
                    hole_masks.append(hole_mask)
        candidates.append({
            "name": f"{preset}:grounded:{index}",
            "mask": outer_mask,
            "holeMasks": hole_masks,
            "epsilonRatio": 0.008 if mode == "FACADE" else 0.012,
            "provider": "grounding_dino+sam2",
        })
    return candidates


def prompted_sam2_candidates(rgb, mode, preset, prompt):
    points = normalized_points_to_pixels(prompt.get("outer") or [], rgb.shape)
    if len(points) < 3:
        return []

    predictor = get_sam2_predictor()
    predictor.set_image(rgb)
    box = points_box(points)
    positive = sample_prompt_points(points)
    masks, scores, _ = predictor.predict(
        point_coords=np.array(positive, dtype=np.float32),
        point_labels=np.ones((len(positive),), dtype=np.int32),
        box=np.array(box, dtype=np.float32),
        multimask_output=True,
    )
    if masks is None or len(masks) == 0:
        return []

    hole_masks = []
    if mode == "FACADE":
        try:
            for hole_box in detect_grounded_boxes(rgb, mode)["holes"][:80]:
                if box_center_inside(hole_box, box):
                    hole_mask = predict_sam2_box_mask(predictor, hole_box)
                    if hole_mask is not None:
                        hole_masks.append(hole_mask)
        except Exception:
            hole_masks = []

    candidates = []
    order = np.argsort(scores)[::-1] if scores is not None and len(scores) else range(len(masks))
    for index in list(order)[:3]:
        candidates.append({
            "name": f"{preset}:prompted_sam2:{index}",
            "mask": bool_mask_to_u8(masks[index]),
            "holeMasks": hole_masks,
            "epsilonRatio": 0.007 if mode == "FACADE" else 0.01,
            "provider": "sam2_prompt",
        })
    return candidates


def prompt_mask_candidate(shape, mode, preset, prompt):
    points = normalized_points_to_pixels(prompt.get("outer") or [], shape)
    if len(points) < 3:
        return None
    mask = np.zeros(shape[:2], dtype=np.uint8)
    cv2.fillPoly(mask, [np.array(points, dtype=np.int32)], 255)
    return {
        "name": f"{preset}:prompt_polygon",
        "mask": mask,
        "holeMasks": [],
        "epsilonRatio": 0.002,
        "provider": "manual_prompt",
    }


def get_sam2_auto_generator():
    global _SAM2_AUTO
    if _SAM2_AUTO is not None:
        return _SAM2_AUTO
    try:
        from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
    except Exception as exc:
        raise RuntimeError(f"SAM2 automatic mask generator is not installed: {exc}") from exc

    model_id = os.getenv("SAM2_MODEL_ID", "facebook/sam2-hiera-large")
    device = os.getenv("SAM2_DEVICE", "cpu")
    if hasattr(SAM2AutomaticMaskGenerator, "from_pretrained"):
        _SAM2_AUTO = SAM2AutomaticMaskGenerator.from_pretrained(model_id, device=device)
        return _SAM2_AUTO

    checkpoint = os.getenv("SAM2_CHECKPOINT")
    model_cfg = os.getenv("SAM2_MODEL_CFG")
    if not checkpoint or not model_cfg:
        raise RuntimeError("SAM2_CHECKPOINT and SAM2_MODEL_CFG are required for automatic mask generation")
    from sam2.build_sam import build_sam2

    _SAM2_AUTO = SAM2AutomaticMaskGenerator(build_sam2(model_cfg, checkpoint, device=device))
    return _SAM2_AUTO


def get_sam2_predictor():
    global _SAM2_PREDICTOR
    if _SAM2_PREDICTOR is not None:
        return _SAM2_PREDICTOR
    try:
        from sam2.sam2_image_predictor import SAM2ImagePredictor
    except Exception as exc:
        raise RuntimeError(f"SAM2 image predictor is not installed: {exc}") from exc

    model_id = os.getenv("SAM2_MODEL_ID", "facebook/sam2-hiera-large")
    device = os.getenv("SAM2_DEVICE", "cpu")
    if hasattr(SAM2ImagePredictor, "from_pretrained"):
        _SAM2_PREDICTOR = SAM2ImagePredictor.from_pretrained(model_id, device=device)
        return _SAM2_PREDICTOR

    checkpoint = os.getenv("SAM2_CHECKPOINT")
    model_cfg = os.getenv("SAM2_MODEL_CFG")
    if not checkpoint or not model_cfg:
        raise RuntimeError("SAM2_CHECKPOINT and SAM2_MODEL_CFG are required for prompted segmentation")
    from sam2.build_sam import build_sam2

    _SAM2_PREDICTOR = SAM2ImagePredictor(build_sam2(model_cfg, checkpoint, device=device))
    return _SAM2_PREDICTOR


def get_grounding_model():
    global _GROUNDING
    if _GROUNDING is not None:
        return _GROUNDING
    try:
        import torch
        from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor
    except Exception as exc:
        raise RuntimeError(f"GroundingDINO dependencies are not installed: {exc}") from exc

    model_id = os.getenv("GROUNDING_DINO_MODEL", "IDEA-Research/grounding-dino-tiny")
    device = os.getenv("GROUNDING_DINO_DEVICE", os.getenv("SAM2_DEVICE", "cpu"))
    processor = AutoProcessor.from_pretrained(model_id)
    model = AutoModelForZeroShotObjectDetection.from_pretrained(model_id).to(device)
    model.eval()
    _GROUNDING = {"torch": torch, "processor": processor, "model": model, "device": device}
    return _GROUNDING


def detect_grounded_boxes(rgb, mode):
    from PIL import Image

    grounding = get_grounding_model()
    processor = grounding["processor"]
    torch = grounding["torch"]
    device = grounding["device"]
    image = Image.fromarray(rgb)

    outer = run_grounding_prompt(image, PROMPTS[mode]["outer"], processor, grounding["model"], torch, device)
    holes = run_grounding_prompt(image, PROMPTS[mode]["holes"], processor, grounding["model"], torch, device)
    return {"outer": outer, "holes": holes}


def run_grounding_prompt(image, prompt, processor, model, torch, device):
    inputs = processor(images=image, text=prompt, return_tensors="pt").to(device)
    with torch.no_grad():
        outputs = model(**inputs)
    target_sizes = torch.tensor([image.size[::-1]], device=device)
    if hasattr(processor, "post_process_grounded_object_detection"):
        result = processor.post_process_grounded_object_detection(
            outputs,
            inputs.input_ids,
            box_threshold=float(os.getenv("GROUNDING_DINO_BOX_THRESHOLD", "0.25")),
            text_threshold=float(os.getenv("GROUNDING_DINO_TEXT_THRESHOLD", "0.25")),
            target_sizes=target_sizes,
        )[0]
    else:
        result = processor.post_process_object_detection(
            outputs,
            threshold=float(os.getenv("GROUNDING_DINO_BOX_THRESHOLD", "0.25")),
            target_sizes=target_sizes,
        )[0]
    boxes = result.get("boxes", [])
    return [box.detach().cpu().numpy().astype(float).tolist() for box in boxes]


def predict_sam2_box_mask(predictor, box):
    masks, scores, _ = predictor.predict(box=np.array(box, dtype=np.float32), multimask_output=True)
    if masks is None or len(masks) == 0:
        return None
    best_index = int(np.argmax(scores)) if scores is not None and len(scores) else 0
    return bool_mask_to_u8(masks[best_index])


def bool_mask_to_u8(mask):
    if mask is None:
        return None
    result = np.asarray(mask)
    if result.ndim != 2:
        return None
    return (result.astype(np.uint8) * 255)


def box_center_inside(inner, outer):
    cx = (inner[0] + inner[2]) / 2.0
    cy = (inner[1] + inner[3]) / 2.0
    return outer[0] <= cx <= outer[2] and outer[1] <= cy <= outer[3]


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


def points_box(points):
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def sample_prompt_points(points):
    cx = sum(point[0] for point in points) / len(points)
    cy = sum(point[1] for point in points) / len(points)
    stride = max(1, len(points) // 6)
    return [[cx, cy], *points[::stride][:6]]
