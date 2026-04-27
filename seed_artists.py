import os
import logging
import datetime
import argparse
from dotenv import load_dotenv # type:ignore
import requests # type:ignore
import psycopg2 # type:ignore


logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


load_dotenv()
API_KEY = os.getenv("LASTFM_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

if not API_KEY:
    raise SystemExit("ERROR: LASTFM_API_KEY not found.")
if not DATABASE_URL:
    raise SystemExit("ERROR: DATABASE_URL not found.")

BASE_URL = "http://ws.audioscrobbler.com/2.0/"
COMMON_PARAMS = {"api_key": API_KEY, "format": "json"}


def get(params: dict) -> dict:
    response = \
        requests.get(BASE_URL, params={**COMMON_PARAMS, **params}, timeout=10)

    # turns any 400-599 HTTP status into an exception
    response.raise_for_status()

    data = response.json()

    # double check for error messages within 200 response
    if "error" in data:
        raise ValueError(f"Last.fm error {data['error']}: {data['message']}")

    return data


def seed(conn, cur, start, end):
    snapshot_date = datetime.date.today()
    for page in range(start, end + 1):
        # data is full json response converted into a Python dictionary
        data = get({"method": "chart.getTopArtists", "limit": 5, "page": page})
        # artists is a plain Python list of artists
        artists = data["artists"]["artist"]
        log.info(f"Page {page}: {len(artists)} artists")

        for rank, artist in enumerate(artists, start=1):
            name = artist["name"]
            mbid = artist.get("mbid") or None

            cur.execute("""
                INSERT INTO artists(name, mbid)
                VALUES (%s, %s)
                ON CONFLICT (mbid) DO NOTHING
                RETURNING id
            """, (name, mbid))

            row = cur.fetchone()
            if row is None:
                if mbid:
                    cur.execute(
                        "SELECT id FROM artists WHERE mbid = %s", (mbid,))
                else:
                    cur.execute(
                        "SELECT id FROM artists WHERE name = %s", (name,))

                row = cur.fetchone()
            artist_id = row[0]

            cur.execute("""
                INSERT INTO weekly_charts (artist_id, rank, page,
                    snapshot_date)
                VALUES (%s, %s, %s, %s)
            """, (artist_id, rank, page, snapshot_date))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed artists from Last.fm chart")
    parser.add_argument("--start", type=int, default=500)
    parser.add_argument("--end", type=int, default=2000)
    args = parser.parse_args()

    conn = psycopg2.connect(DATABASE_URL) # connection to postgres
    cur = conn.cursor() # used to run sql
    seed(conn, cur, args.start, args.end)
    conn.commit()
    conn.close()