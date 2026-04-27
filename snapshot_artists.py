import os
import logging
import datetime
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
        requests.get(BASE_URL, params={**COMMON_PARAMS, **params}, timeout=30)

    response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise ValueError(f"Last.fm error {data['error']}: {data['message']}")

    return data

def snapshot(conn, cur):
    snapshot_date = datetime.date.today()
    cur.execute("""
        SELECT a.id, a.name, a.mbid
        FROM artists a
        LEFT JOIN artist_snapshots s ON a.id = s.artist_id
        WHERE s.artist_id IS NULL
    """)
    rows = cur.fetchall()

    for i, (artist_id, name, mbid) in enumerate(rows, start=1):
        try:
            if mbid:
                data = get({"method": "artist.getInfo", "mbid": mbid})
            else:
                data = get({"method": "artist.getInfo", "artist": name})
        except ValueError as e:
            log.warning(f"Skipping {name}: {e}")
            continue
        except requests.exceptions.RequestException as e:
            log.warning(f"Skipping {name}: {e}")
            continue

        listeners = data["artist"]["stats"]["listeners"]
        playcount = data["artist"]["stats"]["playcount"]
        log.info(f"Artist {name}, {i}/{len(rows)}")

        cur.execute("""
            INSERT INTO artist_snapshots (artist_id, listeners,
                    playcount, snapshot_date)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (artist_id, snapshot_date) DO NOTHING
        """, (artist_id, listeners, playcount, snapshot_date))


if __name__ == "__main__":
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    snapshot(conn, cur)
    conn.commit()
    conn.close()