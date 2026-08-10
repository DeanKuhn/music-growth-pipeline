import argparse
import datetime
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests  # type:ignore
from psycopg2.extras import execute_values  # type:ignore

from db import get_conn, TRACKED_ARTIST_FILTER
from lastfm import ArtistNotFoundError, TokenBucket, get_with_retry

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

BATCH_SIZE = 500


def week_anchor(today=None):
    """Most recent Sunday on or before `today`."""
    today = today or datetime.date.today()
    return today - datetime.timedelta(days=(today.weekday() + 1) % 7)


def fetch_one(artist_id, name, mbid, bucket, get_session):
    """Runs in a worker thread. Never touches the DB — only HTTP.

    Returns (artist_id, listeners, playcount, error_code):
    error_code is None on success, 6 if Last.fm confirms the artist
    doesn't exist, or -1 for a transient failure (network/rate-limit/
    unexpected error) that should just be left for next week's worklist.
    """
    session = get_session()
    try:
        if mbid:
            try:
                data = get_with_retry(
                    {"method": "artist.getInfo", "mbid": mbid},
                    bucket=bucket, session=session, timeout=30)
            except ArtistNotFoundError:
                data = get_with_retry(
                    {"method": "artist.getInfo", "artist": name},
                    bucket=bucket, session=session, timeout=30)
        else:
            data = get_with_retry(
                {"method": "artist.getInfo", "artist": name},
                bucket=bucket, session=session, timeout=30)
        listeners = int(data["artist"]["stats"]["listeners"])
        playcount = int(data["artist"]["stats"]["playcount"])
        return artist_id, listeners, playcount, None
    except ArtistNotFoundError:
        return artist_id, None, None, 6
    except (ValueError, requests.exceptions.RequestException) as e:
        log.warning(f"Skipping {name} this run: {e}")
        return artist_id, None, None, -1


def flush_batch(cur, conn, snapshot_date, good_batch, dead_batch):
    if good_batch:
        execute_values(cur, """
            INSERT INTO artist_snapshots (artist_id, listeners, playcount,
                    snapshot_date)
            VALUES %s
            ON CONFLICT (artist_id, snapshot_date) DO NOTHING
        """, [(aid, listeners, playcount, snapshot_date)
              for aid, listeners, playcount in good_batch])
    if dead_batch:
        execute_values(cur, """
            UPDATE artists SET last_error_code = 6, last_error_at = now()
            FROM (VALUES %s) AS d(id)
            WHERE artists.id = d.id
        """, [(aid,) for aid in dead_batch])
    conn.commit()
    log.info(f"Committed batch: {len(good_batch)} snapshots, "
             f"{len(dead_batch)} newly-dead artists")


def snapshot(conn, cur, snapshot_date=None, max_workers=10, limit=None):
    snapshot_date = snapshot_date or week_anchor()
    log.info(f"Snapshot date: {snapshot_date}")

    query = f"""
        SELECT a.id, a.name, a.mbid
        FROM artists a
        LEFT JOIN artist_snapshots s
            ON a.id = s.artist_id AND s.snapshot_date = %s
        WHERE s.artist_id IS NULL
          AND (a.last_error_code IS NULL OR a.last_error_code <> 6)
          AND {TRACKED_ARTIST_FILTER}
    """
    params = [snapshot_date]
    if limit:
        query += " LIMIT %s"
        params.append(limit)
    cur.execute(query, params)
    rows = cur.fetchall()
    log.info(f"{len(rows)} artists to fetch")

    bucket = TokenBucket(rate=4.0, capacity=5.0)
    thread_local = threading.local()

    def get_session():
        if not hasattr(thread_local, "session"):
            session = requests.Session()
            adapter = requests.adapters.HTTPAdapter(pool_maxsize=max_workers) # type:ignore
            session.mount("https://", adapter)
            thread_local.session = session
        return thread_local.session

    good_batch, dead_batch = [], []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {
            pool.submit(fetch_one, artist_id, name, mbid, bucket, get_session): artist_id
            for artist_id, name, mbid in rows
        }
        for i, future in enumerate(as_completed(futures), start=1):
            artist_id, listeners, playcount, error_code = future.result()

            if error_code == 6:
                dead_batch.append(artist_id)
            elif error_code is None:
                good_batch.append((artist_id, listeners, playcount))
            # error_code == -1: transient failure, leave for next run

            if len(good_batch) >= BATCH_SIZE or len(dead_batch) >= BATCH_SIZE:
                flush_batch(cur, conn, snapshot_date, good_batch, dead_batch)
                good_batch, dead_batch = [], []

            if i % 500 == 0 or i == len(rows):
                log.info(f"Processed {i}/{len(rows)}")

    flush_batch(cur, conn, snapshot_date, good_batch, dead_batch)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--date",
        type=datetime.date.fromisoformat,
        default=None,
        help="Pin the snapshot to this YYYY-MM-DD instead of the current "
             "week's Sunday. Use when resuming an interrupted run.",
    )
    parser.add_argument(
        "--max-workers", type=int, default=10,
        help="HTTP thread pool size. Only hides per-request latency — the "
             "shared token bucket is what actually caps request rate.",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Cap the worklist size, for dry runs / smoke tests.",
    )
    args = parser.parse_args()

    conn = get_conn()
    cur = conn.cursor()
    snapshot(conn, cur, snapshot_date=args.date, max_workers=args.max_workers,
              limit=args.limit)
    conn.close()
