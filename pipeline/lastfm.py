import os
import random
import threading
import time

from dotenv import load_dotenv  # type:ignore
import requests  # type:ignore

load_dotenv()

API_KEY = os.getenv("LASTFM_API_KEY")
if not API_KEY:
    raise SystemExit("ERROR: LASTFM_API_KEY not found.")

BASE_URL = "https://ws.audioscrobbler.com/2.0/"
COMMON_PARAMS = {"api_key": API_KEY, "format": "json"}

RETRYABLE_HTTP = {429, 500, 502, 503, 504}
RETRYABLE_LASTFM_CODES = {8, 11, 16, 29}
NOT_FOUND_CODE = 6


def _escape_literal_plus(params: dict) -> dict:
    return {
        k: v.replace("+", "%2B") if isinstance(v, str) else v
        for k, v in params.items()
    }


def get(params: dict, timeout: int = 10) -> dict:
    response = requests.get(
        BASE_URL, params=_escape_literal_plus({**COMMON_PARAMS, **params}),
        timeout=timeout)
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise ValueError(f"Last.fm error {data['error']}: {data['message']}")
    return data


class ArtistNotFoundError(Exception):
    """Last.fm error code 6 — the artist doesn't exist. Never retried."""


class TokenBucket:
    """Shared rate limiter for concurrent callers.

    Refills at `rate` tokens/sec up to `capacity`. `acquire()` blocks the
    calling thread until a token is available. This is the actual request
    throttle; a ThreadPoolExecutor's worker count only hides per-request
    latency, it doesn't bound request rate on its own.
    """

    def __init__(self, rate: float = 4.0, capacity: float = 5.0):
        self.rate = rate
        self.capacity = capacity
        self.tokens = capacity
        self.updated = time.monotonic()
        self.lock = threading.Lock()

    def acquire(self):
        while True:
            with self.lock:
                now = time.monotonic()
                self.tokens = min(
                    self.capacity,
                    self.tokens + (now - self.updated) * self.rate,
                )
                self.updated = now
                if self.tokens >= 1:
                    self.tokens -= 1
                    return
            time.sleep(0.05)


def _backoff_delay(attempt: int) -> float:
    """Jittered exponential backoff: ~2s, ~4s, ~8s (+0-0.5s jitter)."""
    return (2 ** attempt) + random.uniform(0, 0.5)


def get_with_retry(
    params: dict,
    bucket: "TokenBucket | None" = None,
    session: "requests.Session | None" = None,
    timeout: int = 10,
    attempts: int = 3,
) -> dict:
    """Like `get()`, but paces through `bucket` (if given) and retries
    transient failures with backoff. Raises ArtistNotFoundError on Last.fm
    code 6 without retrying it.
    """
    requester = session or requests

    for attempt in range(1, attempts + 1):
        if bucket is not None:
            bucket.acquire()

        try:
            response = requester.get(
                BASE_URL,
                params=_escape_literal_plus({**COMMON_PARAMS, **params}),
                timeout=timeout)
        except requests.exceptions.RequestException:
            if attempt == attempts:
                raise
            time.sleep(_backoff_delay(attempt))
            continue

        if response.status_code in RETRYABLE_HTTP:
            if attempt == attempts:
                response.raise_for_status()
            retry_after = response.headers.get("Retry-After")
            delay = float(retry_after) if retry_after else _backoff_delay(attempt)
            time.sleep(delay)
            continue

        response.raise_for_status()
        data = response.json()

        if "error" in data:
            code = data["error"]
            if code == NOT_FOUND_CODE:
                raise ArtistNotFoundError(data["message"])
            if code in RETRYABLE_LASTFM_CODES and attempt < attempts:
                time.sleep(_backoff_delay(attempt))
                continue
            raise ValueError(f"Last.fm error {code}: {data['message']}")

        return data

    raise RuntimeError("unreachable")  # loop always returns or raises