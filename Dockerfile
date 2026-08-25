# ── Stage 1: Build Rust backend ──
FROM rust:1.96-slim-bookworm AS rust-builder
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
COPY migration/ migration/
RUN cargo build --release -p loco && \
    cp target/release/loco-cli /usr/local/bin/loco-cli

# ── Stage 2: Build frontend ──
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# ── Stage 3: Runtime ──
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=rust-builder /usr/local/bin/loco-cli /usr/local/bin/loco-cli
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
COPY config/ /app/config/
WORKDIR /app
EXPOSE 5150
CMD ["loco-cli", "start"]
