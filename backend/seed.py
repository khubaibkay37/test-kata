"""Create repeatable local demo records without resetting workshop changes."""
from werkzeug.security import generate_password_hash

from store import connect, migrate

ACCOUNTS = [
    ('Amina', 'amina@example.test', 'customer'),
    ('Bilal', 'bilal@example.test', 'customer'),
    ('Sara', 'sara@example.test', 'agent'),
    ('Omar', 'omar@example.test', 'agent'),
]
TICKETS = [
    ('amina@example.test', 'Invoice export is missing rows',
     'Our October export stops at row 200. We need the full report before Friday.', 'high'),
    ('bilal@example.test', 'Update our billing contact',
     'Please change the billing contact to finance@example.test. Account reference: DEMO-204.', 'medium'),
    ('amina@example.test', 'Dashboard takes too long to load',
     'The overview takes around 12 seconds after signing in.', 'medium'),
    ('bilal@example.test', 'Change the weekly digest',
     'We would prefer the digest on Monday morning instead of Friday.', 'low'),
]


def seed():
    with connect() as db:
        db.execute('SELECT pg_advisory_xact_lock(40122)')
        migrate(db)
        for name, email, role in ACCOUNTS:
            db.execute('INSERT INTO users(name,email,password_hash,role) VALUES (%s,%s,%s,%s) ON CONFLICT(email) DO NOTHING',
                       (name, email, generate_password_hash('workshop123'), role))
        if not db.execute('SELECT 1 FROM tickets LIMIT 1').fetchone():
            for email, subject, description, priority in TICKETS:
                db.execute('INSERT INTO tickets(customer_id,subject,description,priority,created_at) SELECT id,%s,%s,%s,%s FROM users WHERE email=%s',
                           (subject, description, priority, '2026-10-22T09:00:00Z', email))
