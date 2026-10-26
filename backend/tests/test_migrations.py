import psycopg
import pytest

import store
from store import connect, migrate


def assignee_column(db):
    return db.execute("SELECT is_nullable FROM information_schema.columns WHERE table_name='tickets' AND column_name='assignee_id'").fetchone()


def test_assignee_is_optional():
    with connect() as db:
        assert assignee_column(db)['is_nullable'] == 'YES'


def test_every_migration_file_is_recorded():
    with connect() as db:
        recorded = [row['name'] for row in db.execute('SELECT name FROM schema_migrations ORDER BY name').fetchall()]
    assert recorded == sorted(path.name for path in store.MIGRATIONS.glob('*.sql'))


def test_upgrading_a_database_that_predates_a_migration_preserves_tickets():
    with connect() as db:
        before = db.execute('SELECT id,subject,description,customer_id FROM tickets ORDER BY id').fetchall()
        db.execute('ALTER TABLE tickets DROP COLUMN assignee_id')
        db.execute("DELETE FROM schema_migrations WHERE name='002-ticket-assignee.sql'")
        migrate(db)
        assert assignee_column(db) is not None
        assert db.execute('SELECT id,subject,description,customer_id FROM tickets ORDER BY id').fetchall() == before
        assert db.execute('SELECT count(*) AS count FROM tickets WHERE assignee_id IS NOT NULL').fetchone()['count'] == 0


def test_adopting_a_database_without_migration_history_is_safe():
    with connect() as db:
        db.execute("UPDATE tickets SET assignee_id=(SELECT id FROM users WHERE email='sara@example.test') WHERE id=1")
        db.execute('DROP TABLE schema_migrations')
        migrate(db)
        assert db.execute('SELECT count(*) AS count FROM schema_migrations').fetchone()['count'] == len(list(store.MIGRATIONS.glob('*.sql')))
        assert db.execute('SELECT assignee_id FROM tickets WHERE id=1').fetchone()['assignee_id'] is not None
        db.execute('UPDATE tickets SET assignee_id=NULL WHERE id=1')


def test_each_migration_runs_once_and_in_filename_order(tmp_path, monkeypatch):
    (tmp_path / '900-b.sql').write_text('INSERT INTO migration_probe VALUES (2); CREATE TABLE once_only ();')
    (tmp_path / '899-a.sql').write_text('CREATE TABLE migration_probe (step int); INSERT INTO migration_probe VALUES (1);')
    monkeypatch.setattr(store, 'MIGRATIONS', tmp_path)
    with connect() as db:
        migrate(db)
        migrate(db)  # a second run would fail on the non-idempotent CREATE TABLE
        assert [row['step'] for row in db.execute('SELECT step FROM migration_probe').fetchall()] == [1, 2]
        db.rollback()


def test_assignee_must_reference_an_existing_user():
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        with connect() as db:
            db.execute('UPDATE tickets SET assignee_id=9999 WHERE id=1')
