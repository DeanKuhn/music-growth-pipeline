import os
import logging
import datetime
from dotenv import load_dotenv # type:ignore
import requests # type:ignore
import psycopg2 # type:ignore
import time


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

GENRE_LIST = ["rock", "pop", "metal", "country", "hip-hop", "electronic",
              "folk", "indie", "jazz", "classical", "r&b", "punk", "ambient",
              "edm", "alternative"]


def get(params: dict) -> dict:
    response = \
        requests.get(BASE_URL, params={**COMMON_PARAMS, **params}, timeout=10)
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise ValueError(f"Last.fm error {data['error']}: {data['message']}")
    return data


def seed(conn, cur):
    snapshot_date = datetime.date.today()
    i = 0

    for genre in GENRE_LIST:
        try:
            cur.execute("""
                INSERT INTO genres(genre, fetched_at)
                VALUES (%s, %s)
                ON CONFLICT (genre) DO NOTHING
                RETURNING id
            """, (genre, snapshot_date))

            row = cur.fetchone()
            if row is None:
                cur.execute("SELECT id FROM genres WHERE genre = %s", (genre,))
                genre_id = cur.fetchone()[0]
            else:
                genre_id = row[0]

            log.info(f"{genre} inserted into genres | id = {genre_id}")

            data = get({"method": "tag.getTopArtists", "tag": genre, "limit": 500})
            time.sleep(0.5)
            artists = data.get("topartists", {}).get("artist", [])

            for artist in artists:
                i += 1
                try:
                    name = artist["name"]
                    mbid = artist.get("mbid") or None

                    # Prefer mbid lookup — more reliable than name across endpoints
                    if mbid:
                        cur.execute(
                            "SELECT id FROM artists WHERE mbid = %s", (mbid,))
                    else:
                        cur.execute(
                            "SELECT id FROM artists WHERE name = %s", (name,))
                    row = cur.fetchone()
                    artist_id = row[0] if row else None

                    if artist_id is None:
                        cur.execute("""
                            INSERT INTO artists(name, mbid)
                            VALUES (%s, %s)
                            ON CONFLICT (mbid) DO NOTHING
                            RETURNING id
                        """, (name, mbid))
                        row = cur.fetchone()
                        if row is None:
                            cur.execute(
                                "SELECT id FROM artists WHERE mbid = %s", (mbid,))
                            artist_id = cur.fetchone()[0]
                        else:
                            artist_id = row[0]

                    rank_in_genre = int(artist["@attr"]["rank"])

                    cur.execute("""
                        INSERT INTO genre_artists(genre_id, artist_id, rank_in_genre,
                            fetched_at)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (genre_id, artist_id) DO NOTHING
                    """, (genre_id, artist_id, rank_in_genre, snapshot_date))

                    if i % 50 == 0:
                        log.info(f"Currently on artist {i}")

                except Exception as e:
                    log.warning(
                        f"Skipping artist {artist.get('name', '?')} in {genre}: {e}")
                    continue

            conn.commit()
            log.info(f"Committed {genre} ({len(artists)} artists)")

        except Exception as e:
            log.warning(f"Skipping genre {genre}: {e}")
            conn.rollback()
            continue


if __name__ == "__main__":
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    seed(conn, cur)
    conn.commit()
    conn.close()