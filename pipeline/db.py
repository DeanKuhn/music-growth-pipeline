import os
from dotenv import load_dotenv  # type:ignore
import psycopg2  # type:ignore

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise SystemExit("ERROR: DATABASE_URL not found.")


def get_conn():
    return psycopg2.connect(DATABASE_URL)


TRACKED_ARTIST_FILTER = """(
    EXISTS (SELECT 1 FROM weekly_charts tp_wc WHERE tp_wc.artist_id = a.id)
    OR EXISTS (SELECT 1 FROM genre_artists tp_ga WHERE tp_ga.artist_id = a.id)
    OR EXISTS (SELECT 1 FROM country_artists tp_ca WHERE tp_ca.artist_id = a.id)
    OR EXISTS (SELECT 1 FROM artist_snapshots tp_hist WHERE tp_hist.artist_id = a.id)
)"""


def get_or_create_artist(cur, name, mbid=None):
    """Return the artist id for this name, inserting if new."""
    cur.execute("""
        INSERT INTO artists (name, mbid) VALUES (%s, %s)
        ON CONFLICT (lower(btrim(name))) DO UPDATE
            SET mbid = COALESCE(artists.mbid, EXCLUDED.mbid)
        RETURNING id
    """, (name, mbid))
    return cur.fetchone()[0]