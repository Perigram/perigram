# Stage 1: Build the Rust binary
FROM rust:1.83 as builder

RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-dev build-essential libssl-dev git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the specific worker folder from root context
COPY workers/nesting/ .

# Fallback: if jagua-rs is empty (submodule not cloned by build server), clone it manually
RUN if [ ! -f jagua-rs/Cargo.toml ]; then \
    echo "Submodule jagua-rs missing, cloning manually..." && \
    rm -rf jagua-rs && \
    git clone https://github.com/JeroenGar/jagua-rs.git jagua-rs; \
    fi

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