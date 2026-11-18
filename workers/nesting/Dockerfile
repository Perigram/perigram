# Stage 1: Build the Rust binary
FROM rust:1.83 AS builder

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy

# Use the host CA bundle for HTTPS through TLS-inspecting build proxies.
# Keep certificate verification enabled; never work around proxy trust errors
# by disabling TLS verification.
RUN --mount=type=secret,id=build_ca_bundle,target=/tmp/build-ca-bundle,required=true \
    apt-get update -o Acquire::https::CAInfo=/tmp/build-ca-bundle && \
    apt-get install -y --no-install-recommends ca-certificates \
      python3 python3-pip python3-dev build-essential libssl-dev && \
    cat /tmp/build-ca-bundle >> /etc/ssl/certs/ca-certificates.crt && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the worker source (supports root or nesting context)
COPY ./ ./

WORKDIR /app/workers/nesting/jagua-rs
RUN --mount=type=secret,id=build_ca_bundle,target=/tmp/build-ca-bundle,required=true \
    CARGO_HTTP_CAINFO=/tmp/build-ca-bundle SSL_CERT_FILE=/tmp/build-ca-bundle cargo build --release

# Stage 2: Create the final runtime image
FROM python:3.11-slim

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG http_proxy
ARG https_proxy
ARG no_proxy

# Create a non-root user
RUN groupadd -r appuser && useradd -m -r -g appuser appuser
WORKDIR /app

# Trust the same host CA bundle in the final runtime image.
RUN --mount=type=secret,id=build_ca_bundle,target=/tmp/build-ca-bundle,required=true \
    cat /tmp/build-ca-bundle >> /etc/ssl/certs/ca-certificates.crt

# Upgrade pip
RUN --mount=type=secret,id=build_ca_bundle,target=/tmp/build-ca-bundle,required=true \
    PIP_CERT=/tmp/build-ca-bundle pip install --upgrade pip

# Copy requirements from local context
COPY workers/nesting/requirements.txt .
RUN --mount=type=secret,id=build_ca_bundle,target=/tmp/build-ca-bundle,required=true \
    PIP_CERT=/tmp/build-ca-bundle pip install --no-cache-dir -r requirements.txt

# Copy the built lbf binary
COPY --from=builder /app/workers/nesting/jagua-rs/target/release/lbf /usr/local/bin/lbf
RUN chmod +x /usr/local/bin/lbf

# Copy the Python application code
COPY workers/nesting/ ./

# Change ownership of the app directory to the non-root user
RUN chown -R appuser:appuser /app

# Set HOME environment variable for the non-root user
ENV HOME=/home/appuser

# Switch to non-root user
USER appuser

# Verify lbf is available
RUN lbf --help || echo "lbf help check failed"

EXPOSE 8000

CMD ["uvicorn", "worker_service:app", "--host", "0.0.0.0", "--port", "8000"]
