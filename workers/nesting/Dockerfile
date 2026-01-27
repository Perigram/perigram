# Stage 1: Build the Rust binary
FROM rustlang/rust:nightly as builder

RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-dev build-essential libssl-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the entire worker directory (including submodules if present)
COPY workers/nesting/ .

# We need to ensure jagua-rs is present. 
# If Railway doesn't clone submodules, this will still fail at build time, 
# but we avoid the "manual clone" mess and let the build fail fast with a clear error.
WORKDIR /app/jagua-rs
RUN cargo build --release

# Stage 2: Create the final runtime image
FROM python:3.11-slim

# Create a non-root user
RUN groupadd -r appuser && useradd -m -r -g appuser appuser
WORKDIR /app

# Upgrade pip
RUN pip install --upgrade pip

# Copy requirements from the root-relative path
COPY workers/nesting/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the built lbf binary
COPY --from=builder /app/jagua-rs/target/release/lbf /usr/local/bin/lbf
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