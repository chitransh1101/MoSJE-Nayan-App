FROM python:3.12-slim

WORKDIR /app

# System deps needed by psycopg2 (Postgres driver) and Pillow (imagehash/tamper detection)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev libjpeg-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Runs migrations then starts the API - see docker-compose.yml for the
# db-wait behavior that makes this safe on first boot.
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
