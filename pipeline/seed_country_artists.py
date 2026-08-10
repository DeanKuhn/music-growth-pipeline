import argparse
import logging
import datetime

from db import get_conn, get_or_create_artist
from lastfm import TokenBucket, get_with_retry


logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


# geo.getTopArtists expects ISO 3166 short names, not casual ones
# (e.g. "Korea, Republic of", "Viet Nam", "Russian Federation") —
# confirmed via smoke test against all 50 below.
COUNTRY_LIST = [
    "United States", "United Kingdom", "Canada", "Mexico", "Brazil",
    "Argentina", "Chile", "Colombia", "Germany", "France", "Spain", "Italy",
    "Netherlands", "Sweden", "Norway", "Finland", "Poland", "Russian Federation",
    "Ukraine", "Portugal", "Ireland", "Belgium", "Austria", "Switzerland",
    "Greece", "Turkey", "Japan", "Korea, Republic of", "China", "India",
    "Indonesia", "Philippines", "Thailand", "Viet Nam", "Australia",
    "New Zealand", "South Africa", "Nigeria", "Egypt", "Israel",
    "Saudi Arabia", "United Arab Emirates", "Czech Republic", "Hungary",
    "Romania", "Denmark", "Iceland", "Peru", "Venezuela", "Malaysia",
]


def seed(conn, cur, artist_limit=200, country_limit=None, dry_run=False):
    snapshot_date = datetime.date.today()
    bucket = TokenBucket(rate=4.0, capacity=5.0)
    countries = COUNTRY_LIST[:country_limit] if country_limit else COUNTRY_LIST

    if dry_run:
        log.info(f"Would seed {len(countries)} countries: {countries}")
        return

    i = 0
    for country in countries:
        try:
            cur.execute("""
                INSERT INTO countries(country, fetched_at)
                VALUES (%s, %s)
                ON CONFLICT (country) DO NOTHING
                RETURNING id
            """, (country, snapshot_date))

            row = cur.fetchone()
            if row is None:
                cur.execute("SELECT id FROM countries WHERE country = %s", (country,))
                country_id = cur.fetchone()[0]
            else:
                country_id = row[0]

            log.info(f"{country} inserted into countries | id = {country_id}")

            data = get_with_retry(
                {"method": "geo.getTopArtists", "country": country, "limit": artist_limit},
                bucket=bucket, timeout=30)
            artists = data.get("topartists", {}).get("artist", [])

            for artist in artists:
                i += 1
                try:
                    name = artist["name"]
                    mbid = artist.get("mbid") or None

                    artist_id = get_or_create_artist(cur, name, mbid)

                    rank_in_country = int(artist["@attr"]["rank"])

                    cur.execute("""
                        INSERT INTO country_artists(
                            country_id, artist_id, rank_in_country, fetched_at
                        )
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (country_id, artist_id) DO NOTHING
                    """, (country_id, artist_id, rank_in_country, snapshot_date))

                    if i % 50 == 0:
                        log.info(f"Currently on artist {i}")

                except Exception as e:
                    log.warning(
                        f"Skipping {artist.get('name', '?')} in {country}: {e}")
                    continue

            conn.commit()
            log.info(f"Committed {country} ({len(artists)} artists)")

        except Exception as e:
            log.warning(f"Skipping country {country}: {e}")
            conn.rollback()
            continue


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--artist-limit", type=int, default=200,
        help="Per-country artist cap passed to geo.getTopArtists.",
    )
    parser.add_argument(
        "--country-limit", type=int, default=None,
        help="Cap the number of countries processed, for dry runs / smoke tests.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Log the country list only; no API calls, no writes.",
    )
    args = parser.parse_args()

    conn = get_conn()
    cur = conn.cursor()
    seed(conn, cur, artist_limit=args.artist_limit,
         country_limit=args.country_limit, dry_run=args.dry_run)
    conn.close()
