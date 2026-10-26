import threading

import pytest

from app import create_app
from store import connect

SARA, OMAR = 3, 4  # seeded user ids


def assignee_of(ticket_id):
    with connect() as db:
        return db.execute('SELECT assignee_id FROM tickets WHERE id=%s', (ticket_id,)).fetchone()['assignee_id']


def assigned_count():
    with connect() as db:
        return db.execute('SELECT count(*) AS count FROM tickets WHERE assignee_id IS NOT NULL').fetchone()['count']


def session_for(email):
    """An independent browser session: its own app client and cookie."""
    client = create_app().test_client()
    assert client.post('/api/login', json={'email': email, 'password': 'workshop123'}).status_code == 200
    return client


def test_agent_claims_an_unassigned_ticket_and_it_persists(client, login):
    assert client.get('/api/tickets/1').status_code == 401
    login()
    assert client.get('/api/tickets/1').json['assignee'] is None
    response = client.post('/api/tickets/1/assign')
    assert response.status_code == 200
    assert response.json['id'] == 1 and response.json['assignee_id'] == SARA and response.json['assignee'] == 'Sara'
    assert assignee_of(1) == SARA
    assert client.get('/api/tickets/1').json['assignee'] == 'Sara'
    assert next(t for t in client.get('/api/tickets').json if t['id'] == 1)['assignee'] == 'Sara'
    assert next(t for t in client.get('/api/tickets').json if t['id'] == 2)['assignee'] is None
    # A different agent's session reads the saved result.
    assert session_for('omar@example.test').get('/api/tickets/1').json['assignee'] == 'Sara'


def test_assignee_comes_from_the_session_not_the_request(client, login):
    login()
    response = client.post('/api/tickets/1/assign', json={'assignee_id': OMAR, 'user_id': OMAR})
    assert response.status_code == 200
    assert assignee_of(1) == SARA


def test_anonymous_claim_is_rejected_without_change(client):
    response = client.post('/api/tickets/1/assign')
    assert response.status_code == 401
    assert response.json == {'error': 'Sign in to continue.'}
    assert assigned_count() == 0


@pytest.mark.parametrize('ticket_id', [1, 9999])
def test_customer_claim_is_rejected_without_change(client, login, ticket_id):
    login('amina@example.test')
    response = client.post(f'/api/tickets/{ticket_id}/assign')
    assert response.status_code == 403  # also for a missing ticket: customers learn nothing about ids
    assert response.json == {'error': 'Only support agents can assign tickets.'}
    assert assigned_count() == 0


@pytest.mark.parametrize('ticket_id', [9999, 9999999999999999])
def test_claiming_a_missing_ticket_fails_without_change(client, login, ticket_id):
    login()
    response = client.post(f'/api/tickets/{ticket_id}/assign')
    assert response.status_code == 404
    assert response.json == {'error': 'Ticket not found.'}
    assert assigned_count() == 0


def test_claiming_an_assigned_ticket_conflicts_and_preserves_the_original(client, login):
    login()
    assert client.post('/api/tickets/1/assign').status_code == 200
    again = client.post('/api/tickets/1/assign')
    assert again.status_code == 409
    assert again.json == {'error': 'This ticket is already assigned to Sara.'}
    omar = session_for('omar@example.test')
    stale = omar.post('/api/tickets/1/assign')
    assert stale.status_code == 409
    assert 'Sara' in stale.json['error']
    assert assignee_of(1) == SARA
    assert omar.post('/api/tickets/2/assign').status_code == 200  # other tickets stay claimable
    assert assignee_of(2) == OMAR


def test_simultaneous_claims_have_exactly_one_winner():
    sessions = {SARA: session_for('sara@example.test'), OMAR: session_for('omar@example.test')}
    for _ in range(15):
        with connect() as db:
            db.execute('UPDATE tickets SET assignee_id=NULL WHERE id=1')
        barrier = threading.Barrier(2)
        results = {}

        def claim(user_id):
            barrier.wait()
            results[user_id] = sessions[user_id].post('/api/tickets/1/assign').status_code

        threads = [threading.Thread(target=claim, args=(user_id,)) for user_id in sessions]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert sorted(results.values()) == [200, 409]
        winner = next(user_id for user_id, status in results.items() if status == 200)
        assert assignee_of(1) == winner
