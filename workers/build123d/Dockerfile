# The build123d plugin's executor image: python + the installed engine.
# The engine pin matches catalog.json's provenance — regenerating the
# catalog against a newer build123d bumps this pin in the same change.
FROM python:3.14-slim

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir build123d==0.13.0

WORKDIR /src
COPY . /src/workers/build123d
EXPOSE 8793
CMD ["python3", "workers/build123d/server.py"]
