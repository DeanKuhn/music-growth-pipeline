import logging
import datetime
import argparse

from db import get_conn, get_or_create_artist
from lastfm import get


logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def seed(conn, cur, start, end):
    snapshot_date = datetime.date.today()
    for page in range(start, end + 1):
        data = get({"method": "chart.getTopArtists", "limit": 5, "page": page})
        artists = data["artists"]["artist"]
        log.info(f"Page {page}: {len(artists)} artists")

        for rank, artist in enumerate(artists, start=1):
            name = artist["name"]
            mbid = artist.get("mbid") or None
            artist_id = get_or_create_artist(cur, name, mbid)

            cur.execute("""
                INSERT INTO weekly_charts (artist_id, rank, page,
                    snapshot_date)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (artist_id, page, rank, snapshot_date)
                    DO NOTHING
            """, (artist_id, rank, page, snapshot_date))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed artists from Last.fm")
    parser.add_argument("--start", type=int, default=500)
    parser.add_argument("--end", type=int, default=2000)
    args = parser.parse_args()

    conn = get_conn()
    cur = conn.cursor()
    seed(conn, cur, args.start, args.end)
    conn.commit()
    conn.close()