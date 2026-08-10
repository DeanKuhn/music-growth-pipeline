import argparse
import logging
import datetime

from db import get_conn, get_or_create_artist
from lastfm import TokenBucket, get_with_retry


logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


# chart.getTopTags mixes real genres with folksonomy/non-genre tags
# (usage tags, decades, vocalist labels, personal-list tags).
NON_GENRE_TAGS = {
    "seen live", "female vocalists", "female vocalist", "male vocalists",
    "bookmark", "favorites", "albums i own", "love", "beautiful", "cover",
    "mellow", "guitar", "piano", "80s", "90s", "00s", "70s", "60s",
}


def fetch_top_tags(bucket, limit=100):
    data = get_with_retry(
        {"method": "chart.getTopTags", "limit": min(limit, 100)},
        bucket=bucket, timeout=30)
    tags = data.get("tags", {}).get("tag", [])
    names = dict.fromkeys(t["name"].strip().lower() for t in tags)
    return [t for t in names if t not in NON_GENRE_TAGS][:limit]


def seed(conn, cur, tag_limit=500, genre_limit=100, dry_run=False):
    snapshot_date = datetime.date.today()
    bucket = TokenBucket(rate=4.0, capacity=5.0)

    genre_list = fetch_top_tags(bucket, limit=genre_limit)
    log.info(f"Fetched {len(genre_list)} tags: {genre_list}")
    if dry_run:
        return

    i = 0
    for genre in genre_list:
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

            data = get_with_retry(
                {"method": "tag.getTopArtists", "tag": genre, "limit": tag_limit},
                bucket=bucket, timeout=30)
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
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--limit", type=int, default=100,
        help="Number of top tags to use as genres.",
    )
    parser.add_argument(
        "--tag-limit", type=int, default=500,
        help="Per-genre artist cap passed to tag.getTopArtists.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Fetch and log the tag list only; no API calls beyond that, no writes.",
    )
    args = parser.parse_args()

    conn = get_conn()
    cur = conn.cursor()
    seed(conn, cur, tag_limit=args.tag_limit, genre_limit=args.limit,
         dry_run=args.dry_run)
    conn.close()
