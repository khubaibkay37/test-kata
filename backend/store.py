"""Database connections shared by the API and demo-data command."""
import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

MIGRATIONS = Path(__file__).resolve().parent.parent / 'database/migrations'


def connect():
    return psycopg.connect(os.environ['DATABASE_URL'], row_factory=dict_row)


def migrate(db):
    """Apply every migration in filename order; each file is idempotent, so this is safe on every start."""
    for path in sorted(MIGRATIONS.glob('*.sql')):
        db.execute(path.read_text())
