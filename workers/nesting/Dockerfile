# Stage 1: Build the Rust binary
FROM rust:1.83 AS builder

ARG BUILD_HTTP_PROXY
ARG BUILD_HTTPS_PROXY
ARG BUILD_NO_PROXY=localhost,127.0.0.1
ENV HTTP_PROXY=${BUILD_HTTP_PROXY} \
    HTTPS_PROXY=${BUILD_HTTPS_PROXY} \
    NO_PROXY=${BUILD_NO_PROXY}

RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-dev build-essential libssl-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the worker source (supports root or nesting context)
COPY ./ ./

WORKDIR /app/workers/nesting/jagua-rs
RUN cargo build --release

# Stage 2: Create the final runtime image
FROM python:3.11-slim

ARG BUILD_HTTP_PROXY
ARG BUILD_HTTPS_PROXY
ARG BUILD_NO_PROXY=localhost,127.0.0.1
ENV HTTP_PROXY=${BUILD_HTTP_PROXY} \
    HTTPS_PROXY=${BUILD_HTTPS_PROXY} \
    NO_PROXY=${BUILD_NO_PROXY}

# Create a non-root user
RUN groupadd -r appuser && useradd -m -r -g appuser appuser
WORKDIR /app

# Upgrade pip
RUN pip install --upgrade pip

# Copy requirements from local context
COPY workers/nesting/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
ENV HTTP_PROXY= HTTPS_PROXY= NO_PROXY=

# Copy the built lbf binary
COPY --from=builder /app/workers/nesting/jagua-rs/target/release/lbf /usr/local/bin/lbf
RUN chmod +x /usr/local/bin/lbf

# Copy the Python application code
COPY workers/nesting/ .

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
