import requests
import responses
import pytest

from lastfm import (
    ArtistNotFoundError,
    TokenBucket,
    _escape_literal_plus,
    get_with_retry,
    BASE_URL,
)


# --- TokenBucket ---------------------------------------------------------

def test_token_bucket_starts_full_and_depletes():
    bucket = TokenBucket(rate=4.0, capacity=5.0)
    for _ in range(5):
        bucket.acquire()  # should not block, capacity=5 tokens available
    assert bucket.tokens < 1


def test_token_bucket_refills_over_time(monkeypatch):
    fake_now = [1000.0]
    monkeypatch.setattr("lastfm.time.monotonic", lambda: fake_now[0])

    bucket = TokenBucket(rate=4.0, capacity=5.0)
    for _ in range(5):
        bucket.acquire()
    assert bucket.tokens < 1

    fake_now[0] += 1.0  # 1s at 4 tokens/s = 4 tokens refilled
    bucket.acquire()
    assert bucket.tokens == pytest.approx(3.0, abs=0.01)


def test_token_bucket_blocks_when_empty(monkeypatch):
    real_time = [1000.0]
    sleep_calls = []

    def fake_monotonic():
        return real_time[0]

    def fake_sleep(seconds):
        sleep_calls.append(seconds)
        real_time[0] += seconds  # simulate time passing during sleep

    monkeypatch.setattr("lastfm.time.monotonic", fake_monotonic)
    monkeypatch.setattr("lastfm.time.sleep", fake_sleep)

    bucket = TokenBucket(rate=4.0, capacity=1.0)
    bucket.acquire()  # drains the single token
    bucket.acquire()  # must wait for a refill
    assert len(sleep_calls) > 0


# --- _escape_literal_plus --------------------------------------------------

def test_escape_literal_plus_encodes_plus_in_strings():
    result = _escape_literal_plus({"artist": "+44", "method": "artist.getInfo"})
    assert result["artist"] == "%2B44"
    assert result["method"] == "artist.getInfo"


def test_escape_literal_plus_leaves_non_strings_untouched():
    result = _escape_literal_plus({"limit": 5, "artist": "Omar+"})
    assert result["limit"] == 5
    assert result["artist"] == "Omar%2B"


def test_escape_literal_plus_round_trips_to_double_encoded_wire_value():
    # requests' own quote_plus pass turns a literal '%' into '%25', so
    # pre-escaping '+' -> '%2B' here must produce '%252B' on the wire —
    # confirmed against the live API to be what Last.fm actually expects
    # for artist "+44" (see lastfm.py's _escape_literal_plus docstring).
    from urllib.parse import urlencode
    escaped = _escape_literal_plus({"artist": "+44"})
    wire = urlencode(escaped)
    assert wire == "artist=%252B44"


# --- get_with_retry --------------------------------------------------------

@responses.activate
def test_get_with_retry_success_first_try():
    responses.add(responses.GET, BASE_URL, json={"artist": {"name": "Radiohead"}}, status=200)
    data = get_with_retry({"method": "artist.getInfo", "artist": "Radiohead"})
    assert data["artist"]["name"] == "Radiohead"
    assert len(responses.calls) == 1


@responses.activate
def test_get_with_retry_retries_on_429_then_succeeds(monkeypatch):
    monkeypatch.setattr("lastfm.time.sleep", lambda s: None)
    responses.add(responses.GET, BASE_URL, status=429, headers={"Retry-After": "1"})
    responses.add(responses.GET, BASE_URL, json={"artist": {"name": "OK"}}, status=200)

    data = get_with_retry({"method": "artist.getInfo", "artist": "X"})
    assert data["artist"]["name"] == "OK"
    assert len(responses.calls) == 2


@responses.activate
def test_get_with_retry_retries_retryable_lastfm_error_code(monkeypatch):
    monkeypatch.setattr("lastfm.time.sleep", lambda s: None)
    responses.add(responses.GET, BASE_URL,
                   json={"error": 16, "message": "temporary error"}, status=200)
    responses.add(responses.GET, BASE_URL, json={"artist": {"name": "OK"}}, status=200)

    data = get_with_retry({"method": "artist.getInfo", "artist": "X"})
    assert data["artist"]["name"] == "OK"
    assert len(responses.calls) == 2


@responses.activate
def test_get_with_retry_code_6_raises_immediately_without_retry():
    responses.add(responses.GET, BASE_URL,
                   json={"error": 6, "message": "not found"}, status=200)

    with pytest.raises(ArtistNotFoundError):
        get_with_retry({"method": "artist.getInfo", "artist": "nobody"})
    assert len(responses.calls) == 1  # never retried


@responses.activate
def test_get_with_retry_non_retryable_lastfm_error_raises_valueerror():
    responses.add(responses.GET, BASE_URL,
                   json={"error": 10, "message": "invalid api key"}, status=200)

    with pytest.raises(ValueError):
        get_with_retry({"method": "artist.getInfo", "artist": "X"})
    assert len(responses.calls) == 1  # not in RETRYABLE_LASTFM_CODES, no retry


@responses.activate
def test_get_with_retry_exhausts_attempts_and_raises(monkeypatch):
    monkeypatch.setattr("lastfm.time.sleep", lambda s: None)
    for _ in range(3):
        responses.add(responses.GET, BASE_URL, status=500)

    with pytest.raises(requests.exceptions.HTTPError):
        get_with_retry({"method": "artist.getInfo", "artist": "X"}, attempts=3)
    assert len(responses.calls) == 3


@responses.activate
def test_get_with_retry_paces_through_bucket():
    responses.add(responses.GET, BASE_URL, json={"artist": {"name": "OK"}}, status=200)

    calls = []

    class FakeBucket:
        def acquire(self):
            calls.append(1)

    get_with_retry({"method": "artist.getInfo", "artist": "X"}, bucket=FakeBucket())
    assert len(calls) == 1
