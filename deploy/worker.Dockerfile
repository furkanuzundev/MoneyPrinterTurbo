FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY app ./app
COPY worker ./worker
COPY resource ./resource
COPY config.example.toml ./
# config.toml sunucuda volume ile bağlanır (API key'ler içerir)
ENV PYTHONPATH=/app
CMD ["uv", "run", "--no-sync", "python", "-m", "worker.main"]
