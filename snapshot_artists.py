import logging
import datetime

import requests # type:ignore

from db import get_conn
from lastfm import get

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def snapshot(conn, cur):
    snapshot_date = datetime.date.today()
    cur.execute("""
        SELECT a.id, a.name, a.mbid
        FROM artists a
        LEFT JOIN artist_snapshots s
            ON a.id = s.artist_id AND s.snapshot_date = %s
        WHERE s.artist_id IS NULL
    """, (snapshot_date,))
    rows = cur.fetchall()
    for i, (artist_id, name, mbid) in enumerate(rows, start=1):
        try:
            if mbid:
                data = get(
                    {"method": "artist.getInfo", "mbid": mbid}, timeout=30
                )
            else:
                data = get(
                    {"method": "artist.getInfo", "artist": name}, timeout=30
                )
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
    conn = get_conn()
    cur = conn.cursor()
    snapshot(conn, cur)
    conn.commit()
    conn.close()