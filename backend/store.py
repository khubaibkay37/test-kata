"""Database access shared by the API and demo-data command: connections, migrations, and ticket reads."""
import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

MIGRATIONS = Path(__file__).resolve().parent.parent / 'database/migrations'


def connect():
    return psycopg.connect(os.environ['DATABASE_URL'], row_factory=dict_row)


def migrate(db):
    """Apply each migration file once, in filename order, recording it in schema_migrations.

    Databases created before this table existed re-run their files once, so every
    migration must also stay idempotent (IF NOT EXISTS) to adopt them safely.
    """
    db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    applied = {row['name'] for row in db.execute('SELECT name FROM schema_migrations').fetchall()}
    for path in sorted(MIGRATIONS.glob('*.sql')):
        if path.name not in applied:
            db.execute(path.read_text())
            db.execute('INSERT INTO schema_migrations(name) VALUES (%s)', (path.name,))


# The one definition of a ticket as the API returns it. Add new ticket fields here.
TICKET_SELECT = (
    'SELECT t.id,t.customer_id,t.subject,t.description,t.priority,t.created_at,u.name AS customer,'
    't.assignee_id,a.name AS assignee '
    'FROM tickets t JOIN users u ON u.id=t.customer_id LEFT JOIN users a ON a.id=t.assignee_id'
)


def list_tickets(db):
    return db.execute(f'{TICKET_SELECT} ORDER BY t.id').fetchall()


def get_ticket(db, ticket_id):
    return db.execute(f'{TICKET_SELECT} WHERE t.id=%s', (ticket_id,)).fetchone()


def claim_ticket(db, ticket_id, user_id):
    """Assign an unassigned ticket to user_id; True only if this call won the claim.

    The assignee_id IS NULL test and the write are one statement, so under
    concurrent claims Postgres lets exactly one UPDATE match the row.
    """
    cursor = db.execute('UPDATE tickets SET assignee_id=%s WHERE id=%s AND assignee_id IS NULL', (user_id, ticket_id))
    return cursor.rowcount == 1
