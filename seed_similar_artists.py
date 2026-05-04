import os
import time
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
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise ValueError(f"Last.fm error {data['error']}: {data['message']}")
    return data


def seed(conn, cur, start, end):
    snapshot_date = datetime.date.today()

    # Fetch indie artists from DB, ordering by listener count
    try:
        cur.execute("""
            SELECT a.id, a.name, a.mbid
            FROM artists a
            JOIN weekly_charts wc ON a.id = wc.artist_id
            JOIN artist_snapshots s ON a.id = s.artist_id
            WHERE wc.page BETWEEN %s AND %s
            ORDER BY s.listeners DESC
            LIMIT 2000
        """, (start, end))
    except Exception as e:
        log.error(f"Could not fetch from DB, error: {e}")
        return

    artists = cur.fetchall()

    # Loop through each artist's similar artists
    for artist in artists:
        artist_id, name, mbid = artist
        try:
            if mbid:
                data = get({"method": "artist.getSimilar", "mbid": mbid, "limit": 20})
            else:
                data = get({"method": "artist.getSimilar", "artist": name, "limit": 20})
            time.sleep(0.2)
        except ValueError as e:
            log.warning(f"Skipping {name}: {e}")
            continue
        except requests.exceptions.RequestException as e:
            log.warning(f"Skipping {name}: {e}")
            continue

        similar_artists = data.get("similarartists", {}).get("artist", [])
        if not similar_artists:
            log.warning(f"No similar artists returned for {name}, skipping.")
            continue

        for similar_artist in similar_artists:
            similar_name = similar_artist.get("name")
            similar_mbid = similar_artist.get("mbid") or None
            similarity_score = similar_artist.get("match")

            if not similar_name or similarity_score is None:
                log.warning(f"Skipping malformed similar artist entry for {name}.")
                continue

            try:
                # Add to artist database if artist isn't there already
                cur.execute("""
                    INSERT INTO artists(name, mbid)
                    VALUES (%s, %s)
                    ON CONFLICT (mbid) DO NOTHING
                    RETURNING id
                """, (similar_name, similar_mbid))

                row = cur.fetchone()
                if row is None:
                    if similar_mbid:
                        cur.execute(
                            "SELECT id FROM artists WHERE mbid = %s", (similar_mbid,))
                    else:
                        cur.execute(
                            "SELECT id FROM artists WHERE name = %s", (similar_name,))

                    row = cur.fetchone()
                similar_artist_id = row[0]

                cur.execute("""
                    INSERT INTO artist_similarities (artist_id, similar_artist_id,
                            similar_name, similar_mbid, similarity_score, fetched_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (artist_id, similar_name) DO NOTHING
                """, (artist_id, similar_artist_id, similar_name, similar_mbid,
                      similarity_score, snapshot_date))

            except psycopg2.Error as e:
                log.warning(f"Skipping similar artist {similar_name} for {name}: {e}")
                conn.rollback()
                continue

        try:
            conn.commit()
            log.info(f"Committed all similar artists for {name}.")
        except psycopg2.Error as e:
            log.error(f"Failed to commit for {name}: {e}")
            conn.rollback()


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