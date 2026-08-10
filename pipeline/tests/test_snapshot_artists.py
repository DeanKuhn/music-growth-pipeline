import datetime

import pytest
import requests

import snapshot_artists
from lastfm import ArtistNotFoundError


# --- week_anchor -------------------------------------------------------

@pytest.mark.parametrize("today,expected", [
    (datetime.date(2026, 8, 2), datetime.date(2026, 8, 2)),   # a Sunday
    (datetime.date(2026, 8, 8), datetime.date(2026, 8, 2)),   # a Saturday
    (datetime.date(2026, 8, 3), datetime.date(2026, 8, 2)),   # a Monday
])
def test_week_anchor(today, expected):
    assert snapshot_artists.week_anchor(today) == expected


# --- fetch_one -----------------------------------------------------------

def _canned_response(listeners=1000, playcount=5000):
    return {"artist": {"stats": {"listeners": str(listeners), "playcount": str(playcount)}}}


def test_fetch_one_success_with_mbid(monkeypatch):
    calls = []

    def fake_get_with_retry(params, **kwargs):
        calls.append(params)
        return _canned_response(listeners=42, playcount=100)

    monkeypatch.setattr(snapshot_artists, "get_with_retry", fake_get_with_retry)

    result = snapshot_artists.fetch_one(1, "Radiohead", "mbid-123", None, lambda: None)
    assert result == (1, 42, 100, None)
    assert len(calls) == 1
    assert calls[0] == {"method": "artist.getInfo", "mbid": "mbid-123"}


def test_fetch_one_no_mbid_uses_name(monkeypatch):
    calls = []

    def fake_get_with_retry(params, **kwargs):
        calls.append(params)
        return _canned_response()

    monkeypatch.setattr(snapshot_artists, "get_with_retry", fake_get_with_retry)

    snapshot_artists.fetch_one(1, "Some Artist", None, None, lambda: None)
    assert calls == [{"method": "artist.getInfo", "artist": "Some Artist"}]


def test_fetch_one_falls_back_from_stale_mbid_to_name(monkeypatch):
    # Regression test for the "+44" case found during B3 verification:
    # a stale mbid 404s even though the artist resolves fine by name.
    calls = []

    def fake_get_with_retry(params, **kwargs):
        calls.append(params)
        if "mbid" in params:
            raise ArtistNotFoundError("stale mbid")
        return _canned_response(listeners=732947, playcount=1)

    monkeypatch.setattr(snapshot_artists, "get_with_retry", fake_get_with_retry)

    result = snapshot_artists.fetch_one(4435, "+44", "stale-mbid", None, lambda: None)
    assert result == (4435, 732947, 1, None)
    assert calls == [
        {"method": "artist.getInfo", "mbid": "stale-mbid"},
        {"method": "artist.getInfo", "artist": "+44"},
    ]


def test_fetch_one_dead_when_both_mbid_and_name_fail(monkeypatch):
    def fake_get_with_retry(params, **kwargs):
        raise ArtistNotFoundError("gone")

    monkeypatch.setattr(snapshot_artists, "get_with_retry", fake_get_with_retry)

    result = snapshot_artists.fetch_one(241, "mangled name", "dead-mbid", None, lambda: None)
    assert result == (241, None, None, 6)


def test_fetch_one_transient_failure_returns_minus_one(monkeypatch):
    def fake_get_with_retry(params, **kwargs):
        raise requests.exceptions.ConnectionError("network blip")

    monkeypatch.setattr(snapshot_artists, "get_with_retry", fake_get_with_retry)

    result = snapshot_artists.fetch_one(1, "X", None, None, lambda: None)
    assert result == (1, None, None, -1)


def test_fetch_one_calls_get_session_itself(monkeypatch):
    monkeypatch.setattr(
        snapshot_artists, "get_with_retry",
        lambda params, **kwargs: _canned_response())

    calls = []
    def get_session():
        calls.append(1)
        return "session-obj"

    snapshot_artists.fetch_one(1, "X", None, None, get_session)
    assert calls == [1]


# --- snapshot worklist query -----------------------------------------------

class FakeConn:
    def __init__(self):
        self.commits = 0

    def commit(self):
        self.commits += 1


class RecordingCursor:
    def __init__(self):
        self.executed_sql = None
        self.executed_params = None

    def execute(self, sql, params=None):
        self.executed_sql = sql
        self.executed_params = params

    def fetchall(self):
        return []


def test_snapshot_worklist_filters_to_tracked_population():
    cur = RecordingCursor()
    conn = FakeConn()

    snapshot_artists.snapshot(conn, cur, snapshot_date=datetime.date(2026, 8, 9),
                               max_workers=1)

    sql = cur.executed_sql
    assert "weekly_charts" in sql
    assert "genre_artists" in sql
    assert "country_artists" in sql
    assert "artist_snapshots" in sql
    assert "last_error_code" in sql
    assert conn.commits == 1  # empty worklist still flushes/commits


# --- flush_batch -----------------------------------------------------------

class FakeCursor:
    pass


def test_flush_batch_writes_snapshots_and_dead_updates(monkeypatch):
    calls = []
    monkeypatch.setattr(
        snapshot_artists, "execute_values",
        lambda cur, sql, values: calls.append((sql.strip().splitlines()[0], values)),
    )

    conn = FakeConn()
    snapshot_artists.flush_batch(
        FakeCursor(), conn, datetime.date(2026, 8, 2),
        good_batch=[(1, 100, 200)], dead_batch=[241],
    )

    assert conn.commits == 1
    assert len(calls) == 2  # one insert, one dead-artist update
    insert_sql, insert_values = calls[0]
    assert "INSERT INTO artist_snapshots" in insert_sql
    assert insert_values == [(1, 100, 200, datetime.date(2026, 8, 2))]

    update_sql, update_values = calls[1]
    assert "UPDATE artists" in update_sql
    assert update_values == [(241,)]


def test_flush_batch_skips_empty_batches(monkeypatch):
    calls = []
    monkeypatch.setattr(snapshot_artists, "execute_values", lambda *a: calls.append(a))

    conn = FakeConn()
    snapshot_artists.flush_batch(FakeCursor(), conn, datetime.date(2026, 8, 2), [], [])

    assert calls == []
    assert conn.commits == 1  # still commits, even on a no-op flush
