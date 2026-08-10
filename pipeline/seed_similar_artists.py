import logging
import datetime
import argparse
import requests # type:ignore

import psycopg2 # type:ignore

from db import get_conn, get_or_create_artist, TRACKED_ARTIST_FILTER
from lastfm import ArtistNotFoundError, TokenBucket, get_with_retry


logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def seed(conn, cur, limit=None):
    snapshot_date = datetime.date.today()
    bucket = TokenBucket(rate=4.0, capacity=5.0)

    try:
        query = f"""
            SELECT a.id, a.name, a.mbid
            FROM artists a
            LEFT JOIN weekly_charts wc ON a.id = wc.artist_id
            WHERE NOT EXISTS (
                SELECT 1 FROM artist_similarities s WHERE s.artist_id = a.id
            )
            AND {TRACKED_ARTIST_FILTER}
            GROUP BY a.id, a.name, a.mbid
            ORDER BY
                (min(wc.artist_id) IS NULL) ASC,
                min(coalesce((wc.page - 1) * 5 + wc.rank, 999999))
        """
        params = []
        if limit:
            query += " LIMIT %s"
            params.append(limit)
        cur.execute(query, params)
    except Exception as e:
        log.error(f"Could not fetch from DB, error: {e}")
        return

    artists = cur.fetchall()
    total = len(artists)
    log.info(f"{total} artists to fetch")

    # Loop through each artist's similar artists
    for i, artist in enumerate(artists, start=1):
        artist_id, name, mbid = artist
        try:
            if mbid:
                try:
                    data = get_with_retry(
                        {"method": "artist.getSimilar", "mbid": mbid, "limit": 20},
                        bucket=bucket, timeout=30
                    )
                except ArtistNotFoundError:
                    data = get_with_retry(
                        {"method": "artist.getSimilar", "artist": name, "limit": 20},
                        bucket=bucket, timeout=30
                    )
            else:
                data = get_with_retry(
                    {"method": "artist.getSimilar", "artist": name, "limit": 20},
                    bucket=bucket, timeout=30
                )
        except ArtistNotFoundError as e:
            log.warning(f"Skipping {name}: {e}")
            continue
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
        except psycopg2.Error as e:
            log.error(f"Failed to commit for {name}: {e}")
            conn.rollback()

        if i % 100 == 0 or i == total:
            pct = 100 * i / total
            log.info(f"Progress: {i}/{total} ({pct:.1f}%) — last: {name}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed artists from Last.fm")
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Cap the number of artists processed this run.",
    )
    args = parser.parse_args()

    conn = get_conn()
    cur = conn.cursor()
    seed(conn, cur, limit=args.limit)
    conn.commit()
    conn.close()