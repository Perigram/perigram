FROM python:3.11-slim

WORKDIR /app
ARG GEOMETRY_CAPTURE_ML=0

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
        && pip install --no-cache-dir -r /app/requirements-ml.txt; \
    fi

COPY workers/geometry-capture /app

CMD ["python", "main.py"]
