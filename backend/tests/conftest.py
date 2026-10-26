import pytest

from app import create_app
from seed import seed
from store import connect, migrate


@pytest.fixture(scope='session', autouse=True)
def demo_data():
    with connect() as db:
        migrate(db)
        db.execute('TRUNCATE users,tickets,sessions RESTART IDENTITY CASCADE')
    seed()


@pytest.fixture
def client():
    app = create_app()
    app.config['TESTING'] = True
    with connect() as db:
        db.execute('DELETE FROM sessions')
    return app.test_client()


@pytest.fixture
def login(client):
    def perform(email='sara@example.test', password='workshop123', **kwargs):
        return client.post('/api/login', json={'email': email, 'password': password}, **kwargs)
    return perform
