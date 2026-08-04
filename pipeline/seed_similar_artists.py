import time
import logging
import datetime
import argparse
import requests # type:ignore

import psycopg2 # type:ignore

from db import get_conn, get_or_create_artist
from lastfm import get


logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def seed(conn, cur, start, end):
    snapshot_date = datetime.date.today()
    try:
        cur.execute("""
            SELECT a.id, a.name, a.mbid
            FROM artists a
            JOIN weekly_charts wc ON a.id = wc.artist_id
            WHERE wc.page BETWEEN %s AND %s
              AND NOT EXISTS (
                  SELECT 1 FROM artist_similarities s WHERE s.artist_id = a.id
              )
            GROUP BY a.id, a.name, a.mbid
            ORDER BY min((wc.page - 1) * 5 + wc.rank)
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
                data = get(
                    {"method": "artist.getSimilar", "mbid": mbid, "limit": 20}
                )
            else:
                data = get(
                    {"method": "artist.getSimilar", "artist": name, "limit": 20}
                )
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
                log.warning(
                    f"Skipping malformed similar artist entry for {name}."
                )
                continue

            try:
                similar_artist_id = get_or_create_artist(
                    cur, similar_name, similar_mbid
                )

                cur.execute("""
                    INSERT INTO artist_similarities (
                        artist_id, similar_artist_id, similar_name,
                        similar_mbid, similarity_score, fetched_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (artist_id, similar_name) DO NOTHING
                """, (artist_id, similar_artist_id, similar_name, similar_mbid,
                      similarity_score, snapshot_date))

            except psycopg2.Error as e:
                log.warning(
                    f"Skipping similar artist {similar_name} for {name}: {e}"
                )
                conn.rollback()
                continue

        try:
            conn.commit()
            log.info(f"Committed all similar artists for {name}.")
        except psycopg2.Error as e:
            log.error(f"Failed to commit for {name}: {e}")
            conn.rollback()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed artists from Last.fm")
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--end", type=int, default=2000)
    args = parser.parse_args()

    conn = get_conn()
    cur = conn.cursor()
    seed(conn, cur, args.start, args.end)
    conn.commit()
    conn.close()