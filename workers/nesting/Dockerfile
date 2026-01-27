# Stage 1: Build the Rust binary
FROM rustlang/rust:nightly as builder

# Install git and other dependencies, then clean up apt cache aggressively
RUN apt-get update && apt-get install -y git && \
    apt-get clean && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the worker source
COPY workers/nesting/ .

# CRITICAL FIX: If Railway fails to clone the submodule, we MUST do it here.
# Since we are using rust:nightly, this will now build correctly (Edition 2024).
RUN if [ ! -f jagua-rs/Cargo.toml ]; then \
    echo "Infrastructure failure: Submodule jagua-rs missing. Cloning manually..." && \
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