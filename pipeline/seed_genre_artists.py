import logging
import datetime
import time

from db import get_conn, get_or_create_artist
from lastfm import get


logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


GENRE_LIST = ["rock", "pop", "metal", "country", "hip-hop", "electronic",
              "folk", "indie", "jazz", "classical", "r&b", "punk", "ambient",
              "edm", "alternative"]


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

            data = get(
                {"method": "tag.getTopArtists", "tag": genre, "limit": 500}
            )
            time.sleep(0.5)
            artists = data.get("topartists", {}).get("artist", [])

            for artist in artists:
                i += 1
                try:
                    name = artist["name"]
                    mbid = artist.get("mbid") or None

                    artist_id = get_or_create_artist(cur, name, mbid)

                    rank_in_genre = int(artist["@attr"]["rank"])

                    cur.execute("""
                        INSERT INTO genre_artists(
                            genre_id, artist_id, rank_in_genre, fetched_at
                        )
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (genre_id, artist_id) DO NOTHING
                    """, (genre_id, artist_id, rank_in_genre, snapshot_date))

                    if i % 50 == 0:
                        log.info(f"Currently on artist {i}")

                except Exception as e:
                    log.warning(
                        f"Skipping {artist.get('name', '?')} in {genre}: {e}")
                    continue

            conn.commit()
            log.info(f"Committed {genre} ({len(artists)} artists)")

        except Exception as e:
            log.warning(f"Skipping genre {genre}: {e}")
            conn.rollback()
            continue


if __name__ == "__main__":
    conn = get_conn()
    cur = conn.cursor()
    seed(conn, cur)
    conn.commit()
    conn.close()