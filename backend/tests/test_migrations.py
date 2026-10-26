import psycopg
import pytest

from store import connect, migrate


def assignee_column(db):
    return db.execute("SELECT is_nullable FROM information_schema.columns WHERE table_name='tickets' AND column_name='assignee_id'").fetchone()


def test_assignee_is_optional_and_existing_tickets_start_unassigned():
    with connect() as db:
        assert assignee_column(db)['is_nullable'] == 'YES'
        assert db.execute('SELECT count(*) AS count FROM tickets WHERE assignee_id IS NULL').fetchone()['count'] == 4


def test_migrating_an_existing_database_preserves_tickets():
    with connect() as db:
        before = db.execute('SELECT id,subject,description,customer_id FROM tickets ORDER BY id').fetchall()
        db.execute('ALTER TABLE tickets DROP COLUMN assignee_id')
        assert assignee_column(db) is None
        migrate(db)
        assert assignee_column(db) is not None
        assert db.execute('SELECT id,subject,description,customer_id FROM tickets ORDER BY id').fetchall() == before
        assert db.execute('SELECT count(*) AS count FROM tickets WHERE assignee_id IS NOT NULL').fetchone()['count'] == 0


def test_migrations_are_safe_to_apply_repeatedly_and_keep_assignments():
    with connect() as db:
        db.execute("UPDATE tickets SET assignee_id=(SELECT id FROM users WHERE email='sara@example.test') WHERE id=1")
        migrate(db)
        migrate(db)
        assert db.execute('SELECT assignee_id FROM tickets WHERE id=1').fetchone()['assignee_id'] is not None
        db.execute('UPDATE tickets SET assignee_id=NULL WHERE id=1')


def test_assignee_must_reference_an_existing_user():
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        with connect() as db:
            db.execute('UPDATE tickets SET assignee_id=9999 WHERE id=1')
