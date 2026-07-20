FROM python:3.11-slim

WORKDIR /workspace

# Install system dependencies needed for python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create volume storage for files index and ChromaDB disk persist
RUN mkdir -p storage/documents chromadb_store

# Harden security: Run as non-root user
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -d /workspace -s /bin/bash appuser && \
    chown -R appuser:appgroup /workspace

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
