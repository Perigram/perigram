FROM python:3.11-slim

WORKDIR /app
ARG GEOMETRY_CAPTURE_ML=0
ENV PIP_DEFAULT_TIMEOUT=120 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    GEOMETRY_CAPTURE_ML=${GEOMETRY_CAPTURE_ML}

RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY workers/geometry-capture/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY workers/geometry-capture/requirements-ml.txt /app/requirements-ml.txt
RUN if [ "$GEOMETRY_CAPTURE_ML" = "1" ]; then \
        apt-get update \
        && apt-get install -y --no-install-recommends build-essential \
        && rm -rf /var/lib/apt/lists/* \
        && pip install --no-cache-dir --retries 2 --timeout 120 -r /app/requirements-ml.txt \
        && python -c "import torch; import transformers; from PIL import Image; from sam2.sam2_image_predictor import SAM2ImagePredictor; from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator; print('geometry capture ml deps ok')"; \
    fi

COPY workers/geometry-capture /app

CMD ["python", "main.py"]
