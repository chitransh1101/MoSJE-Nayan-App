#!/bin/sh
set -e

echo "Waiting for database..."
python -c "
import time
import sys
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from app.core.config import settings

for attempt in range(30):
    try:
        create_engine(settings.DATABASE_URL).connect().close()
        print('Database is ready.')
        sys.exit(0)
    except OperationalError:
        print(f'  attempt {attempt + 1}/30 - database not ready yet, retrying...')
        time.sleep(2)
print('Database never became ready - exiting.')
sys.exit(1)
"

echo "Running migrations..."
alembic upgrade head

# Opt-in only (RUN_SEED_ON_START=true) - the seed script already checks
# for existing data and no-ops if the database isn't empty, so this is
# safe to leave set across restarts; it just means the FIRST boot on a
# fresh database populates demo data automatically, which matters on
# platforms like Render's free tier where there's no shell access to run
# it manually.
if [ "$RUN_SEED_ON_START" = "true" ]; then
    echo "RUN_SEED_ON_START=true - running seed script..."
    python -m app.seed.seed_data
fi

echo "Starting API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
