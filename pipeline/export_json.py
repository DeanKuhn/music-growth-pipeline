"""Connect to postgres and write JSON files for the static site."""

import json
import os

from datetime import date
from decimal import Decimal

from psycopg2.extras import RealDictCursor

from db import get_conn


OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "data")


def serialize(obj):
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Not serializable: {type(obj)}")


def write_json(path, data):
    full = os.path.join(OUTPUT_DIR, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        json.dump(data, f, default=serialize)


def export_artist_profiles(cur):
    cur.execute("""
        select slug, display_name, mbid, size_band, size_band_sort,
               listener_percentile, genres, primary_genre, min_page,
               global_rank, weeks_tracked, series_start_date, series_end_date,
               starting_listeners, latest_listeners, latest_playcount,
               total_listener_delta, total_pct_growth, avg_weekly_pct_change,
               pct_rank_in_size_band, pct_rank_in_genre
        from api_artist_profile
    """)
    profiles = cur.fetchall()
    for row in profiles:
        write_json(f"artists/{row['slug']}.json", dict(row))
    print(f"  profiles: {len(profiles)} artists")


def export_search_index(cur):
    cur.execute("""
        select slug, display_name, size_band, latest_listeners
        from api_artist_search
        order by latest_listeners desc
    """)
    rows = cur.fetchall()
    write_json("search_index.json", [dict(r) for r in rows])
    print(f"  search index: {len(rows)} artists")


def main():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    print("Exporting JSON...")
    export_artist_profiles(cur)
    export_search_index(cur)
    # TODO: export_timeseries(cur)     — fold into artist files
    # TODO: export_similar(cur)        — fold into artist files
    # TODO: export_leaderboards(cur)
    # TODO: export_genres(cur)
    # TODO: export_cohorts(cur)
    # TODO: export_stats(cur)

    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
