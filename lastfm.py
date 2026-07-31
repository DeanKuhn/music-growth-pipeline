import os
from dotenv import load_dotenv  # type:ignore
import requests  # type:ignore

load_dotenv()

API_KEY = os.getenv("LASTFM_API_KEY")
if not API_KEY:
    raise SystemExit("ERROR: LASTFM_API_KEY not found.")

BASE_URL = "https://ws.audioscrobbler.com/2.0/"
COMMON_PARAMS = {"api_key": API_KEY, "format": "json"}


def get(params: dict, timeout: int = 10) -> dict:
    response = requests.get(
        BASE_URL, params={**COMMON_PARAMS, **params}, timeout=timeout)
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise ValueError(f"Last.fm error {data['error']}: {data['message']}")
    return data